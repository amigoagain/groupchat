/**
 * DevPanel.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Research instrument for controlled testing of the Gardener architecture.
 * This is NOT a product feature. Remove before public launch.
 *
 * Visible only when the authenticated user matches VITE_DEV_USER_ID.
 * Renders a persistent banner at the very top of the app:
 *   - Olive green when all governance layers are ON (normal research state)
 *   - Amber when any layer is toggled OFF (modified research state — clear warning)
 *
 * Clicking the banner opens/closes the toggle panel.
 * Toggle states persist in localStorage across page refresh.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from 'react'
import { useDevMode } from '../contexts/DevModeContext.jsx'
import TranscriptImportModal from './TranscriptImportModal.jsx'

export default function DevPanel() {
  const {
    isDevUser,
    routerEnabled,
    memoryEnabled,
    gardenerEnabled,
    gooseEnabled,
    weatherEnabled,
    bugsEnabled,
    huxEnabled,
    toggleRouter,
    toggleMemory,
    toggleGardener,
    toggleGoose,
    toggleWeather,
    toggleBugs,
    toggleHux,
  } = useDevMode()

  const [open,       setOpen]       = useState(false)
  const [showImport, setShowImport] = useState(false)

  // Not the dev user — render nothing, leave no trace
  if (!isDevUser) return null

  const allOn    = routerEnabled && memoryEnabled && gardenerEnabled && gooseEnabled && weatherEnabled && bugsEnabled && huxEnabled
  const bannerBg = allOn ? '#5a6b2e' : '#b07d1a'
  const panelBg  = allOn ? '#4a5a24' : '#9a6c14'

  const stateLabel = [
    `Router ${routerEnabled   ? 'ON' : 'OFF'}`,
    `Memory ${memoryEnabled   ? 'ON' : 'OFF'}`,
    `Gardener ${gardenerEnabled ? 'ON' : 'OFF'}`,
    `Goose ${gooseEnabled    ? 'ON' : 'OFF'}`,
    `Weather ${weatherEnabled  ? 'ON' : 'OFF'}`,
    `Bugs ${bugsEnabled     ? 'ON' : 'OFF'}`,
    `Hux ${huxEnabled      ? 'ON' : 'OFF'}`,
  ].join(' | ')

  return (
    <>
      {/* Persistent top banner */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          position:       'fixed',
          top:            0,
          left:           0,
          right:          0,
          zIndex:         9999,
          background:     bannerBg,
          color:          '#fff',
          fontSize:       '10px',
          fontFamily:     'monospace',
          fontWeight:     600,
          letterSpacing:  '0.03em',
          padding:        '4px 12px',
          cursor:         'pointer',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          userSelect:     'none',
          transition:     'background 0.25s',
          flexWrap:       'wrap',
          gap:            '4px',
        }}
        title={open ? 'Close dev panel' : 'Open dev panel'}
      >
        <span>⚗ DEV {allOn ? '' : '⚠ MODIFIED'}</span>
        <span style={{ opacity: 0.85, flex: '1 1 auto', textAlign: 'center', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {stateLabel}
        </span>
        <span style={{ opacity: 0.7, fontSize: '10px' }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* Toggle panel */}
      {open && (
        <div
          style={{
            position:   'fixed',
            top:        '24px',
            left:       0,
            right:      0,
            zIndex:     9998,
            background: panelBg,
            color:      '#fff',
            fontFamily: 'monospace',
            fontSize:   '12px',
            padding:    '10px 16px 14px',
            boxShadow:  '0 4px 12px rgba(0,0,0,0.3)',
            transition: 'background 0.25s',
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ marginBottom: 8, opacity: 0.7, fontSize: '11px' }}>
            Kepos agent toggles — research use only
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <ToggleRow
              label="Router"
              description="Routes which characters respond and in what mode"
              enabled={routerEnabled}
              onToggle={toggleRouter}
            />
            <ToggleRow
              label="Memory"
              description="Fetches and updates per-room Gardener memory state"
              enabled={memoryEnabled}
              onToggle={toggleMemory}
            />
            <ToggleRow
              label="Gardener"
              description="Includes Gardener V2 governance + ladybug/hux protocols in character prompts"
              enabled={gardenerEnabled}
              onToggle={toggleGardener}
            />
            <ToggleRow
              label="Goose"
              description="Goose Honk 2 on /farmer or governance collapse (Honk 1 always fires)"
              enabled={gooseEnabled}
              onToggle={toggleGoose}
            />
            <ToggleRow
              label="Weather"
              description="Weather assessment after each message, writes to weather_state"
              enabled={weatherEnabled}
              onToggle={toggleWeather}
            />
            <ToggleRow
              label="Bugs"
              description="Constitutional assessment after each response; releases ladybug signals"
              enabled={bugsEnabled}
              onToggle={toggleBugs}
            />
            <ToggleRow
              label="Hux"
              description="Framework amplification and generic response pattern detection"
              enabled={huxEnabled}
              onToggle={toggleHux}
            />
          </div>

          <div style={{ marginTop: 8, opacity: 0.55, fontSize: '10px' }}>
            States persist across refresh · Reset to all-ON by clearing localStorage
          </div>

          {/* Admin tools */}
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ opacity: 0.7, fontSize: '11px', marginBottom: 8 }}>Admin tools</div>
            <button
              onClick={() => { setOpen(false); setShowImport(true) }}
              style={{
                background:   'rgba(255,255,255,0.15)',
                border:       '1px solid rgba(255,255,255,0.25)',
                borderRadius: '4px',
                color:        '#fff',
                fontFamily:   'monospace',
                fontSize:     '11px',
                padding:      '4px 12px',
                cursor:       'pointer',
              }}
            >
              Import Transcript
            </button>
          </div>
        </div>
      )}

      {/* Transcript import modal */}
      {showImport && (
        <TranscriptImportModal onClose={() => setShowImport(false)} />
      )}

      {/* Spacer so content below the banner is not obscured */}
      <div style={{ height: '24px', flexShrink: 0 }} />
    </>
  )
}

function ToggleRow({ label, description, enabled, onToggle }) {
  return (
    <div
      style={{
        display:       'flex',
        flexDirection: 'column',
        gap:           3,
        minWidth:      130,
        flex:          '1 1 130px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          onClick={onToggle}
          style={{
            background:   enabled ? '#7ab648' : '#c0392b',
            border:       'none',
            borderRadius: '3px',
            color:        '#fff',
            fontFamily:   'monospace',
            fontWeight:   700,
            fontSize:     '11px',
            padding:      '2px 8px',
            cursor:       'pointer',
            minWidth:     38,
            transition:   'background 0.15s',
          }}
        >
          {enabled ? 'ON' : 'OFF'}
        </button>
        <span style={{ fontWeight: 700 }}>{label}</span>
      </div>
      <div style={{ opacity: 0.6, fontSize: '10px', paddingLeft: 2 }}>{description}</div>
    </div>
  )
}
