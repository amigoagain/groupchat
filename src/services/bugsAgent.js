/**
 * bugsAgent.js
 *
 * Bugs is a stateless agent that reads character responses against the
 * constitutional layer. When aphids are found it releases ladybugs to the Gardener.
 *
 * Runs after each character response is generated, before it is returned to the user.
 * Runs in parallel with Hux.
 */

import { supabase } from '../lib/supabase.js'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const API_URL     = 'https://api.anthropic.com/v1/messages'

function getApiKey() {
  const viteKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (viteKey && viteKey.length > 10 && viteKey !== 'your_api_key_here') return viteKey
  const envKey = import.meta.env.REACT_APP_ANTHROPIC_API_KEY
  if (envKey && envKey.length > 10 && envKey !== 'your_api_key_here') return envKey
  return (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('GROUPCHAT_API_KEY')) || ''
}

async function callHaiku(systemPrompt, userContent) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('No API key configured')

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type':                              'application/json',
      'x-api-key':                                 apiKey,
      'anthropic-version':                         '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model:      HAIKU_MODEL,
      max_tokens: 400,
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

// ── Constitutional layer fetch ─────────────────────────────────────────────────

/**
 * Fetch constitution for a given character from the constitutional_layer table.
 * Returns null if no constitution exists.
 */
async function fetchConstitution(characterId, characterName) {
  if (!supabase) return null
  try {
    // Try by character_id first, then by name
    let { data } = await supabase
      .from('constitutional_layer')
      .select('*')
      .eq('character_id', characterId)
      .maybeSingle()

    if (!data) {
      const result = await supabase
        .from('constitutional_layer')
        .select('*')
        .ilike('character_name', characterName)
        .maybeSingle()
      data = result.data
    }

    return data || null
  } catch {
    return null
  }
}

/**
 * Log missing constitution to library_reports.
 */
async function logMissingConstitution(characterId, characterName, roomId) {
  if (!supabase) return
  try {
    await supabase.from('library_reports').insert({
      report_type:  'bugs_data',
      room_id:      roomId || null,
      content:      {
        type:           'missing_constitution',
        character_id:   characterId,
        character_name: characterName,
        timestamp:      new Date().toISOString(),
      },
      generated_by: 'bugs',
      is_public:    false,
    })
  } catch {}
}

// ── Bugs assessment system prompt ─────────────────────────────────────────────

function buildBugsSystemPrompt(constitution) {
  const commitmentLines = [
    constitution.commitment_1,
    constitution.commitment_2,
    constitution.commitment_3,
    constitution.commitment_4,
    constitution.commitment_5,
    constitution.commitment_6,
    constitution.commitment_7,
  ]
    .filter(Boolean)
    .map((c, i) => `${i + 1}. ${c}`)
    .join('\n')

  return `You are reading a character response against the character's constitutional commitments. Assess for two aphid types.

Character: ${constitution.character_name}
Constitutional commitments:
${commitmentLines}

Character drift: Does this response violate any of the character's inviolable commitments as specified above? Assess each commitment individually.

False convergence: If multiple characters have responded in this turn, does the aggregate suggest characters with genuinely incompatible constitutional commitments are arriving at agreement in a way that cannot be reconciled with their constitutions?

Return JSON only. No preamble. No explanation.
Format:
{
  "aphid_found": bool,
  "aphid_type": "character_drift|false_convergence|none",
  "character_name": "string|null",
  "commitment_violated": "string|null",
  "confidence": "low|medium|high",
  "ladybug_signal": bool
}`
}

// ── Main Bugs assessment ──────────────────────────────────────────────────────

/**
 * Run Bugs assessment on a character response.
 * Fire-and-forget side effects (writes to agent_signals, gardener_memory, library_reports).
 * Does not affect conversation output directly.
 *
 * @param {string}   characterId
 * @param {string}   characterName
 * @param {string}   characterResponse    — the full response text
 * @param {object[]} allResponsesthisTurn — [{ characterName, content }] for all characters this turn
 * @param {string}   roomId
 * @param {number}   turnNumber
 * @param {boolean}  bugsEnabled          — dev toggle
 * @returns {object|null} assessment result (for logging)
 */
export async function runBugsAssessment(
  characterId,
  characterName,
  characterResponse,
  allResponsesThisTurn = [],
  roomId,
  turnNumber = 0,
  bugsEnabled = true,
) {
  if (!bugsEnabled) {
    console.log('[Bugs] Assessment skipped — BUGS toggle is OFF')
    return null
  }

  try {
    // Fetch constitution
    const constitution = await fetchConstitution(characterId, characterName)

    if (!constitution) {
      console.log('[Constitutional] Missing constitution for:', characterName)
      logMissingConstitution(characterId, characterName, roomId).catch(() => {})
      return { aphid_found: false, aphid_type: 'none', missing_constitution: true }
    }

    console.log('[Constitutional] Loaded constitution for:', characterName)

    const systemPrompt = buildBugsSystemPrompt(constitution)

    // Build user content with the character response and aggregate of other responses
    let userContent = `Character response to assess:\n"${characterResponse}"`

    if (allResponsesThisTurn.length > 1) {
      const otherResponses = allResponsesThisTurn
        .filter(r => r.characterName !== characterName)
        .map(r => `${r.characterName}: "${r.content.slice(0, 200)}"`)
        .join('\n')
      if (otherResponses) {
        userContent += `\n\nOther character responses this turn (for false convergence check):\n${otherResponses}`
      }
    }

    const raw     = await callHaiku(systemPrompt, userContent)
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const result  = JSON.parse(cleaned)

    console.log('[Bugs] Assessment for', characterName, ':', JSON.stringify(result))

    // If ladybug signal, fire side effects
    if (result.ladybug_signal) {
      console.log('[Bugs] Ladybug signal — aphid_type:', result.aphid_type, '| character:', result.character_name)
      _writeLadybugSignal(roomId, result, turnNumber).catch(() => {})
      _writeLadybugToMemory(roomId, result, turnNumber).catch(() => {})
      _writeBugsToLibrary(roomId, result, characterName).catch(() => {})
    }

    return result
  } catch (err) {
    console.warn('[Bugs] Assessment error:', err.message)
    return null
  }
}

async function _writeLadybugSignal(roomId, result, turnNumber) {
  if (!supabase || !roomId) return
  await supabase.from('agent_signals').insert({
    room_id:      roomId,
    agent_source: 'bugs',
    signal_type:  'ladybug',
    signal_data:  {
      aphid_type:           result.aphid_type,
      character_name:       result.character_name,
      commitment_violated:  result.commitment_violated,
      confidence:           result.confidence,
    },
    turn_number: turnNumber,
  })
}

async function _writeLadybugToMemory(roomId, result, turnNumber) {
  if (!supabase || !roomId) return

  const ladybugInstance = {
    turn:                turnNumber,
    aphid_type:          result.aphid_type,
    character_name:      result.character_name,
    commitment_violated: result.commitment_violated,
    confidence:          result.confidence,
    timestamp:           new Date().toISOString(),
  }

  // Append to ladybug_instances in gardener_memory
  const { data: existing } = await supabase
    .from('gardener_memory')
    .select('ladybug_instances')
    .eq('room_id', roomId)
    .maybeSingle()

  if (existing) {
    const current = existing.ladybug_instances || []
    await supabase
      .from('gardener_memory')
      .update({
        ladybug_instances: [...current, ladybugInstance],
        updated_at:        new Date().toISOString(),
      })
      .eq('room_id', roomId)
  }
}

async function _writeBugsToLibrary(roomId, result, characterName) {
  if (!supabase) return
  await supabase.from('library_reports').insert({
    report_type:  'bugs_data',
    room_id:      roomId || null,
    content:      {
      ...result,
      character_name: characterName,
      timestamp:      new Date().toISOString(),
    },
    generated_by: 'bugs',
    is_public:    false,
  })
}
