/**
 * weatherAgent.js
 *
 * Weather is a stateless agent that reads each turn fresh against weather models.
 * It does not carry a running model forward.
 *
 * Runs after each user message and before character invocation, alongside
 * the existing Router call. Uses the Haiku model.
 *
 * Writes results to weather_state table and writes a weather_report signal
 * to agent_signals. Does not send to Gardener or any conversation layer agent.
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
      max_tokens: 300,
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

// ── Weather assessment system prompt ──────────────────────────────────────────

const WEATHER_SYSTEM_PROMPT = `Assess the current atmospheric conditions of this conversation based on the current message and recent context. Evaluate for the following conditions and return structured JSON only.

Wind: Is there productive friction or challenge present? (boolean + intensity: low/medium/high)
Rain: Is there steady accumulation without escalation — sustained engagement, user returning to same question from different angles? (boolean)
Frost: Is there premature convergence — characters or user agreeing before anything real is established? (boolean)
Drought: Is energy leaving a conversation that should have momentum? (boolean)
Tornado watch: Are there signs of the formal apparatus spinning on itself — producing sensation of insight without substance, or something that feels too complete to be trusted? (boolean + confidence: low/medium)

Return JSON only. No preamble. No explanation.
Format:
{
  "wind": {"present": bool, "intensity": "low|medium|high"},
  "rain": {"present": bool},
  "frost": {"present": bool},
  "drought": {"present": bool},
  "tornado_watch": {"present": bool, "confidence": "low|medium"}
}`

// ── Main weather assessment ───────────────────────────────────────────────────

/**
 * Run a weather assessment for the current conversation turn.
 * Writes results to weather_state and agent_signals.
 * Does not return data to any conversation layer.
 *
 * @param {string}   roomId
 * @param {string}   userMessage         — current user message
 * @param {object[]} recentMessages      — recent message history for context
 * @param {number}   turnsElapsed        — current turns elapsed (for stroll rooms)
 * @param {number}   turnsRemaining      — remaining turns (for stroll rooms)
 * @param {number}   turnCountTotal      — total turn budget
 * @param {boolean}  weatherEnabled      — dev toggle
 * @returns {object|null} weather conditions JSON (for console logging only)
 */
export async function runWeatherAssessment(
  roomId,
  userMessage,
  recentMessages = [],
  turnsElapsed   = 0,
  turnsRemaining = 0,
  turnCountTotal = 0,
  weatherEnabled = true,
) {
  if (!weatherEnabled) {
    console.log('[Weather] Assessment skipped — WEATHER toggle is OFF')
    return null
  }

  try {
    // Build context from recent messages
    const contextLines = recentMessages
      .slice(-6)
      .map(m => {
        const name = m.characterName || m.senderName || (m.type === 'user' ? 'User' : 'Character')
        return `${name}: "${m.content.slice(0, 150).replace(/\n/g, ' ')}"`
      })
      .join('\n')

    const userContent =
      `Current message: "${userMessage}"\n\n` +
      `Recent conversation context:\n${contextLines || '(conversation just started)'}`

    const raw     = await callHaiku(WEATHER_SYSTEM_PROMPT, userContent)
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const conditions = JSON.parse(cleaned)

    console.log('[Weather] Assessment:', JSON.stringify(conditions))

    // Write to weather_state (fire-and-forget)
    _writeWeatherState(roomId, conditions, turnsElapsed, turnsRemaining, turnCountTotal)
    _writeWeatherSignal(roomId, conditions, turnsElapsed)

    return conditions
  } catch (err) {
    console.warn('[Weather] Assessment error:', err.message)
    return null
  }
}

async function _writeWeatherState(roomId, conditions, turnsElapsed, turnsRemaining, turnCountTotal) {
  if (!supabase || !roomId) return
  try {
    await supabase.from('weather_state').insert({
      room_id:            roomId,
      turn_count_total:   turnCountTotal,
      turns_elapsed:      turnsElapsed,
      turns_remaining:    turnsRemaining,
      current_conditions: conditions,
    })
  } catch (err) {
    console.warn('[Weather] weather_state insert error:', err.message)
  }
}

async function _writeWeatherSignal(roomId, conditions, turnNumber) {
  if (!supabase || !roomId) return
  try {
    await supabase.from('agent_signals').insert({
      room_id:      roomId,
      agent_source: 'weather',
      signal_type:  'weather_report',
      signal_data:  conditions,
      turn_number:  turnNumber,
    })
  } catch (err) {
    console.warn('[Weather] agent_signals insert error:', err.message)
  }
}

/**
 * Read the most recent weather conditions for a room.
 * Used by the copy-chat transcript builder.
 *
 * @param {string} roomId
 * @returns {object|null}
 */
export async function getLatestWeather(roomId) {
  if (!supabase || !roomId) return null
  try {
    const { data } = await supabase
      .from('weather_state')
      .select('current_conditions, turns_remaining, turns_elapsed')
      .eq('room_id', roomId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data || null
  } catch {
    return null
  }
}
