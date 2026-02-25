/**
 * roomUtils.js
 * ─────────────────────────────────────────────────────────────
 * All reads and writes for the rooms table.
 * Messages are now in the messages table — see messageUtils.js.
 * ─────────────────────────────────────────────────────────────
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

const LS_PREFIX = 'groupchat_room_'

// ── Helpers ───────────────────────────────────────────────────────────────────

export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length))
  return code
}

export function formatTime(isoString) {
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// ── localStorage helpers (room metadata only — no messages) ──────────────────

function lsSave(code, roomData) {
  try { localStorage.setItem(LS_PREFIX + code, JSON.stringify(roomData)) } catch {}
}

function lsLoad(code) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + code.toUpperCase())
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// ── Row → room object ─────────────────────────────────────────────────────────

export function rowToRoom(data) {
  return {
    id:                  data.id,
    code:                data.code,
    mode:                data.mode,
    characters:          data.characters || [],
    createdAt:           data.created_at,
    createdByUserId:     data.created_by_user_id || null,
    createdByName:       data.created_by_name || 'Guest',
    lastMessagePreview:  data.last_message_preview || null,
    lastActivity:        data.last_activity || data.created_at,
    participantCount:    data.participant_count || 0,
    visibility:          data.visibility || 'private',
    parentRoomId:        data.parent_room_id || null,
    branchedAtSequence:  data.branched_at_sequence || null,
    branchDepth:         data.branch_depth || 0,
    foundingContext:     data.founding_context || null,
  }
}

// ── Supabase diagnostic ───────────────────────────────────────────────────────

export async function diagnoseSupabase() {
  if (!isSupabaseConfigured) {
    console.info('[GroupChat] Supabase not configured — running in localStorage-only mode.')
    return false
  }
  const { error } = await supabase.from('rooms').select('code').limit(1)
  if (error) {
    console.error(
      '[GroupChat] ⚠️  Supabase rooms table is NOT accessible.\n' +
      `  Code: ${error.code}  Message: ${error.message}\n` +
      '  Run supabase-schema.sql in your Supabase SQL editor to fix this.'
    )
    return false
  }
  console.info('[GroupChat] ✓ Supabase rooms table is accessible.')
  return true
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a new room.
 *
 * @param {object}  mode
 * @param {array}   characters
 * @param {string}  createdByName        — display name (guest username or auth username)
 * @param {string|null} createdByUserId  — users.id UUID for authenticated users
 * @param {'private'|'unlisted'|'read-only'|'moderated-public'|'open'} visibility
 * @param {object|null} branchData       — { parentRoomId: UUID, branchedAtSequence: int, branchDepth: int, foundingContext: [] }
 * @returns {Promise<Room>}
 */
export async function createRoom(
  mode,
  characters,
  createdByName   = 'Guest',
  createdByUserId = null,
  visibility      = 'private',
  branchData      = null,
) {
  const code = generateRoomCode()
  const now  = new Date().toISOString()

  const room = {
    id:                null, // assigned by Supabase
    code,
    mode,
    characters,
    createdAt:           now,
    createdByUserId,
    createdByName,
    lastMessagePreview:  null,
    lastActivity:        now,
    participantCount:    1,
    visibility,
    parentRoomId:        branchData?.parentRoomId        || null,
    branchedAtSequence:  branchData?.branchedAtSequence  || null,
    branchDepth:         branchData?.branchDepth         || 0,
    foundingContext:     branchData?.foundingContext      || null,
  }

  if (isSupabaseConfigured) {
    const payload = {
      code,
      mode,
      characters,
      created_by_name:       createdByName,
      created_by_user_id:    createdByUserId,
      last_activity:         now,
      participant_count:     1,
      visibility,
      parent_room_id:        branchData?.parentRoomId        || null,
      branched_at_sequence:  branchData?.branchedAtSequence  || null,
      branch_depth:          branchData?.branchDepth         || 0,
      founding_context:      branchData?.foundingContext      || null,
    }

    const { data, error } = await supabase.from('rooms').insert(payload).select().single()
    if (error) {
      console.error(
        `[GroupChat] ❌ createRoom Supabase insert FAILED for room ${code}.\n` +
        `  Code: ${error.code}  Message: ${error.message}`
      )
    } else {
      room.id = data.id
      console.info(`[GroupChat] ✓ Room ${code} (${data.id}) created (visibility: ${visibility}).`)
    }
  }

  lsSave(code, room)
  return room
}

/**
 * Load a room by code (case-insensitive).
 * Tries Supabase first, falls back to localStorage.
 */
export async function loadRoom(code) {
  const upper = code.trim().toUpperCase()

  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('code', upper)
      .single()

    if (error) {
      if (error.code !== 'PGRST116') {
        console.warn(`[GroupChat] loadRoom Supabase error for ${upper}:`, error.message)
      }
    } else if (data) {
      const room = rowToRoom(data)
      lsSave(upper, room)
      return room
    }
  }

  return lsLoad(upper)
}

/**
 * Fetch rooms the user has visited (by codes list) — for "My Chats".
 * Authenticated users pull by user_id; guests pull by visited codes.
 */
export async function fetchMyRooms(codes, userId = null) {
  if (isSupabaseConfigured) {
    try {
      let query = supabase
        .from('rooms')
        .select('*')
        .order('last_activity', { ascending: false, nullsFirst: false })

      if (userId) {
        // Authenticated: owned rooms by this user
        query = query.eq('created_by_user_id', userId)
      } else if (codes && codes.length > 0) {
        // Guest: rooms by visited code list
        query = query.in('code', codes)
      } else {
        return []
      }

      const { data, error } = await query.limit(50)
      if (!error && data) {
        const rooms = data.map(rowToRoom)
        if (!userId) {
          // Re-order guests rooms to match visited-first order
          const byCode = Object.fromEntries(rooms.map(r => [r.code, r]))
          return (codes || []).map(c => byCode[c]).filter(Boolean)
        }
        return rooms
      }
    } catch (err) {
      console.warn('[GroupChat] fetchMyRooms error:', err)
    }
  }

  // Fallback: localStorage
  if (codes && codes.length > 0) return codes.map(c => lsLoad(c)).filter(Boolean)
  return []
}

/**
 * Browse All — publicly listed rooms (read-only, moderated-public, open).
 * Excludes private and unlisted.
 */
export async function fetchAllRooms() {
  if (!isSupabaseConfigured) return []
  try {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .in('visibility', ['read-only', 'moderated-public', 'open'])
      .order('last_activity', { ascending: false, nullsFirst: false })
      .limit(50)

    if (!error && data) return data.map(rowToRoom)
  } catch (err) {
    console.warn('[GroupChat] fetchAllRooms error:', err)
  }
  return []
}

/**
 * Update a room's visibility (e.g., after creation, via settings).
 */
export async function updateRoomVisibility(roomId, visibility) {
  if (!isSupabaseConfigured || !roomId) return
  const { error } = await supabase
    .from('rooms')
    .update({ visibility })
    .eq('id', roomId)
  if (error) console.warn('[GroupChat] updateRoomVisibility error:', error)
}

/**
 * Increment the participant count (fire-and-forget).
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
      await supabase
        .from('rooms')
        .update({ participant_count: (data.participant_count || 0) + 1 })
        .eq('code', code.toUpperCase())
    }
  } catch {}
}

/**
 * Synchronous localStorage-only write (for immediate local persistence).
 */
export function saveRoom(code, roomData) {
  lsSave(code.toUpperCase(), roomData)
}
