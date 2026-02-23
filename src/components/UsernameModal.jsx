import { useState, useEffect, useRef } from 'react'
import { getUsername } from '../utils/username.js'

export default function UsernameModal({ onSave, isRename = false }) {
  const [name, setName] = useState(isRename ? getUsername() : '')
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) { setError('Please enter your name'); return }
    if (trimmed.length > 32) { setError('Keep it under 32 characters'); return }
    onSave(trimmed)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' && isRename) onSave(null)
  }

  return (
    <div className="modal-overlay username-modal-overlay" onKeyDown={handleKeyDown}>
      <div className="username-modal-box">
        {!isRename && <div className="username-modal-icon">👋</div>}

        <h2 className="username-modal-title">
          {isRename ? 'Change your name' : "What's your name?"}
        </h2>
        <p className="username-modal-sub">
          {isRename
            ? 'Shows up in room invite messages.'
            : "We'll use it when you share rooms with friends."}
        </p>

        <form onSubmit={handleSubmit} className="username-form">
          <input
            ref={inputRef}
            type="text"
            className="username-input"
            placeholder="Your name..."
            value={name}
            onChange={e => { setName(e.target.value); setError('') }}
            maxLength={32}
            autoComplete="off"
            spellCheck={false}
          />
          {error && <p className="username-error">{error}</p>}
          <div className="username-form-actions">
            {isRename && (
              <button type="button" className="username-cancel-btn" onClick={() => onSave(null)}>
                Cancel
              </button>
            )}
            <button type="submit" className="username-save-btn">
              {isRename ? 'Save' : "Let's go →"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
