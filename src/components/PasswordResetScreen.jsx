import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'

/**
 * PasswordResetScreen — shown when the user arrives via a Supabase
 * password-reset email link (PASSWORD_RECOVERY auth event).
 *
 * Props:
 *   onSuccess — called after the password has been successfully updated
 */
export default function PasswordResetScreen({ onSuccess }) {
  const { updatePassword } = useAuth()

  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [success,   setSuccess]   = useState(false)

  const clearError = () => setError('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    try {
      await updatePassword(password)
      setSuccess(true)
      setTimeout(() => onSuccess(), 1800)
    } catch (err) {
      const msg = err.message || ''
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('invalid')) {
        setError('This reset link has expired. Please request a new one from the sign-in screen.')
      } else {
        setError(msg || 'Password update failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-icon">✓</div>
          <h2 className="auth-title">Password updated</h2>
          <p className="auth-subtitle">You're signed in. Taking you back…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-icon">🔑</div>
        <h2 className="auth-title">Set a new password</h2>
        <p className="auth-subtitle">Choose a strong password for your Kepos account.</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-pw-wrap">
            <input
              className="auth-email-input auth-pw-input"
              type={showPw ? 'text' : 'password'}
              placeholder="New password (min 8 characters)"
              value={password}
              onChange={e => { setPassword(e.target.value); clearError() }}
              autoComplete="new-password"
              autoFocus
              disabled={loading}
            />
            <button
              type="button"
              className="auth-pw-toggle"
              onClick={() => setShowPw(v => !v)}
              tabIndex={-1}
            >
              {showPw ? '🙈' : '👁'}
            </button>
          </div>

          <input
            className="auth-email-input"
            type={showPw ? 'text' : 'password'}
            placeholder="Confirm new password"
            value={confirm}
            onChange={e => { setConfirm(e.target.value); clearError() }}
            autoComplete="new-password"
            disabled={loading}
          />

          {error && <div className="auth-error">{error}</div>}

          <button
            className="auth-submit-btn"
            type="submit"
            disabled={loading || !password.trim()}
          >
            {loading
              ? <><span className="auth-spinner" /> Setting password…</>
              : 'Set new password →'
            }
          </button>
        </form>

        <div className="auth-guest-note">
          <span className="auth-reset-hint">
            Link expired?{' '}
            <button
              className="auth-guest-link"
              type="button"
              onClick={() => onSuccess()}
            >
              Back to sign in
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
