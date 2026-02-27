/**
 * gardenerMemory.js
 *
 * Two architectural layers that run around (not inside) character invocation:
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  GARDENER ROUTER  (runGardenerRouter)                               │
 * │  • Runs BEFORE any character is invoked                             │
 * │  • Lightweight haiku call — returns routing plan                    │
 * │  • Silence is architectural: characters not in plan are never called │
 * └─────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │  GARDENER MEMORY  (updateGardenerMemory)                            │
 * │  • Runs AFTER character responses are shown (fire-and-forget)       │
 * │  • Persists conversation state to gardener_memory table in Supabase │
 * │  • Feeds planting_signals when threshold conditions are met         │
 * └─────────────────────────────────────────────────────────────────────┘
 */

import { supabase } from '../lib/supabase.js'

// ── Model & API ───────────────────────────────────────────────────────────────

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const API_URL     = 'https://api.anthropic.com/v1/messages'

function getApiKey() {
  const viteKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (viteKey && viteKey.length > 10 && viteKey !== 'your_api_key_here') return viteKey
  const envKey = import.meta.env.REACT_APP_ANTHROPIC_API_KEY
  if (envKey && envKey.length > 10 && envKey !== 'your_api_key_here') return envKey
  return (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('GROUPCHAT_API_KEY')) || ''
}

/**
 * Lightweight API call to haiku model.
 * Returns the response text string.
 * Throws on network or API error.
 */
async function callHaikuAPI(systemPrompt, userContent) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('No API key configured')

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      HAIKU_MODEL,
      max_tokens: 600,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userContent }],
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Haiku API ${response.status}: ${body.slice(0, 200)}`)
  }

  const data = await response.json()
  return data.content[0].text
}

// ── Default memory ────────────────────────────────────────────────────────────

function defaultMemory() {
  return {
    conversation_phase:        'opening',
    turn_count:                0,
    character_drift:           {},
    intervention_log:          [],
    planting_signal_conditions: {
      unresolved_tension:    false,
      user_created_space:    false,
      genuine_surprise:      false,
      framework_convergence: false,
    },
    conversation_spine: '',
    last_signal_turn:   0,
  }
}

// ── Memory persistence ────────────────────────────────────────────────────────

/**
 * Fetch the gardener_memory record for a room, or create one if absent.
 * Returns defaultMemory() if Supabase is unavailable.
 */
export async function fetchOrCreateMemory(roomId) {
  if (!supabase || !roomId) return defaultMemory()

  try {
    const { data, error } = await supabase
      .from('gardener_memory')
      .select('*')
      .eq('room_id', roomId)
      .maybeSingle()

    if (error) {
      console.warn('[Memory] fetch error:', error.message)
      return defaultMemory()
    }

    if (data) return data

    // No record yet — create one
    const fresh = { room_id: roomId, ...defaultMemory() }
    const { data: created, error: insertErr } = await supabase
      .from('gardener_memory')
      .insert(fresh)
      .select()
      .single()

    if (insertErr) {
      console.warn('[Memory] create error:', insertErr.message)
      return defaultMemory()
    }

    return created
  } catch (err) {
    console.warn('[Memory] fetchOrCreateMemory exception:', err.message)
    return defaultMemory()
  }
}

// ── Gardener Router ───────────────────────────────────────────────────────────

const ROUTER_SYSTEM_PROMPT = `You are the Gardener Router. Your job is to decide which characters respond to a user message and at what depth.

You receive:
- The user message
- A list of characters with their framework summaries
- Current conversation memory (phase, turn count, conversation spine)

RULE 1 — DIRECT ADDRESS (apply first):
If the user message directly or informally addresses any character by name — full name, first name, partial name, or an informal reference — ONLY that character responds. All others are silent. Apply this rule before any other consideration.

RULE 2 — GENERAL MESSAGES:
Assess genuine relevance. A character is relevant if their intellectual framework speaks directly to this specific message. Not merely "they could say something" — they have something their framework uniquely contributes.

RULE 3 — PHASE-AWARE PACING:
- opening phase (turn_count 0–4): max 2 characters respond; ALL responding characters MUST be 'brief' — do not set any character to 'full' until Memory phase transitions to 'middle'. Brief means three sentences maximum, no exceptions.
- middle phase (turn_count 5–15): up to 3 characters can respond; mix 'full' and 'brief' based on genuine relevance
- late phase (turn_count > 15): allow 'full' responses where framework is directly engaged

MODE DEFINITIONS:
- "full"   — substantive response, normal character length
- "brief"  — 1-2 sentences only, a quick contribution
- "silent" — character is not invoked this turn

Return ONLY valid JSON. No preamble. No explanation. No markdown fences.

{
  "routing": [
    { "character": "ExactCharacterName", "respond": true,  "mode": "full"   },
    { "character": "ExactCharacterName", "respond": false, "mode": "silent" }
  ],
  "phase_assessment": "opening",
  "notes": "one sentence of reasoning"
}`

/**
 * Run the Gardener Router to produce a routing plan for this turn.
 *
 * Returns:
 *   { routing: [{ character, respond, mode }], phase_assessment, notes }
 *   or null if the call fails (caller falls back to all characters / full mode)
 *
 * @param {string}   userMessage
 * @param {object[]} characters  — room character objects
 * @param {object}   memory      — current gardener_memory record
 */
export async function runGardenerRouter(userMessage, characters, memory) {
  try {
    const characterSummaries = characters.map(c => {
      const snippet = (c.personality || '').slice(0, 150)
      return `- ${c.name} (${c.title || 'Thinker'}): ${snippet}`
    }).join('\n')

    const userContent =
      `User message: "${userMessage}"\n\n` +
      `Characters in this room:\n${characterSummaries}\n\n` +
      `Conversation memory:\n` +
      `- Phase: ${memory.conversation_phase}\n` +
      `- Turn count: ${memory.turn_count}\n` +
      `- Spine: ${memory.conversation_spine || '(conversation just started)'}`

    const raw     = await callHaikuAPI(ROUTER_SYSTEM_PROMPT, userContent)
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const plan    = JSON.parse(cleaned)

    console.log('[Router] phase:', plan.phase_assessment, '|', plan.notes)
    console.log('[Router] routing:', plan.routing.map(r => `${r.character}:${r.mode}`).join(', '))

    return plan
  } catch (err) {
    console.warn('[Router] failed, falling back to Weaver routing:', err.message)
    return null
  }
}

// ── Gardener Memory update ────────────────────────────────────────────────────

const MEMORY_UPDATE_SYSTEM_PROMPT = `You are the Gardener Memory system. After each conversation turn, update the memory record.

You receive:
- The user message this turn
- Character responses this turn (name + content)
- The current memory record

Update all fields as follows:

CHARACTER DRIFT: For each character who responded this turn, assess:
- Did they use the acknowledge-contemplate-but pattern? (acknowledge user, hedge with complexity, then add a contrastive point)
- Did they drift outside their stated intellectual framework into generic AI territory?
- Score 0–10: 0 = fully in character, 10 = indistinguishable from a generic AI response
- Note the drift type if score > 3 (e.g., "acknowledge-contemplate-but pattern", "framework drift into adjacent territory")

CONVERSATION SPINE: 2–3 sentences capturing what this conversation is actually about and what this turn added or shifted. This is the Gardener's private working understanding, not a user-facing summary.

PHASE: Determine from turn_count:
- "opening":  turn_count 0–4
- "middle":   turn_count 5–15
- "late":     turn_count > 15

PLANTING_SIGNAL_CONDITIONS — set each boolean based on this turn. These bars are HIGH. Default is false for all. Only set true when the condition is unambiguously met.
- unresolved_tension:    genuine opposing frameworks in play with a SPECIFIC named point of disagreement that has not resolved. Vague "different approaches" or "different perspectives" does not count. The seam must be specific and nameable.
- user_created_space:    user's message is notably SHORT or OPEN relative to their PREVIOUS messages in this conversation — a genuine pause, a name alone, a single word, a short open question. A normal-length message does not qualify even if it is phrased as a question.
- genuine_surprise:      a character EXPLICITLY CONTRADICTED or significantly revised a position they or another character held earlier in THIS SAME conversation — not just said something interesting or unexpected. There must be a specific prior position that was revised or overturned.
- framework_convergence: two or more characters arriving at the SAME SPECIFIC insight from demonstrably DIFFERENT starting frameworks — not just agreeing generally, but converging on an identical conclusion through distinct intellectual routes.

INTERVENTION_LOG: Pass through any existing entries unchanged. Add a new entry only if a character showed significant drift (score > 6) that would warrant a Gardener reanchoring.

Return ONLY valid JSON. No preamble. No explanation. No markdown fences.

{
  "conversation_phase": "opening",
  "turn_count": 1,
  "character_drift": {
    "CharacterName": { "score": 0, "note": "" }
  },
  "intervention_log": [],
  "planting_signal_conditions": {
    "unresolved_tension":    false,
    "user_created_space":    false,
    "genuine_surprise":      false,
    "framework_convergence": false
  },
  "conversation_spine": "..."
}`

/**
 * Update the gardener_memory record after a turn completes.
 * Fire-and-forget — never blocks response display.
 * Errors are swallowed; a console.warn is emitted on failure.
 *
 * @param {string}   userMessage
 * @param {object[]} characterResponses   — [{ characterName, content }]
 * @param {object}   currentMemory        — memory record fetched at turn start
 * @param {string}   roomId
 * @param {object[]} allCharacters        — room character objects (for planting signal)
 * @param {object}   mode                 — room mode object (for planting signal)
 */
export async function updateGardenerMemory(
  userMessage,
  characterResponses,
  currentMemory,
  roomId,
  allCharacters = [],
  mode          = null,
) {
  if (!supabase || !roomId) return

  try {
    const responseSummary = characterResponses.length > 0
      ? characterResponses.map(r => `${r.characterName}:\n"${r.content.slice(0, 400)}"`).join('\n\n')
      : '(no character responses this turn)'

    const userContent =
      `User message this turn: "${userMessage}"\n\n` +
      `Character responses this turn:\n${responseSummary}\n\n` +
      `Current memory record:\n${JSON.stringify(currentMemory, null, 2)}`

    const raw     = await callHaikuAPI(MEMORY_UPDATE_SYSTEM_PROMPT, userContent)
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const updated = JSON.parse(cleaned)

    // Authoritative turn count: always increment from what we know, ignore model's arithmetic
    updated.turn_count = (currentMemory.turn_count || 0) + 1

    // Carry forward last_signal_turn — the haiku model doesn't know this field
    updated.last_signal_turn = currentMemory.last_signal_turn || 0

    console.log('[Memory] turn:', updated.turn_count, '| phase:', updated.conversation_phase)
    console.log('[Memory] spine:', updated.conversation_spine)
    console.log('[Memory] conditions:', updated.planting_signal_conditions)

    // Persist — upsert on room_id unique constraint
    const { error } = await supabase
      .from('gardener_memory')
      .upsert(
        { room_id: roomId, ...updated, updated_at: new Date().toISOString() },
        { onConflict: 'room_id' },
      )

    if (error) {
      console.warn('[Memory] upsert error:', error.message)
      return
    }

    // Gate 1: minimum turn depth — no planting signals before turn 8
    if (updated.turn_count < 8) {
      console.log('[Memory] planting signal suppressed — turn', updated.turn_count, '< 8')
      return
    }

    // Gate 2: rate limit — no signal within 10 turns of the last one
    const turnsSinceLast = updated.turn_count - (currentMemory.last_signal_turn || 0)
    if (turnsSinceLast < 10) {
      console.log('[Memory] planting signal suppressed —', turnsSinceLast, 'turns since last signal (min 10)')
      return
    }

    // Gate 3: condition threshold — ≥2 conditions simultaneously true
    const conditions = updated.planting_signal_conditions || {}
    const trueCount  = Object.values(conditions).filter(Boolean).length
    if (trueCount >= 2) {
      _logPlantingSignalFromMemory(updated, roomId, allCharacters, mode)
    }
  } catch (err) {
    console.warn('[Memory] updateGardenerMemory error:', err.message)
  }
}

// ── Planting signal — memory-driven ──────────────────────────────────────────

/**
 * Write a planting_signals record when memory conditions threshold is met.
 * Fire-and-forget. Errors swallowed silently.
 */
function _logPlantingSignalFromMemory(memory, roomId, allCharacters, mode) {
  if (!supabase || !roomId) return

  const conditions = memory.planting_signal_conditions || {}
  const active = Object.entries(conditions)
    .filter(([, v]) => v)
    .map(([k]) => k)

  if (active.length < 2) return

  const record = {
    room_id:             roomId,
    character_config:    allCharacters.map(c => c.name),
    conversation_mode:   mode?.id || mode?.name || null,
    depth_level:         _phaseToDepth(memory.conversation_phase),
    tension_signature:   active.join(', '),
    user_move_signature: 'other',
    sequence_number:     memory.turn_count || null,
  }

  supabase
    .from('planting_signals')
    .insert(record)
    .then(({ error }) => {
      if (error) console.warn('[Memory] planting_signals insert error:', error.message)
      else console.log('[Memory] Planting signal logged — conditions:', active.join(' + '))
    })

  // Record the turn so the rate limit blocks the next 10 turns
  supabase
    .from('gardener_memory')
    .update({ last_signal_turn: memory.turn_count, updated_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .then(({ error }) => {
      if (error) console.warn('[Memory] last_signal_turn update error:', error.message)
    })
}

function _phaseToDepth(phase) {
  return { opening: 'surface', middle: 'engaged', late: 'working' }[phase] || 'surface'
}
