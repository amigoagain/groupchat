const STORAGE_KEY = 'groupchat_custom_characters'

/**
 * Load all custom characters from localStorage.
 */
export function loadCustomCharacters() {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : []
  } catch {
    return []
  }
}

/**
 * Save (create or update) a custom character.
 * Returns the updated array.
 */
export function saveCustomCharacter(character) {
  const chars = loadCustomCharacters()
  const idx = chars.findIndex(c => c.id === character.id)
  if (idx >= 0) {
    chars[idx] = character
  } else {
    chars.push(character)
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chars))
  return chars
}

/**
 * Delete a custom character by id.
 * Returns the updated array.
 */
export function deleteCustomCharacter(id) {
  const chars = loadCustomCharacters().filter(c => c.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(chars))
  return chars
}

/**
 * Build a character object from raw form data.
 * If an existing id is passed it will be preserved (for edits).
 */
export function buildCustomCharacter({ id, name, title, personalityText, color }) {
  const trimmedName = name.trim()
  const trimmedTitle = title.trim()
  const trimmedPersonality = personalityText.trim()

  // Full system prompt used in API calls — mirrors the style of built-in characters
  const personality =
    `You are ${trimmedName}, ${trimmedTitle}. ` +
    trimmedPersonality +
    `\n\nStay fully in character at all times. Respond naturally in the first person as this character. ` +
    `Never break character or acknowledge that you are an AI playing a role.`

  // Short card description (first sentence, max 100 chars)
  const firstSentence = trimmedPersonality.split(/[.!?]/)[0] || trimmedPersonality
  const description =
    firstSentence.length > 100
      ? firstSentence.slice(0, 97) + '...'
      : firstSentence + '.'

  return {
    id: id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: trimmedName,
    title: trimmedTitle,
    initial: trimmedName.charAt(0).toUpperCase(),
    color,
    description,
    // Full prompt for the API
    personality,
    // Raw text stored so we can pre-populate the edit form
    personalityText: trimmedPersonality,
    isCustom: true,
  }
}
