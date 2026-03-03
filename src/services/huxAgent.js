/**
 * huxAgent.js
 *
 * Hux is a border collie. He watches for framework amplification and generic
 * response patterns only. He barks when he sees them. His bark goes to
 * gardener_memory. He is always present.
 *
 * Runs after each character response is generated, in parallel with Bugs.
 * Does not write to library_reports. Does not affect conversation output directly.
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

// ── Hux assessment system prompt ──────────────────────────────────────────────

const HUX_SYSTEM_PROMPT = `You are watching this conversation for two specific failure modes only.

Framework amplification: Are characters building on each other's incomplete analysis rather than returning to their source frameworks? Is the conversation drifting from what the characters actually represent while sounding coherent?

Generic response pattern: Is this response following the acknowledge-gesture-pivot structure? Does it acknowledge the previous speaker, gesture at having considered their point, then pivot to its own position with "but" or "however"? This pattern produces the appearance of engagement without its substance.

Return JSON only. No preamble. No explanation.
Format:
{
  "bark": bool,
  "failure_mode": "framework_amplification|generic_response|both|none",
  "confidence": "low|medium|high",
  "specific_observation": "string — brief, precise description of what triggered the bark"
}`

// ── Main Hux assessment ───────────────────────────────────────────────────────

/**
 * Run Hux assessment on character responses.
 * Fire-and-forget side effects (writes to agent_signals, gardener_memory).
 * Does not write to library_reports. Does not affect conversation output.
 *
 * @param {object[]} characterResponses — [{ characterName, content }]
 * @param {string}   roomId
 * @param {number}   turnNumber
 * @param {boolean}  huxEnabled         — dev toggle
 * @returns {object|null} assessment result (for logging)
 */
export async function runHuxAssessment(
  characterResponses = [],
  roomId,
  turnNumber = 0,
  huxEnabled = true,
) {
  if (!huxEnabled) {
    console.log('[Hux] Assessment skipped — HUX toggle is OFF')
    return null
  }

  if (characterResponses.length === 0) return null

  try {
    const responseText = characterResponses
      .map(r => `${r.characterName}: "${r.content.slice(0, 300).replace(/\n/g, ' ')}"`)
      .join('\n\n')

    const userContent = `Character responses this turn:\n\n${responseText}`

    const raw     = await callHaiku(HUX_SYSTEM_PROMPT, userContent)
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const result  = JSON.parse(cleaned)

    console.log('[Hux] Assessment:', JSON.stringify(result))

    if (result.bark) {
      console.log('[Hux] Bark! failure_mode:', result.failure_mode, '| confidence:', result.confidence)
      _writeHuxBarkSignal(roomId, result, turnNumber).catch(() => {})
      _writeHuxBarkToMemory(roomId, result, turnNumber).catch(() => {})
    }

    return result
  } catch (err) {
    console.warn('[Hux] Assessment error:', err.message)
    return null
  }
}

async function _writeHuxBarkSignal(roomId, result, turnNumber) {
  if (!supabase || !roomId) return
  await supabase.from('agent_signals').insert({
    room_id:      roomId,
    agent_source: 'hux',
    signal_type:  'hux_bark',
    signal_data:  {
      failure_mode:        result.failure_mode,
      confidence:          result.confidence,
      specific_observation: result.specific_observation,
    },
    turn_number: turnNumber,
  })
}

async function _writeHuxBarkToMemory(roomId, result, turnNumber) {
  if (!supabase || !roomId) return

  const barkInstance = {
    turn:                 turnNumber,
    failure_mode:         result.failure_mode,
    confidence:           result.confidence,
    specific_observation: result.specific_observation,
    timestamp:            new Date().toISOString(),
  }

  // Append to hux_bark_instances in gardener_memory
  const { data: existing } = await supabase
    .from('gardener_memory')
    .select('hux_bark_instances')
    .eq('room_id', roomId)
    .maybeSingle()

  if (existing) {
    const current = existing.hux_bark_instances || []
    await supabase
      .from('gardener_memory')
      .update({
        hux_bark_instances: [...current, barkInstance],
        updated_at:         new Date().toISOString(),
      })
      .eq('room_id', roomId)
  }
}
