const STORAGE_PREFIX = 'groupchat_room_'

/**
 * Generate a random 6-character alphanumeric room code.
 */
export function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Omit confusing chars (0, O, 1, I)
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

/**
 * Save a room to localStorage.
 * @param {string} code - Room code
 * @param {object} roomData - { code, mode, characters, messages, createdAt }
 */
export function saveRoom(code, roomData) {
  try {
    localStorage.setItem(STORAGE_PREFIX + code, JSON.stringify(roomData))
  } catch (err) {
    console.error('Failed to save room:', err)
  }
}

/**
 * Load a room from localStorage by code.
 * @param {string} code - Room code (case insensitive)
 * @returns {object|null} - Room data or null if not found
 */
export function loadRoom(code) {
  try {
    const data = localStorage.getItem(STORAGE_PREFIX + code.toUpperCase())
    return data ? JSON.parse(data) : null
  } catch (err) {
    console.error('Failed to load room:', err)
    return null
  }
}

/**
 * List all saved rooms from localStorage.
 * @returns {Array} - Array of room objects sorted by createdAt descending
 */
export function listRooms() {
  try {
    const rooms = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(STORAGE_PREFIX)) {
        const data = localStorage.getItem(key)
        if (data) {
          try {
            rooms.push(JSON.parse(data))
          } catch {}
        }
      }
    }
    return rooms.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  } catch {
    return []
  }
}

/**
 * Create a new room object.
 */
export function createRoom(mode, characters) {
  const code = generateRoomCode()
  const room = {
    code,
    mode,
    characters,
    messages: [],
    createdAt: new Date().toISOString(),
  }
  saveRoom(code, room)
  return room
}

/**
 * Format a timestamp for display.
 */
export function formatTime(isoString) {
  const date = new Date(isoString)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
