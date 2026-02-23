import { useState } from 'react'

export default function StartScreen({ onStartRoom, onJoinRoom, joinError, onClearJoinError }) {
  const [joinCode, setJoinCode] = useState('')

  const handleJoin = (e) => {
    e.preventDefault()
    if (joinCode.trim().length === 6) {
      onJoinRoom(joinCode.trim())
    }
  }

  return (
    <div className="start-screen">
      <div className="start-content">
        <div className="start-logo">GroupChat</div>
        <div className="start-tagline">Chat with multiple AI minds simultaneously</div>
        <div className="start-description">
          Pick 2–6 AI characters — philosophers, entrepreneurs, scientists, artists — and watch them talk to you
          and each other in real time.
        </div>

        <div className="start-actions">
          <button className="start-btn-primary" onClick={onStartRoom}>
            Start a Room
          </button>

          <div className="start-divider">or join an existing room</div>

          <form onSubmit={handleJoin} style={{ width: '100%', maxWidth: 360 }}>
            <div className="join-room-section">
              <input
                className="join-room-input"
                type="text"
                placeholder="Enter room code"
                maxLength={6}
                value={joinCode}
                onChange={e => {
                  setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                  onClearJoinError()
                }}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                className="join-room-btn"
                type="submit"
                disabled={joinCode.trim().length !== 6}
              >
                Join
              </button>
            </div>
            {joinError && <div className="join-error">{joinError}</div>}
          </form>
        </div>
      </div>
    </div>
  )
}
