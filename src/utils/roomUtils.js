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
export async function createRoom(mode, characters) {
  const code = generateRoomCode()
  const room = {
    code,
    mode,
    characters,
    messages: [],
    createdAt: new Date().toISOString(),
  }

  if (isSupabaseConfigured) {
    const { error } = await supabase.from('rooms').insert({
      code,
      mode,
      characters,
      messages: [],
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
      const room = {
        code: data.code,
        mode: data.mode,
        characters: data.characters,
        messages: data.messages || [],
        createdAt: data.created_at,
      }
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
 * Safe to fire-and-forget (won't throw).
 */
export async function updateRoomMessages(code, messages) {
  const upper = code.toUpperCase()

  const cached = lsLoad(upper)
  if (cached) lsSave(upper, { ...cached, messages })

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('rooms')
        .update({ messages })
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

// Kept for legacy callers — synchronous localStorage-only write
export function saveRoom(code, roomData) {
  lsSave(code.toUpperCase(), roomData)
}
