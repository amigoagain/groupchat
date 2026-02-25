const API_URL    = 'https://api.anthropic.com/v1/messages'
const MODEL      = 'claude-sonnet-4-6'
const MAX_TOKENS = 600

function getApiKey() {
  const viteKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (viteKey && viteKey.length > 10 && viteKey !== 'your_api_key_here') return viteKey
  const envKey = import.meta.env.REACT_APP_ANTHROPIC_API_KEY
  if (envKey  && envKey.length  > 10 && envKey  !== 'your_api_key_here') return envKey
  return sessionStorage.getItem('GROUPCHAT_API_KEY') || ''
}

// ── Message builder ───────────────────────────────────────────────────────────

/**
 * Build the messages array for a character's API call from the in-app message list.
 * Works with the new message shape from messageUtils.rowToMessage().
 */
function buildApiMessages(previousMessages, characterId, currentUserMessage, precedingResponses) {
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
    const myResponse    = round.responses.find(r => r.characterId === characterId)
    if (!myResponse) continue
    const othersResponses = round.responses.filter(r => r.characterId !== characterId)

    let userContent = round.userContent
    if (othersResponses.length > 0) {
      userContent +=
        '\n\n[Other participants in this conversation also responded:\n' +
        othersResponses.map(r => `• ${r.characterName}: "${r.content}"`).join('\n') +
        '\n]'
    }
    apiMessages.push({ role: 'user',      content: userContent })
    apiMessages.push({ role: 'assistant', content: myResponse.content })
  }

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

// ── System prompt builder ─────────────────────────────────────────────────────

/**
 * Build the system prompt for a character.
 *
 * @param {object}        character
 * @param {object}        mode
 * @param {array}         allCharacters
 * @param {'full'|'brief'} responseWeight   — from the Weaver
 * @param {array|null}    foundingContext   — messages that seeded a branch room
 */
function buildSystemPrompt(character, mode, allCharacters, responseWeight = 'full', foundingContext = null) {
  const otherChars = allCharacters
    .filter(c => c.id !== character.id)
    .map(c => `• ${c.name} (${c.title})`)
    .join('\n')

  // Weaver response-weight instruction
  let weightInstruction = ''
  if (responseWeight === 'brief') {
    weightInstruction =
      '\n\nGARDENER ROUTING — BRIEF RESPONSE: The Gardener has determined this topic is not your ' +
      'primary domain. Respond in 1–2 sentences only. React and add a quick perspective, ' +
      'but let others lead this exchange.'
  }

  // Branch founding context
  let contextInstruction = ''
  if (foundingContext && foundingContext.length > 0) {
    const contextLines = foundingContext
      .map(m => `[${m.characterName || m.senderName || m.sender_name || 'User'}]: "${m.content}"`)
      .join('\n')
    contextInstruction =
      '\n\nFOUNDING CONTEXT — This conversation was branched from the following exchange. ' +
      'Your responses should build on, challenge, or explore the themes raised here:\n' +
      contextLines
  }

  return `${character.personality}${weightInstruction}${contextInstruction}

${mode.modeContext}

You are participating in a GROUP CONVERSATION with the following other AI characters:
${otherChars || '(You are the only participant)'}

IMPORTANT GROUP DYNAMICS:
- When other participants have already responded in this round, explicitly acknowledge and respond to their specific points — agree, disagree, build on, or challenge what they said.
- Refer to other participants by name (e.g., "As Socrates pointed out..." or "I disagree with Elon here...").
- Bring your unique perspective that no other character can offer.
- Do NOT simply repeat what others said. Add genuine value.
- Stay in character at all times.
- Be concise and direct. Do not use headers, bullet points, or markdown formatting. Write in natural prose.`
}

// ── Core API call ─────────────────────────────────────────────────────────────

/**
 * Make an Anthropic API call with retry logic.
 * @param {string}      systemPrompt
 * @param {object[]}    messages
 * @param {number}      retries
 * @param {AbortSignal} [signal]
 * @param {number}      [maxTokens]
 */
async function callAnthropicAPI(systemPrompt, messages, retries = 3, signal = null, maxTokens = MAX_TOKENS) {
  const apiKey = getApiKey()

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type':                              'application/json',
          'x-api-key':                                 apiKey,
          'anthropic-version':                         '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model:      MODEL,
          max_tokens: maxTokens,
          system:     systemPrompt,
          messages,
        }),
        signal,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        if (response.status === 400 || response.status === 401) {
          throw new Error(errorData.error?.message || `API error ${response.status}`)
        }
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000))
          continue
        }
        throw new Error(errorData.error?.message || `API error ${response.status}`)
      }

      const data = await response.json()
      return data.content[0].text
    } catch (err) {
      if (err.name === 'AbortError') throw err
      if (attempt < retries && !err.message?.includes('API error 4')) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000))
        continue
      }
      throw err
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Thin wrapper used by weaverRouter for relevance-assessment calls.
 * Lower token limit; single retry.
 */
export async function callWeaverAPI(systemPrompt, messages, signal = null) {
  return callAnthropicAPI(systemPrompt, messages, 1, signal, 100)
}

/**
 * Get a response from a single character.
 *
 * @param {object}           character
 * @param {object}           mode
 * @param {array}            allCharacters
 * @param {array}            previousMessages
 * @param {string}           currentUserMessage
 * @param {array}            precedingResponses
 * @param {AbortSignal|null} signal
 * @param {'full'|'brief'}   responseWeight     — from the Weaver
 * @param {array|null}       foundingContext    — branch founding messages
 */
export async function getCharacterResponse(
  character,
  mode,
  allCharacters,
  previousMessages,
  currentUserMessage,
  precedingResponses,
  signal         = null,
  responseWeight  = 'full',
  foundingContext = null,
) {
  const systemPrompt = buildSystemPrompt(character, mode, allCharacters, responseWeight, foundingContext)
  const messages     = buildApiMessages(previousMessages, character.id, currentUserMessage, precedingResponses)
  return callAnthropicAPI(systemPrompt, messages, 3, signal)
}

/**
 * Generic direct API call — used by the Weaver entry interface.
 * Caller supplies the full system prompt and message history.
 *
 * @param {string}      systemPrompt
 * @param {object[]}    messages   — [{ role, content }]
 * @param {number}      maxTokens  — default 400
 * @param {AbortSignal} [signal]
 */
export async function callDirectAPI(systemPrompt, messages, maxTokens = 400, signal = null) {
  return callAnthropicAPI(systemPrompt, messages, 2, signal, maxTokens)
}

/**
 * Check whether an API key is configured.
 */
export function hasApiKey() {
  const key = getApiKey()
  return Boolean(key && key.length > 10 && key !== 'your_api_key_here')
}

/**
 * Generate a short AI-written invite message for sharing a room.
 */
export async function generateInviteMessage(username, characters, messages) {
  const charNames = characters.map(c => c.name).join(', ')
  const charMsgs  = (messages || []).filter(m => m.type === 'character')
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
    `Write from the inviting user's perspective. ` +
    `Do NOT include a URL. Keep it under 130 characters.`

  const userPrompt =
    `User: ${username}\nCharacters: ${charNames}\n${topicContext}\n\n` +
    `Generate ONE invite message under 130 characters. No URL. No surrounding quotes. Just the text.`

  const text = await callAnthropicAPI(systemPrompt, [{ role: 'user', content: userPrompt }], 1)
  return text.trim().replace(/^["""'']+|["""'']+$/g, '')
}

/**
 * Generate a character profile for a given person/concept name.
 */
export async function generateCharacterProfile(personName) {
  const systemPrompt =
    `You are a creative character designer for an AI group-chat app. ` +
    `When given a name, you write vivid, accurate character profiles that capture ` +
    `that person's distinctive voice, worldview, and communication style.`

  const userPrompt =
    `Generate a character profile for: "${personName}"\n\n` +
    `Return ONLY valid JSON (no markdown fences, no explanation):\n` +
    `{\n  "title": "2-5 word role/title",\n  "personality": "3-4 sentences in second person starting with 'You '.",\n  "color": "#hexcolor"\n}\n\n` +
    `If obscure or fictional, invent a plausible profile anyway.`

  const text = await callAnthropicAPI(systemPrompt, [{ role: 'user', content: userPrompt }], 2)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse generated profile.')

  const parsed = JSON.parse(jsonMatch[0])
  if (!parsed.title || !parsed.personality || !parsed.color) {
    throw new Error('Incomplete profile returned.')
  }

  return {
    title:       parsed.title.trim(),
    personality: parsed.personality.trim(),
    color:       /^#[0-9a-fA-F]{6}$/.test(parsed.color) ? parsed.color : '#4f7cff',
  }
}

/**
 * Generate a short room name from founding context messages.
 * Used when creating a branch room.
 */
export async function generateBranchRoomName(foundingMessages) {
  const excerpt = foundingMessages
    .slice(0, 3)
    .map(m => `${m.characterName || m.senderName || 'User'}: "${m.content.slice(0, 60)}"`)
    .join(' | ')

  const text = await callAnthropicAPI(
    'You generate short, evocative room names for branched AI conversations. ' +
    'Return ONLY the name — 3-6 words, no quotes, no punctuation at the end.',
    [{ role: 'user', content: `Context: ${excerpt}\n\nGenerate a 3-6 word room name:` }],
    1,
    null,
    30,
  )
  return text.trim().replace(/^["""'']+|["""'']+$/g, '').slice(0, 60)
}
