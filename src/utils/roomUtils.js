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

// ─── public API ──────────────────────────────────────────────────────────────

/**
 * Create a new room. Saves to Supabase (primary) and localStorage (fallback).
 * Returns the room object synchronously after the localStorage write; the
 * Supabase insert runs in the background.
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

  // Write to localStorage immediately so the UI can proceed
  lsSave(code, room)

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase.from('rooms').insert({
        code,
        mode,
        characters,
        messages: [],
      })
      if (error) console.warn('Supabase createRoom error:', error.message)
    } catch (err) {
      console.warn('Supabase createRoom failed, using localStorage only:', err)
    }
  }

  return room
}

/**
 * Load a room by code. Tries Supabase first, falls back to localStorage.
 */
export async function loadRoom(code) {
  const upper = code.trim().toUpperCase()

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', upper)
        .single()

      if (!error && data) {
        const room = {
          code: data.code,
          mode: data.mode,
          characters: data.characters,
          messages: data.messages || [],
          createdAt: data.created_at,
        }
        lsSave(upper, room) // keep local cache fresh
        return room
      }
    } catch (err) {
      console.warn('Supabase loadRoom failed, trying localStorage:', err)
    }
  }

  return lsLoad(upper)
}

/**
 * Update just the messages array for a room in both Supabase and localStorage.
 * Safe to fire-and-forget (won't throw).
 */
export async function updateRoomMessages(code, messages) {
  const upper = code.toUpperCase()

  // Always keep localStorage in sync
  const cached = lsLoad(upper)
  if (cached) lsSave(upper, { ...cached, messages })

  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('rooms')
        .update({ messages })
        .eq('code', upper)
      if (error) console.warn('Supabase updateRoomMessages error:', error.message)
    } catch (err) {
      console.warn('Supabase updateRoomMessages failed:', err)
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
