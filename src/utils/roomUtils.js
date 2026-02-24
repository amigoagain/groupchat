import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

const LS_PREFIX = 'groupchat_room_'

// ─── helpers ────────────────────────────────────────────────────────────────

export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length))
  return code
}

export function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ─── localStorage helpers ────────────────────────────────────────────────────

function lsSave(code, roomData) {
  try { localStorage.setItem(LS_PREFIX + code, JSON.stringify(roomData)) } catch {}
}

function lsLoad(code) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + code.toUpperCase())
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// ─── Map Supabase row → room object ──────────────────────────────────────────

function rowToRoom(data) {
  return {
    code: data.code,
    mode: data.mode,
    characters: data.characters,
    messages: data.messages || [],
    createdAt: data.created_at,
    createdBy: data.created_by || null,
    lastMessagePreview: data.last_message_preview || null,
    lastActivity: data.last_activity || data.created_at,
    participantCount: data.participant_count || 0,
  }
}

// ─── Supabase diagnostic ─────────────────────────────────────────────────────

/**
 * Quick connectivity check — call once on startup to catch RLS / table issues.
 * Logs clearly to the browser console so problems are easy to spot.
 */
export async function diagnoseSupabase() {
  if (!isSupabaseConfigured) {
    console.info('[GroupChat] Supabase not configured — running in localStorage-only mode.')
    return false
  }

  const { error } = await supabase
    .from('rooms')
    .select('code')
    .limit(1)

  if (error) {
    console.error(
      '[GroupChat] ⚠️  Supabase rooms table is NOT accessible.\n' +
      `  Code: ${error.code}  Message: ${error.message}\n` +
      '  Most likely cause: missing RLS policies or table does not exist.\n' +
      '  Run supabase-room-setup.sql in your Supabase SQL editor to fix this.'
    )
    return false
  }

  console.info('[GroupChat] ✓ Supabase rooms table is accessible.')
  return true
}

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Create a new room.
 * Saves to Supabase first (fully awaited), then caches in localStorage.
 * If Supabase fails the room is still usable locally — but we log the error
 * clearly so it's obvious the shared link won't work.
 */
export async function createRoom(mode, characters, createdBy = null) {
  const code = generateRoomCode()
  const now = new Date().toISOString()
  const room = {
    code,
    mode,
    characters,
    messages: [],
    createdAt: now,
    createdBy,
    lastMessagePreview: null,
    lastActivity: now,
    participantCount: 1,
  }

  if (isSupabaseConfigured) {
    const { error } = await supabase.from('rooms').insert({
      code,
      mode,
      characters,
      messages: [],
      created_by: createdBy,
      last_activity: now,
      participant_count: 1,
    })

    if (error) {
      console.error(
        `[GroupChat] ❌ createRoom Supabase insert FAILED for room ${code}.\n` +
        `  Code: ${error.code}  Message: ${error.message}\n` +
        '  This room exists only in localStorage — shared links will NOT work.'
      )
    } else {
      console.info(`[GroupChat] ✓ Room ${code} saved to Supabase.`)
    }
  }

  lsSave(code, room)
  return room
}

/**
 * Load a room by code. Tries Supabase first, falls back to localStorage.
 * Logs clearly so URL-sharing failures are easy to diagnose in the console.
 */
export async function loadRoom(code) {
  const upper = code.trim().toUpperCase()

  if (isSupabaseConfigured) {
    console.info(`[GroupChat] Looking up room ${upper} in Supabase…`)

    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', upper)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // "no rows returned" — room genuinely does not exist in the DB
        console.warn(`[GroupChat] Room ${upper} not found in Supabase (no matching row).`)
      } else {
        // Any other error = RLS policy blocking, table missing, network issue, etc.
        console.error(
          `[GroupChat] ❌ Supabase loadRoom error for ${upper}.\n` +
          `  Code: ${error.code}  Message: ${error.message}\n` +
          '  Falling back to localStorage. Run supabase-room-setup.sql if this persists.'
        )
      }
    } else if (data) {
      console.info(`[GroupChat] ✓ Room ${upper} loaded from Supabase.`)
      const room = rowToRoom(data)
      lsSave(upper, room)
      return room
    }
  }

  const local = lsLoad(upper)
  if (local) {
    console.info(`[GroupChat] Room ${upper} loaded from localStorage (local device only).`)
  } else {
    console.warn(`[GroupChat] Room ${upper} not found in Supabase or localStorage.`)
  }
  return local
}

/**
 * Update just the messages array for a room in both Supabase and localStorage.
 * Also updates last_message_preview and last_activity for inbox display.
 * Safe to fire-and-forget (won't throw).
 */
export async function updateRoomMessages(code, messages) {
  const upper = code.toUpperCase()
  const now = new Date().toISOString()

  const cached = lsLoad(upper)
  if (cached) lsSave(upper, { ...cached, messages, lastActivity: now })

  if (isSupabaseConfigured) {
    try {
      // Build the last message preview from the most recent character message
      const lastCharMsg = [...messages].reverse().find(m => m.type === 'character')
      const preview = lastCharMsg
        ? `${lastCharMsg.characterName}: ${lastCharMsg.content.slice(0, 80).replace(/\n/g, ' ')}`
        : null

      const { error } = await supabase
        .from('rooms')
        .update({
          messages,
          last_activity: now,
          ...(preview ? { last_message_preview: preview } : {}),
        })
        .eq('code', upper)
      if (error) {
        console.error(
          `[GroupChat] ❌ updateRoomMessages failed for ${upper}.\n` +
          `  Code: ${error.code}  Message: ${error.message}`
        )
      }
    } catch (err) {
      console.error(`[GroupChat] updateRoomMessages threw for ${upper}:`, err)
    }
  }
}

/**
 * Fetch only the messages array from Supabase (used for polling).
 * Returns null if Supabase is unavailable or the room doesn't exist.
 */
export async function fetchRoomMessages(code) {
  if (!isSupabaseConfigured) return null
  try {
    const { data, error } = await supabase
      .from('rooms')
      .select('messages')
      .eq('code', code.toUpperCase())
      .single()
    if (error || !data) return null
    return data.messages || null
  } catch {
    return null
  }
}

/**
 * Fetch rooms by an array of codes (for "My Chats" inbox tab).
 * Preserves the input codes order (most recently visited first).
 * Falls back to localStorage for codes not found in Supabase.
 */
export async function fetchMyRooms(codes) {
  if (!codes || codes.length === 0) return []

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('code, mode, characters, created_at, created_by, last_message_preview, last_activity, participant_count')
        .in('code', codes)

      if (!error && data) {
        const byCode = Object.fromEntries(data.map(r => [r.code, rowToRoom(r)]))
        // Re-order to match the input codes order (most recently visited first)
        return codes.map(c => byCode[c]).filter(Boolean)
      }
    } catch (err) {
      console.warn('[GroupChat] fetchMyRooms Supabase error, falling back:', err)
    }
  }

  // Fallback: localStorage
  return codes.map(c => lsLoad(c)).filter(Boolean)
}

/**
 * Fetch all public rooms from Supabase, sorted by most recent activity.
 * Returns an empty array if Supabase is unavailable.
 */
export async function fetchAllRooms() {
  if (!isSupabaseConfigured) return []
  try {
    const { data, error } = await supabase
      .from('rooms')
      .select('code, mode, characters, created_at, created_by, last_message_preview, last_activity, participant_count')
      .order('last_activity', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(50)

    if (!error && data) return data.map(rowToRoom)
  } catch (err) {
    console.warn('[GroupChat] fetchAllRooms error:', err)
  }
  return []
}

/**
 * Increment the participant count for a room (fire-and-forget).
 */
export async function incrementParticipantCount(code) {
  if (!isSupabaseConfigured) return
  try {
    const { data } = await supabase
      .from('rooms')
      .select('participant_count')
      .eq('code', code.toUpperCase())
      .single()

    if (data) {
      const newCount = (data.participant_count || 0) + 1
      await supabase
        .from('rooms')
        .update({ participant_count: newCount })
        .eq('code', code.toUpperCase())
    }
  } catch {
    // Non-critical — ignore errors
  }
}

// Kept for legacy callers — synchronous localStorage-only write
export function saveRoom(code, roomData) {
  lsSave(code.toUpperCase(), roomData)
}
