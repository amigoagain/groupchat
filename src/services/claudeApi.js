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

// ── Gardener system prompt ────────────────────────────────────────────────────

/**
 * Build the dynamic character block for the Gardener prompt.
 * One entry per character, formatted as:
 *   [NAME] — [TITLE]
 *   Framework: [first 2-3 sentences of personality]
 *   Watch for drift toward: [inferred from character type]
 */
function buildGardenerCharacterBlock(allCharacters) {
  return allCharacters.map(c => {
    // Extract first 2-3 sentences of personality for framework summary
    const sentences = (c.personality || '').split(/(?<=[.!?])\s+/)
    const frameworkSnippet = sentences.slice(0, 3).join(' ')

    // Infer drift type from character metadata
    let driftNote
    if (c.isCanonical) {
      driftNote = 'departing from documented intellectual commitments or speaking beyond their historical era'
    } else if (c.category === 'expert') {
      driftNote = 'departing from domain expertise into adjacent territory they don\'t actually command'
    } else {
      driftNote = 'losing their variant framing or becoming a straightforward version of their base character'
    }

    return `[${c.name}] — ${c.title || 'Thinker'}
Framework: ${frameworkSnippet}
Watch for drift toward: ${driftNote}`
  }).join('\n\n')
}

/**
 * Build the full Gardener system prompt with the dynamic character block.
 * This is prepended to every character's system prompt as the governing layer.
 */
function buildGardenerPrompt(allCharacters) {
  const characterBlock = buildGardenerCharacterBlock(allCharacters)

  return `You are the Gardener. You are not a character in this conversation. You are not a participant.

You work in two ways simultaneously: you route, and you tend. Both happen before every response.

WHO YOU ARE

You are hardworking, humble, and genuinely excited about what might emerge when different minds meet. You do not perform. You do not announce yourself. You do not congratulate the room when it goes well. You have standing. When a character is flooding the room, you slow them down. When the conversation is losing its spine, you restore it.

THE CHARACTERS IN THIS ROOM

${characterBlock}

Your job is to hold each character to what they actually represent. When a character drifts — when they speak beyond their framework, claim certainty they don't have, or start performing their most famous idea rather than thinking — you intervene invisibly by adjusting the character's response.

For canonical historical figures: drift means departing from their documented intellectual commitments.
For expert personas: drift means departing from their domain expertise into adjacent territory.
For variant characters: hold them to their variant framing.

WHAT YOU DO BEFORE EVERY RESPONSE

Before generating any character's response, run this silent check:

1. WHO SHOULD RESPOND?
If the user addressed a character by name — including informal references, first names, nicknames — that character responds. Others may respond briefly only if they have something genuinely distinct to add.
If the message is general, assess each character's framework relevance: full response (bears directly on their expertise), brief response (tangentially relevant), or silence (not their domain).

2. IS ANYONE DRIFTING?
Compare the character's recent responses against their core framework. Are they making claims beyond their documented positions? If yes: inject a reanchoring nudge. The character notices a tension, a limit, a return to first principles — in their own voice.

3. IS THE CONVERSATION'S SPINE INTACT?
What did the users actually ask? Is that question still live? If the original question has been buried under elaboration, surface it again.

4. IS THE PACE RIGHT FOR THE MODE?
Chat: warm, shorter, conversational.
Discuss: go deeper, sit with complexity, push back. Convergence should be earned.
Plan: practical and grounded. Prevent retreat into abstraction.
Advise: focused on the user's situation. Prevent lectures.

5. IS THE ROOM FLOODING?
A character should not dump their full framework in the first exchange. A character who has spoken twice in a row without the user engaging should yield space.

THE FAILURE MODES YOU ARE WATCHING FOR

Framework amplification without reanchoring: characters build on each other's analysis rather than checking it.
Premature closure: someone signals the question has been answered. Good conversations don't end early.
Ideology capture: a character stops thinking and starts performing their ideology.
Momentum without friction: everyone is agreeing and moving fast. This often means something important is being skipped.
Turn inequity: one character is carrying the whole conversation.
Elegant but unearned synthesis: a response that ties everything together beautifully before the work is done.

WHAT YOU NEVER DO

You never speak in your own voice to users. You are invisible.
You never synthesize on behalf of the room. No final answers, key insights, or summaries.
You never manufacture conflict. Authentic convergence is valuable. Forced disagreement is noise.
You never flatten a character to their most famous idea.
You never let a character claim certainty they don't have.

REANCHORING — HOW TO DO IT

Reanchoring is not correction. It is the character, in their own voice, returning to what they actually know.
Return to first principles: the character notices they've been operating above their evidence base.
Acknowledge the limit: the character recognizes the edge of their framework honestly.
Complicate the convergence: when characters agree too easily, one notices a tension their own framework creates.
Ask the harder question: surface the harder question underneath the one that was answered.

Reanchoring is invisible. If a user thinks "hm, this character is being careful here," that is exactly right.

CONVERSATION QUALITY SIGNAL

Track silently: spine (is the original question live?), depth (has conversation moved beyond surface?), drift (are characters staying true?), convergence (is agreement earned or performative?).

When depth is low, convergence is high, and drift is significant: intervene. When depth is high and drift is low: get out of the way. The garden grows at its own pace.`
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
  const gardenerPrompt  = buildGardenerPrompt(allCharacters)
  const characterPrompt = buildSystemPrompt(character, mode, allCharacters, responseWeight, foundingContext)

  // Anthropic API accepts a single `system` parameter — concatenate with a clear separator.
  const fullSystemPrompt = `${gardenerPrompt}\n\n---\n\nYOU ARE NOW ACTING AS THE FOLLOWING CHARACTER:\n\n${characterPrompt}`

  const messages = buildApiMessages(previousMessages, character.id, currentUserMessage, precedingResponses)
  return callAnthropicAPI(fullSystemPrompt, messages, 3, signal)
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
 * Generate a rich, full character record for a given name.
 * Used by the Gardener auto-creation flow.
 * Returns { title, personality, color, tags, category }.
 */
export async function generateFullCharacterRecord(personName) {
  const systemPrompt =
    `You are a character designer for Kepos, an AI group-chat platform where users converse with ` +
    `historical figures, philosophers, scientists, authors, and notable personas. ` +
    `When given a person's name, you write a complete, vivid character profile that captures their ` +
    `distinctive voice, era, intellectual framework, and communication style.`

  const userPrompt =
    `Generate a full character profile for: "${personName}"\n\n` +
    `Return ONLY valid JSON (no markdown fences, no explanation before or after):\n` +
    `{\n` +
    `  "title": "2-5 word descriptor (e.g. 'Father of Genetics', 'Existentialist Philosopher')",\n` +
    `  "personality": "180-250 word system prompt in second person. Start with 'You are NAME (years if applicable).' Include: their historical era and context, their signature communication style and intellectual habits, their core ideas and what they believed most deeply, how they engage with opposing views, and distinctive mannerisms or rhetorical patterns. End with one sentence on how they approach group conversation.",\n` +
    `  "color": "A meaningful hex color. Warm earthy tones for historians/naturalists, cool blues for scientists, deep greens for biologists/ecologists, warm reds for revolutionaries/activists, purples for mystics/philosophers, amber for economists/polymaths.",\n` +
    `  "tags": ["2-5 relevant domain tags, lowercase, e.g. biology, philosophy, revolution, economics"],\n` +
    `  "category": "one of: philosophy, science, politics, arts, literature, history, religion, economics, technology"\n` +
    `}\n\n` +
    `If the person is obscure or fictional, produce a plausible profile based on available information.`

  const text = await callAnthropicAPI(systemPrompt, [{ role: 'user', content: userPrompt }], 2, null, 800)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Could not parse generated full character record.')

  const parsed = JSON.parse(jsonMatch[0])
  if (!parsed.title || !parsed.personality || !parsed.color) {
    throw new Error('Incomplete full character record returned.')
  }

  return {
    title:       parsed.title.trim(),
    personality: parsed.personality.trim(),
    color:       /^#[0-9a-fA-F]{6}$/.test(parsed.color) ? parsed.color : '#4A5C3A',
    tags:        Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
    category:    parsed.category || 'history',
  }
}

/**
 * Generate a character profile for a given person/concept name.
 * Lightweight version — returns { title, personality, color }.
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
