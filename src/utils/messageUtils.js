/**
 * messageUtils.js
 * ─────────────────────────────────────────────────────────────
 * All reads and writes for the messages table.
 * Messages are no longer stored as JSON on the rooms row.
 * ─────────────────────────────────────────────────────────────
 */
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

// ── Local message cache (per room, in-memory only) ────────────────────────────
// Avoids redundant Supabase reads during a single session.
const cache = new Map() // roomId → Message[]

// ── Shape conversion ──────────────────────────────────────────────────────────

/**
 * Convert a Supabase messages row → the in-app message shape used by components.
 */
export function rowToMessage(row) {
  return {
    id:               row.id,
    type:             row.sender_type === 'user' ? 'user'
                    : row.sender_type === 'weaver' ? 'weaver'
                    : 'character',
    content:          row.content,
    characterId:      row.sender_type === 'character' ? row.sender_id : undefined,
    characterName:    row.sender_type !== 'user' ? row.sender_name : undefined,
    characterColor:   row.sender_color  || undefined,
    characterInitial: row.sender_initial || undefined,
    isError:          row.is_error || false,
    timestamp:        row.created_at,
    sequenceNumber:   row.sequence_number,
    metadata:         row.metadata || null,
    // For the user's own messages
    senderName:       row.sender_type === 'user' ? row.sender_name : undefined,
  }
}

/**
 * Convert an in-app message + roomId → the insert payload for the messages table.
 */
export function messageToRow(msg, roomId) {
  const isUser      = msg.type === 'user'
  const isWeaver    = msg.type === 'weaver'
  const isCharacter = msg.type === 'character'

  return {
    room_id:        roomId,
    sender_type:    msg.type,
    sender_name:    isUser      ? (msg.senderName || 'User')
                  : isWeaver    ? 'Gardener'
                  : (msg.characterName || 'Character'),
    sender_id:      isUser      ? (msg.userId || null)
                  : isCharacter ? (msg.characterId || null)
                  : null,
    sender_color:   isCharacter ? (msg.characterColor || null) : null,
    sender_initial: isCharacter ? (msg.characterInitial || null) : null,
    content:        msg.content,
    is_error:       msg.isError || false,
    metadata:       msg.metadata || null,
    // sequence_number is set by DB trigger — do not include
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch all messages for a room by room UUID.
 * Returns [] if Supabase is unavailable.
 */
export async function fetchMessages(roomId) {
  if (!isSupabaseConfigured || !roomId) return []
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('sequence_number', { ascending: true })

    if (error) throw error
    const msgs = (data || []).map(rowToMessage)
    cache.set(roomId, msgs)
    return msgs
  } catch (err) {
    console.warn('[Messages] fetchMessages error:', err)
    return cache.get(roomId) || []
  }
}

/**
 * Fetch only messages with sequence_number > afterSeq (for polling / catch-up).
 * Returns [] if none.
 */
export async function fetchMessagesAfter(roomId, afterSeq) {
  if (!isSupabaseConfigured || !roomId) return []
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .gt('sequence_number', afterSeq)
      .order('sequence_number', { ascending: true })

    if (error) throw error
    return (data || []).map(rowToMessage)
  } catch (err) {
    console.warn('[Messages] fetchMessagesAfter error:', err)
    return []
  }
}

/**
 * Fetch messages in a specific sequence range (used for branch founding context).
 */
export async function fetchMessageRange(roomId, fromSeq, toSeq) {
  if (!isSupabaseConfigured || !roomId) return []
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .gte('sequence_number', fromSeq)
      .lte('sequence_number', toSeq)
      .order('sequence_number', { ascending: true })

    if (error) throw error
    return (data || []).map(rowToMessage)
  } catch (err) {
    console.warn('[Messages] fetchMessageRange error:', err)
    return []
  }
}

/**
 * Insert a single message and return the saved row (with server-assigned seq/id).
 * Also updates rooms.last_activity and last_message_preview.
 */
export async function insertMessage(msg, roomId) {
  if (!isSupabaseConfigured || !roomId) {
    // Offline: return msg with fake seq (handled by caller)
    return { ...msg, id: msg.id || `local_${Date.now()}`, sequenceNumber: 0 }
  }
  try {
    const payload = messageToRow(msg, roomId)

    const { data, error } = await supabase
      .from('messages')
      .insert(payload)
      .select()
      .single()

    if (error) throw error

    const saved = rowToMessage(data)

    // Update cache
    const cached = cache.get(roomId) || []
    cache.set(roomId, [...cached, saved])

    // Update room's last_activity + preview (fire-and-forget)
    const preview = msg.type === 'character'
      ? `${msg.characterName}: ${msg.content.slice(0, 80).replace(/\n/g, ' ')}`
      : null

    supabase.from('rooms').update({
      last_activity:        new Date().toISOString(),
      ...(preview ? { last_message_preview: preview } : {}),
    }).eq('id', roomId).then(() => {})

    return saved
  } catch (err) {
    console.error('[Messages] insertMessage error:', err)
    return { ...msg, id: msg.id || `local_${Date.now()}`, sequenceNumber: 0 }
  }
}

/**
 * Insert multiple messages at once (used for batch operations).
 * Returns the saved rows in order.
 */
export async function insertMessages(msgs, roomId) {
  if (!msgs.length) return []
  if (!isSupabaseConfigured || !roomId) return msgs

  try {
    const payloads = msgs.map(m => messageToRow(m, roomId))
    const { data, error } = await supabase
      .from('messages')
      .insert(payloads)
      .select()

    if (error) throw error
    const saved = (data || []).map(rowToMessage)

    const cached = cache.get(roomId) || []
    cache.set(roomId, [...cached, ...saved])

    return saved
  } catch (err) {
    console.error('[Messages] insertMessages error:', err)
    return msgs
  }
}

/**
 * Clear the in-memory cache for a room (e.g., when leaving).
 */
export function clearCache(roomId) {
  cache.delete(roomId)
}
