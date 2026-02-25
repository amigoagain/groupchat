/**
 * weaverRouter.js  (formerly observerRouter.js — renamed to Weaver throughout)
 * ─────────────────────────────────────────────────────────────────────────────
 * The Weaver is the routing and orchestration layer that runs before any
 * character responds. It determines WHICH characters respond, in WHAT ORDER,
 * and with what RESPONSE WEIGHT (full / brief / silent).
 *
 * V1 capabilities:
 *   1. Fuzzy direct-address detection (full names, first names, last names,
 *      hyphenated parts, normalized diacritics)
 *   2. Relevance gradient: LLM call assigns full / brief / silent weight
 *      to each character for general (non-addressed) messages
 *
 * The async signature is intentional — V2 can add richer Weaver behaviors
 * (conversational sequencing, pattern detection, quality signaling, room-state
 * evaluation) without changing any call sites.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Fuzzy name matching ───────────────────────────────────────────────────────

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Normalize a string: lowercase, strip diacritics, collapse hyphens/spaces.
 * "Jean-Paul Sartre" → "jean paul sartre"
 * "Friedrich Nietzsche" → "friedrich nietzsche"
 */
function normalize(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritics
    .replace(/[-–—]+/g, ' ')        // hyphens/dashes → space
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Extract all matchable name tokens from a character name.
 * "Jean-Paul Sartre" → ["jean paul sartre", "jean", "paul", "sartre"]
 * "Friedrich Nietzsche" → ["friedrich nietzsche", "friedrich", "nietzsche"]
 * Filters out particles shorter than 3 characters (de, von, van…)
 */
function nameTokens(charName) {
  const full = normalize(charName)
  const parts = full.split(' ').filter(w => w.length >= 3)
  return [...new Set([full, ...parts])]
}

/**
 * Test whether `message` directly addresses `token` (a normalized name or part).
 * Supported patterns:
 *   @Token | Token, | Token: | Token- | Hey Token | Hey there Token | Dear Token
 *   for Token | Token – … | bare Token as entire message
 */
function addressesToken(message, token) {
  const normMsg = normalize(message)
  const t = escapeRegex(token)
  const patterns = [
    new RegExp(`^@${t}\\b`),
    new RegExp(`^${t}[,:\\-]`),
    new RegExp(`^hey\\s+(there\\s+)?${t}\\b`),
    new RegExp(`^dear\\s+${t}\\b`),
    new RegExp(`\\bfor\\s+${t}[,:]?\\s*`),
    new RegExp(`^${t}\\s*[-–]\\s`),
    new RegExp(`^${t}$`),
  ]
  return patterns.some(p => p.test(normMsg))
}

/**
 * Detect if `message` directly addresses any character using fuzzy matching.
 * Returns the matched character or null.
 * Direct address always overrides relevance weighting.
 */
function detectDirectAddress(message, characters) {
  for (const char of characters) {
    for (const token of nameTokens(char.name)) {
      if (addressesToken(message, token)) return char
    }
  }
  return null
}

// ── Relevance gradient (LLM call) ─────────────────────────────────────────────

/**
 * Ask the Weaver (Claude) to assess each character's relevance to the message.
 * Returns [{ characterId, weight: 'full' | 'brief' | 'silent' }].
 *
 * Falls back to all-full if the call fails or Supabase/API is unavailable.
 * This is a cheap call: tiny system prompt, max 80 tokens output.
 */
async function assessRelevanceWeights(userMessage, characters, signal) {
  // Lazy-import to avoid circular dependency with claudeApi
  let callWeaverAPI
  try {
    const mod = await import('./claudeApi.js')
    callWeaverAPI = mod.callWeaverAPI
  } catch {
    return characters.map(c => ({ characterId: c.id, weight: 'full' }))
  }

  const systemPrompt =
    `You are the Weaver, a routing layer for a multi-character AI group conversation. ` +
    `Assess each character's relevance to the user's message based on their expertise and perspective.\n\n` +
    `Return ONLY valid JSON — a single array, no markdown, no explanation:\n` +
    `[{"id":"<id>","weight":"full|brief|silent"}]\n\n` +
    `Weights:\n` +
    `- full: highly relevant expertise or perspective — responds normally\n` +
    `- brief: can react but isn't the main voice — responds in 1-2 sentences\n` +
    `- silent: nothing meaningful to add to THIS specific message`

  const charList = characters
    .map(c => `id:${c.id} | ${c.name} (${c.title})${c.description ? ` — ${c.description.slice(0, 80)}` : ''}`)
    .join('\n')

  const userPrompt = `Message: "${userMessage}"\n\nCharacters:\n${charList}`

  try {
    const text = await callWeaverAPI(
      systemPrompt,
      [{ role: 'user', content: userPrompt }],
      signal,
    )
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) throw new Error('No JSON array in response')

    const parsed = JSON.parse(match[0])
    const valid  = ['full', 'brief', 'silent']

    return parsed
      .filter(item => item.id && valid.includes(item.weight))
      .map(item => ({ characterId: item.id, weight: item.weight }))
  } catch (err) {
    if (err.name === 'AbortError') throw err
    console.warn('[Weaver] Relevance assessment failed, defaulting all to full:', err.message)
    return characters.map(c => ({ characterId: c.id, weight: 'full' }))
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Route a user message.
 *
 * Returns:
 * {
 *   respondingCharacters: Character[],  // each has .responseWeight attached
 *   routingReason: 'direct_address' | 'general',
 *   addressedCharacter: string | null,
 *   weights: { characterId, weight }[],
 * }
 *
 * Direct address overrides ALL relevance weighting.
 */
export async function routeMessage(userMessage, characters, _previousMessages, signal = null) {
  const addressed = detectDirectAddress(userMessage, characters)

  if (addressed) {
    const weights = characters.map(c => ({
      characterId: c.id,
      weight: c.id === addressed.id ? 'full' : 'silent',
    }))
    return {
      respondingCharacters: [{ ...addressed, responseWeight: 'full' }],
      routingReason: 'direct_address',
      addressedCharacter: addressed.name,
      weights,
    }
  }

  // General message — assess relevance
  const weights = await assessRelevanceWeights(userMessage, characters, signal)
  const weightMap = Object.fromEntries(weights.map(w => [w.characterId, w.weight]))

  const respondingCharacters = characters
    .map(c => ({ ...c, responseWeight: weightMap[c.id] || 'full' }))
    .filter(c => c.responseWeight !== 'silent')

  // If somehow all are silent, fall back to all full
  const finalChars = respondingCharacters.length > 0
    ? respondingCharacters
    : characters.map(c => ({ ...c, responseWeight: 'full' }))

  return {
    respondingCharacters: finalChars,
    routingReason: 'general',
    addressedCharacter: null,
    weights,
  }
}

/**
 * Return a short UI notice string for non-trivial routing decisions.
 * Null for general (all-respond) routing.
 */
export function formatRoutingNotice(routingResult) {
  if (routingResult.routingReason === 'direct_address') {
    return `→ ${routingResult.addressedCharacter}`
  }
  // Mention any silenced characters
  const silent = (routingResult.weights || [])
    .filter(w => w.weight === 'silent')
    .length
  if (silent > 0) {
    return `Weaver: ${routingResult.respondingCharacters.length} responding`
  }
  return null
}
