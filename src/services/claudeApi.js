const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 600

function getApiKey() {
  // Primary: Vite env var (set VITE_ANTHROPIC_API_KEY in Vercel or .env)
  const viteKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (viteKey && viteKey.length > 10 && viteKey !== 'your_api_key_here') {
    return viteKey
  }
  // Secondary: React App env var (legacy support)
  const envKey = import.meta.env.REACT_APP_ANTHROPIC_API_KEY
  if (envKey && envKey.length > 10 && envKey !== 'your_api_key_here') {
    return envKey
  }
  // Fallback: key entered via the setup screen (stored in sessionStorage)
  return sessionStorage.getItem('GROUPCHAT_API_KEY') || ''
}

/**
 * Build the messages array for a specific character's API call.
 * Characters are given their own past responses (as assistant) and see
 * other characters' responses as context within the user turn.
 */
function buildApiMessages(previousMessages, characterId, currentUserMessage, precedingResponses) {
  // Group previous messages into rounds: each round is one user message + all character responses
  const rounds = []
  let currentRound = null

  for (const msg of previousMessages) {
    if (msg.type === 'user') {
      if (currentRound) rounds.push(currentRound)
      currentRound = { userContent: msg.content, responses: [] }
    } else if (msg.type === 'character' && currentRound) {
      currentRound.responses.push(msg)
    }
  }
  if (currentRound) rounds.push(currentRound)

  const apiMessages = []

  for (const round of rounds) {
    const myResponse = round.responses.find(r => r.characterId === characterId)
    // Only include rounds where this character responded (maintains alternation)
    if (!myResponse) continue

    const othersResponses = round.responses.filter(r => r.characterId !== characterId)

    let userContent = round.userContent
    if (othersResponses.length > 0) {
      userContent +=
        '\n\n[Other participants in this conversation also responded:\n' +
        othersResponses.map(r => `• ${r.characterName}: "${r.content}"`).join('\n') +
        '\n]'
    }

    apiMessages.push({ role: 'user', content: userContent })
    apiMessages.push({ role: 'assistant', content: myResponse.content })
  }

  // Current round: the new user message plus any characters who already responded this round
  let currentContent = currentUserMessage
  if (precedingResponses.length > 0) {
    currentContent +=
      '\n\n[Other participants have already responded to this message:\n' +
      precedingResponses.map(r => `• ${r.characterName}: "${r.content}"`).join('\n') +
      '\n\nPlease acknowledge their points and add your unique perspective.]'
  }
  apiMessages.push({ role: 'user', content: currentContent })

  return apiMessages
}

/**
 * Build the system prompt for a character including their personality,
 * the conversation mode context, and awareness of other participants.
 */
function buildSystemPrompt(character, mode, allCharacters) {
  const otherChars = allCharacters
    .filter(c => c.id !== character.id)
    .map(c => `• ${c.name} (${c.title})`)
    .join('\n')

  return `${character.personality}

${mode.modeContext}

You are participating in a GROUP CONVERSATION with the following other AI characters:
${otherChars}

IMPORTANT GROUP DYNAMICS:
- When other participants have already responded in this round, explicitly acknowledge and respond to their specific points — agree, disagree, build on, or challenge what they said.
- Refer to other participants by name (e.g., "As Socrates pointed out..." or "I disagree with Elon here...").
- Bring your unique perspective that no other character can offer.
- Do NOT simply repeat what others said. Add genuine value.
- Stay in character at all times.
- Be concise and direct. Do not use headers, bullet points, or markdown formatting. Write in natural prose.`
}

/**
 * Make an API call for a single character with retry logic.
 */
async function callAnthropicAPI(systemPrompt, messages, retries = 3) {
  const apiKey = getApiKey()

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: systemPrompt,
          messages,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        // Don't retry on 400 (bad request) or 401 (auth) errors
        if (response.status === 400 || response.status === 401) {
          throw new Error(errorData.error?.message || `API error ${response.status}`)
        }
        // Retry on 429 (rate limit) or 5xx
        if (attempt < retries) {
          const delay = Math.pow(2, attempt) * 1000
          await new Promise(r => setTimeout(r, delay))
          continue
        }
        throw new Error(errorData.error?.message || `API error ${response.status}`)
      }

      const data = await response.json()
      return data.content[0].text
    } catch (err) {
      if (attempt < retries && !err.message.includes('API error 4')) {
        const delay = Math.pow(2, attempt) * 1000
        await new Promise(r => setTimeout(r, delay))
        continue
      }
      throw err
    }
  }
}

/**
 * Get a response from a single character.
 *
 * @param {object} character - The character object from characters.js
 * @param {object} mode - The mode object from modes.js
 * @param {Array} allCharacters - All characters in this room
 * @param {Array} previousMessages - All messages before the current user turn
 * @param {string} currentUserMessage - The text of the current user message
 * @param {Array} precedingResponses - Responses already given by other chars this round
 * @returns {Promise<string>} - The character's response text
 */
export async function getCharacterResponse(
  character,
  mode,
  allCharacters,
  previousMessages,
  currentUserMessage,
  precedingResponses
) {
  const systemPrompt = buildSystemPrompt(character, mode, allCharacters)
  const messages = buildApiMessages(previousMessages, character.id, currentUserMessage, precedingResponses)
  return await callAnthropicAPI(systemPrompt, messages)
}

/**
 * Check if the API key is configured.
 */
export function hasApiKey() {
  const key = getApiKey()
  return key && key.length > 10 && key !== 'your_api_key_here'
}

/**
 * Generate a short, creative, SMS-friendly invite message for sharing a room.
 * Uses navigator.share on mobile; falls back to clipboard copy on desktop.
 *
 * @param {string} username - The inviting user's name
 * @param {Array}  characters - Characters in the room
 * @param {Array}  messages - Current conversation messages (for topic context)
 * @returns {Promise<string>} - Invite message text (no URL — caller appends it)
 */
export async function generateInviteMessage(username, characters, messages) {
  const charNames = characters.map(c => c.name).join(', ')

  // Pull in recent character responses for topic context
  const charMsgs = (messages || []).filter(m => m.type === 'character')
  let topicContext = 'No conversation yet — the room was just created.'
  if (charMsgs.length >= 2) {
    const snippets = charMsgs
      .slice(-3)
      .map(m => `${m.characterName}: "${m.content.slice(0, 80).replace(/\n/g, ' ')}"`)
      .join(' | ')
    topicContext = `Recent conversation: ${snippets}`
  }

  const systemPrompt =
    `You write short, punchy, creative invite messages for a group chat app where users ` +
    `converse with AI versions of historical figures and thinkers. ` +
    `The messages should be fun, casual, and make people want to click the link. ` +
    `Write from the inviting user's perspective (first or third person). ` +
    `Do NOT include a URL — the caller will append it. Keep it under 130 characters.`

  const userPrompt =
    `User's name: ${username}\n` +
    `Characters in the room: ${charNames}\n` +
    `${topicContext}\n\n` +
    `Generate exactly ONE invite message under 130 characters. ` +
    `No URL in the message. No quotation marks wrapping it. Just the text.`

  const text = await callAnthropicAPI(
    systemPrompt,
    [{ role: 'user', content: userPrompt }],
    1 // single retry — it's a quick creative call
  )

  // Strip any wrapping quotes Claude occasionally adds
  return text.trim().replace(/^["""'']+|["""'']+$/g, '')
}

/**
 * Ask Claude to generate a character profile for any given person/concept name.
 * Returns { title, personality, color } ready to populate the create-character form.
 */
export async function generateCharacterProfile(personName) {
  const systemPrompt =
    `You are a creative character designer for an AI group-chat app. ` +
    `When given a name, you write vivid, accurate character profiles that capture ` +
    `that person's distinctive voice, worldview, and communication style.`

  const userPrompt =
    `Generate a character profile for: "${personName}"\n\n` +
    `Return ONLY valid JSON (no markdown fences, no explanation) with exactly these three fields:\n` +
    `{\n` +
    `  "title": "Their primary role or title in 2-5 words (e.g. 'Existentialist Philosopher', 'Jazz Musician & Activist')",\n` +
    `  "personality": "3-4 sentences written in second person describing: how they speak and communicate, what they deeply care about, their signature quirks or mannerisms, and their unique worldview. Start each sentence with 'You '.",\n` +
    `  "color": "A single hex color code that evokes their personality (e.g. '#8B7CF8' for a mystic, '#FF6B35' for a firebrand, '#2ED573' for a scientist)"\n` +
    `}\n\n` +
    `If the name is obscure or fictional, invent a plausible and interesting profile anyway.`

  const text = await callAnthropicAPI(systemPrompt, [{ role: 'user', content: userPrompt }], 2)

  // Extract JSON — handle cases where Claude wraps in markdown code fences
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse generated profile. Please try again.')

  const parsed = JSON.parse(jsonMatch[0])
  if (!parsed.title || !parsed.personality || !parsed.color) {
    throw new Error('Incomplete profile returned. Please try again.')
  }

  // Normalise color to ensure it's a valid hex
  const colorHex = /^#[0-9a-fA-F]{6}$/.test(parsed.color) ? parsed.color : '#4f7cff'

  return {
    title: parsed.title.trim(),
    personality: parsed.personality.trim(),
    color: colorHex,
  }
}
