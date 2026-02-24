/**
 * Observer Router — V1
 * ─────────────────────────────────────────────────────────────
 * Lightweight routing layer that runs before character responses.
 * Determines WHICH characters respond to a message and in WHAT ORDER.
 *
 * V1 uses fast client-side pattern matching for direct address detection.
 * The function signature is intentionally async so V2 can swap in an
 * LLM-based routing call (nuanced sequencing, conflict detection, etc.)
 * without changing any call sites.
 *
 * Routing rules (V1):
 *   1. If the message addresses a specific character by name → only that
 *      character responds. All others are silent.
 *   2. Otherwise → all characters respond in their default order.
 * ─────────────────────────────────────────────────────────────
 */

// ─── Helpers ───────────────────────────────────────────────────────────────

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Test whether a message directly addresses a given name.
 * Matches patterns like:
 *   @Socrates | Socrates, | Socrates: | Socrates - | Hey Socrates | For Socrates
 */
function addressesName(message, name) {
  const n = escapeRegex(name)
  const patterns = [
    new RegExp(`^@${n}\\b`, 'i'),                    // @Name
    new RegExp(`^${n}[,:\\-]`, 'i'),                 // Name, / Name: / Name-
    new RegExp(`^hey\\s+(there\\s+)?${n}\\b`, 'i'),  // Hey Name / Hey there Name
    new RegExp(`^dear\\s+${n}\\b`, 'i'),             // Dear Name
    new RegExp(`\\bfor\\s+${n}[,:]?\\s*[-–]?\\s*`, 'i'), // for Name
    new RegExp(`^${n}\\s*[-–]\\s`, 'i'),             // Name – …
    new RegExp(`^${n}\\s*$`, 'i'),                   // bare name as entire message
  ]
  return patterns.some(p => p.test(message.trim()))
}

/**
 * Detect if a message directly addresses any character.
 * Tries both the full name and the first name to handle informal use.
 * Returns the first matched character, or null.
 */
function detectDirectAddress(message, characters) {
  for (const char of characters) {
    const namesToTry = new Set([char.name])
    const firstName = char.name.split(/\s+/)[0]
    if (firstName && firstName !== char.name) namesToTry.add(firstName)

    for (const name of namesToTry) {
      if (addressesName(message, name)) return char
    }
  }
  return null
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Route a user message to the appropriate responding characters.
 *
 * @param {string}     userMessage       — Raw text of the user's message
 * @param {Character[]} characters       — All characters currently in the room
 * @param {Message[]}  _previousMessages — Full conversation history (reserved for V2)
 *
 * @returns {Promise<{
 *   respondingCharacters: Character[],
 *   routingReason: 'direct_address' | 'general',
 *   addressedCharacter: string | null,
 * }>}
 */
export async function routeMessage(userMessage, characters, _previousMessages) {
  const addressed = detectDirectAddress(userMessage, characters)

  if (addressed) {
    return {
      respondingCharacters: [addressed],
      routingReason: 'direct_address',
      addressedCharacter: addressed.name,
    }
  }

  return {
    respondingCharacters: characters,
    routingReason: 'general',
    addressedCharacter: null,
  }
}

/**
 * Return a short UI notice string when routing is non-trivial.
 * Returns null for general (all-respond) routing.
 */
export function formatRoutingNotice(routingResult) {
  if (routingResult.routingReason === 'direct_address') {
    return `→ ${routingResult.addressedCharacter}`
  }
  return null
}
