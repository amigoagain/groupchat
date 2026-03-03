/**
 * gooseAgent.js
 *
 * The Goose is a stateless governance signal agent.
 * She listens and honks. She holds no memory between honks.
 *
 * Honk 1 — Stroll initiation: writes goose_honk to agent_signals with turn_count_total.
 * Honk 2 — /farmer or governance collapse: collects state, writes to library_reports,
 *           sends summary to user.
 */

import { supabase } from '../lib/supabase.js'

// ── Governance collapse detection ─────────────────────────────────────────────

/**
 * Check if governance collapse threshold is met for a room.
 * Threshold: 3+ governance_failure signals in agent_signals for same room within 10 turns.
 * Returns true if collapse detected.
 */
export async function checkGovernanceCollapse(roomId, currentTurnNumber) {
  if (!supabase || !roomId) return false
  try {
    const windowStart = Math.max(0, currentTurnNumber - 10)
    const { data, error } = await supabase
      .from('agent_signals')
      .select('id')
      .eq('room_id', roomId)
      .eq('signal_type', 'governance_collapse')
      .gte('turn_number', windowStart)

    if (error) return false
    return (data || []).length >= 3
  } catch {
    return false
  }
}

// ── Honk 1 — Stroll initiation ────────────────────────────────────────────────

/**
 * Fire Honk 1: write goose_honk signal to agent_signals on stroll creation.
 * All agents read this on first invocation in a stroll room.
 *
 * @param {string} roomId
 * @param {number} turnCountTotal — user's chosen stroll turn count
 */
export async function gooseHonk1(roomId, turnCountTotal) {
  if (!supabase || !roomId) return

  console.log('[Goose] Honk 1 — stroll initiation | room:', roomId, '| turns:', turnCountTotal)

  try {
    await supabase.from('agent_signals').insert({
      room_id:      roomId,
      agent_source: 'goose',
      signal_type:  'goose_honk',
      signal_data:  { turn_count_total: turnCountTotal, room_id: roomId },
      turn_number:  0,
    })
  } catch (err) {
    console.warn('[Goose] Honk 1 insert error:', err.message)
  }
}

// ── Honk 2 — /farmer or governance collapse ───────────────────────────────────

/**
 * Fire Honk 2: collect current state from all agents, write to library_reports,
 * return a summary string to display to the user as a system message.
 *
 * @param {string} roomId
 * @param {'farmer_trigger'|'governance_collapse'} triggerType
 * @param {boolean} gooseEnabled — if false, Honk 2 is suppressed (but still returns null gracefully)
 * @returns {string|null} Summary text for display to user, or null if suppressed
 */
export async function gooseHonk2(roomId, triggerType, gooseEnabled = true) {
  if (!supabase || !roomId) return null

  console.log('[Goose] Honk 2 — trigger:', triggerType, '| room:', roomId)

  if (!gooseEnabled) {
    console.log('[Goose] Honk 2 suppressed — GOOSE toggle is OFF')
    return null
  }

  try {
    // Collect state from all available agents
    const [agentSignalsResult, weatherResult, gardenerResult] = await Promise.all([
      supabase.from('agent_signals')
        .select('*')
        .eq('room_id', roomId)
        .order('timestamp', { ascending: false })
        .limit(20),
      supabase.from('weather_state')
        .select('*')
        .eq('room_id', roomId)
        .order('timestamp', { ascending: false })
        .limit(1),
      supabase.from('gardener_memory')
        .select('*')
        .eq('room_id', roomId)
        .maybeSingle(),
    ])

    const recentSignals  = agentSignalsResult.data || []
    const latestWeather  = weatherResult.data?.[0] || null
    const gardenerMemory = gardenerResult.data || null

    // Build collected data payload
    const collectedData = {
      trigger_type:    triggerType,
      room_id:         roomId,
      timestamp:       new Date().toISOString(),
      recent_signals:  recentSignals.slice(0, 10).map(s => ({
        signal_type:  s.signal_type,
        agent_source: s.agent_source,
        turn_number:  s.turn_number,
        signal_data:  s.signal_data,
      })),
      weather_conditions: latestWeather?.current_conditions || null,
      gardener_state: gardenerMemory ? {
        conversation_phase: gardenerMemory.conversation_phase,
        turn_count:         gardenerMemory.turn_count,
        seasonal_position:  gardenerMemory.seasonal_position,
        conversation_spine: gardenerMemory.conversation_spine,
        ladybug_count:      (gardenerMemory.ladybug_instances || []).length,
        hux_bark_count:     (gardenerMemory.hux_bark_instances || []).length,
      } : null,
    }

    // Write to library_reports
    await supabase.from('library_reports').insert({
      report_type:  triggerType === 'farmer_trigger' ? 'governance_failure' : 'governance_failure',
      room_id:      roomId,
      content:      collectedData,
      generated_by: 'goose',
      is_public:    false,
    })

    // Also write a signal to agent_signals
    await supabase.from('agent_signals').insert({
      room_id:      roomId,
      agent_source: 'goose',
      signal_type:  triggerType === 'farmer_trigger' ? 'farmer_trigger' : 'governance_collapse',
      signal_data:  { collected_data: collectedData },
      turn_number:  gardenerMemory?.turn_count || 0,
    })

    // Build summary string for user display
    const lines = ['[Goose] Governance report collected.']

    if (gardenerMemory) {
      lines.push(`Turn ${gardenerMemory.turn_count} | Phase: ${gardenerMemory.conversation_phase}`)
      if (gardenerMemory.seasonal_position) {
        lines.push(`Season: ${gardenerMemory.seasonal_position}`)
      }
      if (gardenerMemory.ladybug_instances?.length > 0) {
        lines.push(`Ladybug instances: ${gardenerMemory.ladybug_instances.length}`)
      }
      if (gardenerMemory.hux_bark_instances?.length > 0) {
        lines.push(`Hux barks: ${gardenerMemory.hux_bark_instances.length}`)
      }
    }

    if (latestWeather?.current_conditions) {
      const cond = latestWeather.current_conditions
      const active = []
      if (cond.wind?.present)         active.push(`wind (${cond.wind.intensity})`)
      if (cond.rain?.present)         active.push('rain')
      if (cond.frost?.present)        active.push('frost')
      if (cond.drought?.present)      active.push('drought')
      if (cond.tornado_watch?.present) active.push(`tornado watch (${cond.tornado_watch.confidence})`)
      if (active.length > 0) lines.push(`Weather: ${active.join(', ')}`)
    }

    lines.push('Report written to Library.')
    const summary = lines.join('\n')
    console.log('[Goose] Honk 2 summary:', summary)
    return summary

  } catch (err) {
    console.warn('[Goose] Honk 2 error:', err.message)
    return '[Goose] Governance report collection failed.'
  }
}

/**
 * Read the goose_honk signal for a stroll room.
 * Used by other agents to receive turn_count_total on stroll init.
 *
 * @param {string} roomId
 * @returns {{ turn_count_total: number }|null}
 */
export async function readGooseHonk(roomId) {
  if (!supabase || !roomId) return null
  try {
    const { data } = await supabase
      .from('agent_signals')
      .select('signal_data')
      .eq('room_id', roomId)
      .eq('signal_type', 'goose_honk')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data?.signal_data || null
  } catch {
    return null
  }
}
