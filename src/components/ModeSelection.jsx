import { useState } from 'react'
import { modes } from '../data/modes.js'

export default function ModeSelection({ onSelectMode, onBack, isPremium, branchContext }) {
  const [premiumClickedMode, setPremiumClickedMode] = useState(null)

  const handleModeClick = (mode) => {
    if (mode.premium && !isPremium) {
      setPremiumClickedMode(mode.id)
      return
    }
    setPremiumClickedMode(null)
    onSelectMode(mode)
  }

  return (
    <div className="mode-screen">
      <div className="screen-header">
        <button className="screen-back-btn" onClick={onBack}>
          ← Back
        </button>
        <h1 className="screen-title">{branchContext ? 'Branch: Choose a Mode' : 'Choose a Mode'}</h1>
        <p className="screen-subtitle">How do you want your AI characters to engage?</p>
        {branchContext && (
          <div className="branch-context-banner">
            ⎇ Branching from <strong>{branchContext.parentRoomId}</strong>
            {branchContext.branchedAt?.contentSnippet && (
              <span className="branch-context-snippet"> · "{branchContext.branchedAt.contentSnippet}"</span>
            )}
          </div>
        )}
      </div>

      <div className="mode-grid">
        {modes.map(mode => {
          const locked = mode.premium && !isPremium
          return (
            <button
              key={mode.id}
              className={`mode-card ${locked ? 'mode-card-locked' : ''}`}
              onClick={() => handleModeClick(mode)}
            >
              {locked && <span className="mode-lock">✦ Premium</span>}
              <span className="mode-icon">{mode.icon}</span>
              <div className="mode-name">{mode.name}</div>
              <div className="mode-tagline">{mode.tagline}</div>
              <div className="mode-description">{mode.description}</div>
            </button>
          )
        })}
      </div>

      {premiumClickedMode && (
        <div className="mode-premium-msg">
          ✦ <strong>Plan</strong> and <strong>Advise</strong> modes require Premium.
          Toggle <strong>Enable Premium</strong> in the top bar to try them out.
        </div>
      )}
    </div>
  )
}
