/**
 * StrollConfig.jsx
 *
 * Stroll configuration screen. Shown when user triggers /stroll from any context.
 * Single input: turn count. No character selection. No mode selection.
 * Clean and minimal.
 */
import { useState } from 'react'

const MIN_TURNS = 8
const MAX_TURNS = 60
const DEFAULT_TURNS = 20

export default function StrollConfig({ onConfirm, onCancel }) {
  const [turnCount, setTurnCount] = useState(DEFAULT_TURNS)
  const [error, setError]         = useState('')

  const handleChange = (e) => {
    const val = parseInt(e.target.value, 10)
    setTurnCount(isNaN(val) ? '' : val)
    setError('')
  }

  const handleConfirm = () => {
    const n = parseInt(turnCount, 10)
    if (isNaN(n) || n < MIN_TURNS) {
      setError(`At least ${MIN_TURNS} turns required for a meaningful stroll.`)
      return
    }
    if (n > MAX_TURNS) {
      setError(`Maximum ${MAX_TURNS} turns.`)
      return
    }
    onConfirm(n)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleConfirm()
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div style={{
      display:         'flex',
      flexDirection:   'column',
      alignItems:      'center',
      justifyContent:  'center',
      height:          '100vh',
      padding:         '32px 24px',
      background:      '#1a1a1a',
      color:           '#e8e4dc',
    }}>
      <div style={{
        maxWidth: 400,
        width:    '100%',
      }}>
        <div style={{
          fontFamily:    'Georgia, serif',
          fontSize:      '13px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color:         '#6b7c47',
          marginBottom:  '28px',
        }}>
          Stroll
        </div>

        <p style={{
          fontFamily:   'Georgia, serif',
          fontSize:     '16px',
          lineHeight:   1.6,
          color:        '#b8b0a0',
          marginBottom: '32px',
        }}>
          How long would you like to walk?
        </p>

        <div style={{ marginBottom: '24px' }}>
          <input
            type="number"
            value={turnCount}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            min={MIN_TURNS}
            max={MAX_TURNS}
            autoFocus
            style={{
              width:        '100%',
              padding:      '12px 16px',
              background:   '#242424',
              border:       `1px solid ${error ? '#c0392b' : '#3a3a3a'}`,
              borderRadius: '4px',
              color:        '#e8e4dc',
              fontSize:     '24px',
              fontFamily:   'Georgia, serif',
              textAlign:    'center',
              outline:      'none',
              boxSizing:    'border-box',
            }}
          />
          <div style={{
            marginTop:  '8px',
            fontSize:   '12px',
            color:      error ? '#c0392b' : '#5a5a5a',
            fontFamily: 'monospace',
            textAlign:  'center',
          }}>
            {error || `turns  ·  ${MIN_TURNS}–${MAX_TURNS}`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onCancel}
            style={{
              flex:         1,
              padding:      '11px',
              background:   'transparent',
              border:       '1px solid #3a3a3a',
              borderRadius: '4px',
              color:        '#6a6a6a',
              fontFamily:   'monospace',
              fontSize:     '13px',
              cursor:       'pointer',
            }}
          >
            cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              flex:         2,
              padding:      '11px',
              background:   '#4a5a24',
              border:       '1px solid #5a6b2e',
              borderRadius: '4px',
              color:        '#e8e4dc',
              fontFamily:   'monospace',
              fontSize:     '13px',
              fontWeight:   600,
              cursor:       'pointer',
            }}
          >
            begin stroll
          </button>
        </div>

        <div style={{
          marginTop:  '32px',
          fontSize:   '11px',
          color:      '#3a3a3a',
          fontFamily: 'monospace',
          textAlign:  'center',
          lineHeight: 1.5,
        }}>
          your current conversation will close<br />
          the stroll is its own room
        </div>
      </div>
    </div>
  )
}
