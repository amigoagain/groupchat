const LS_VISITED_KEY = 'groupchat_visited_rooms'
const LS_SEEN_PREFIX = 'groupchat_seen_'

// ─── Room name ────────────────────────────────────────────────────────────────

/**
 * Generate a human-readable room name from its characters array.
 * e.g.  [Sagan, Socrates]          → "Sagan & Socrates"
 *       [Einstein, Freud, Turing]  → "Einstein, Freud & Turing"
 */
export function generateRoomName(characters) {
  if (!characters || characters.length === 0) return 'Empty Room'
  if (characters.length === 1) return characters[0].name
  if (characters.length === 2) return `${characters[0].name} & ${characters[1].name}`
  const names = characters.map(c => c.name)
  return names.slice(0, -1).join(', ') + ' & ' + names[names.length - 1]
}

// ─── Relative time ────────────────────────────────────────────────────────────

/**
 * Return a short relative-time string for a given ISO timestamp.
 * e.g. "Just now", "4m ago", "3h ago", "2d ago", "Jan 12"
 */
export function relativeTime(isoString) {
  if (!isoString) return ''
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000)

  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(isoString).toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ─── Visited rooms tracking ───────────────────────────────────────────────────

/**
 * Return the ordered list of room codes the user has visited (most recent first).
 */
export function getVisitedRoomCodes() {
  try {
    const raw = localStorage.getItem(LS_VISITED_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

/**
 * Add a room code to the front of the visited list (deduplicates, max 50).
 */
export function markRoomVisited(code) {
  try {
    const upper = code.toUpperCase()
    const codes = getVisitedRoomCodes().filter(c => c !== upper)
    codes.unshift(upper)
    localStorage.setItem(LS_VISITED_KEY, JSON.stringify(codes.slice(0, 50)))
  } catch {}
}

/**
 * Remove a room code from the visited list.
 */
export function removeFromVisited(code) {
  try {
    const upper = code.toUpperCase()
    const codes = getVisitedRoomCodes().filter(c => c !== upper)
    localStorage.setItem(LS_VISITED_KEY, JSON.stringify(codes))
  } catch {}
}

// ─── Unread tracking ──────────────────────────────────────────────────────────

/**
 * Return the message count the user last acknowledged for a room.
 * New messages = total_messages - last_seen_count.
 */
export function getLastSeenCount(code) {
  try {
    return parseInt(localStorage.getItem(LS_SEEN_PREFIX + code.toUpperCase()) || '0', 10)
  } catch { return 0 }
}

/**
 * Record the current total message count as "seen" for a room.
 */
export function markAllSeen(code, count) {
  try {
    localStorage.setItem(LS_SEEN_PREFIX + code.toUpperCase(), String(count))
  } catch {}
}
