import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'

/**
 * AccountScreen — shown when a signed-in user taps "Account" in the menu.
 *
 * Displays email + username, offers sign-out, and can trigger a password-
 * reset email so the user can change their password.
 *
 * Props:
 *   onBack  — return to the entry screen
 */
export default function AccountScreen({ onBack }) {
  const { authUser, profile, signOut, sendPasswordReset } = useAuth()

  const [signingOut,  setSigningOut]  = useState(false)
  const [resetting,   setResetting]   = useState(false)
  const [resetSent,   setResetSent]   = useState(false)
  const [error,       setError]       = useState('')

  const email    = authUser?.email || ''
  const username = profile?.username || ''

  // ── Sign out ───────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    setSigningOut(true)
    setError('')
    try {
      await signOut()
      onBack()
    } catch (err) {
      setError('Sign out failed. Please try again.')
      setSigningOut(false)
    }
  }

  // ── Change password (sends reset email) ───────────────────────────────────
  const handleChangePassword = async () => {
    if (!email || resetting || resetSent) return
    setResetting(true)
    setError('')
    try {
      await sendPasswordReset(email)
      setResetSent(true)
    } catch (err) {
      setError('Could not send reset email. Please try again.')
    } finally {
      setResetting(false)
    }
  }

  // ── Row helper ─────────────────────────────────────────────────────────────
  const Row = ({ label, value, borderBottom = true }) => (
    <div style={{
      display:       'flex',
      justifyContent:'space-between',
      alignItems:    'center',
      padding:       '11px 0',
      borderBottom:  borderBottom ? '1px solid rgba(107,124,71,0.12)' : 'none',
    }}>
      <span style={{
        color:         '#7a8a6a',
        fontSize:      '12px',
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        fontFamily:    'system-ui, sans-serif',
      }}>
        {label}
      </span>
      <span style={{
        color:      '#2c3820',
        fontSize:   '14px',
        fontFamily: 'Georgia, serif',
        maxWidth:   '60%',
        textAlign:  'right',
        wordBreak:  'break-all',
      }}>
        {value}
      </span>
    </div>
  )

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <button className="screen-back-btn auth-back" onClick={onBack}>← Back</button>

        <div className="auth-icon">✦</div>
        <h2 className="auth-title">Account</h2>

        {/* Account details */}
        <div style={{ width: '100%', marginBottom: '28px' }}>
          {username && (
            <Row label="Username" value={username} borderBottom={true} />
          )}
          <Row label="Email" value={email} borderBottom={false} />
        </div>

        {error && <div className="auth-error">{error}</div>}

        {/* Sign out — styled as a secondary / outline button */}
        <button
          className="auth-submit-btn"
          onClick={handleSignOut}
          disabled={signingOut}
          style={{
            background: 'transparent',
            color:      '#3a4a20',
            border:     '1.5px solid rgba(107,124,71,0.35)',
          }}
        >
          {signingOut ? (
            <><span className="auth-spinner" /> Signing out…</>
          ) : (
            'Sign out'
          )}
        </button>

        {/* Change password link */}
        <div className="auth-mode-links" style={{ marginTop: '20px' }}>
          {resetSent ? (
            <span style={{
              color:      '#6b7c5a',
              fontSize:   '14px',
              fontFamily: 'Georgia, serif',
            }}>
              Reset email sent — check your inbox
            </span>
          ) : (
            <button
              className="auth-mode-link"
              onClick={handleChangePassword}
              disabled={resetting}
              type="button"
            >
              {resetting ? 'Sending…' : 'Change password'}
            </button>
          )}
        </div>

      </div>
    </div>
  )
}
