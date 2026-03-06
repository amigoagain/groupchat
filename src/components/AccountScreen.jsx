import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'

/**
 * AccountScreen — shown when a signed-in user taps the hamburger menu.
 *
 * Displays email, editable username, sign-out, and password-reset email.
 *
 * Props:
 *   onBack  — return to the entry screen
 */
export default function AccountScreen({ onBack }) {
  const { authUser, profile, signOut, sendPasswordReset, updateUsername } = useAuth()

  const email           = authUser?.email || ''
  const currentUsername = profile?.username || ''

  const [newUsername,   setNewUsername]   = useState(currentUsername)
  const [savingName,    setSavingName]    = useState(false)
  const [nameSaved,     setNameSaved]     = useState(false)
  const [nameError,     setNameError]     = useState('')

  const [signingOut,    setSigningOut]    = useState(false)
  const [resetting,     setResetting]     = useState(false)
  const [resetSent,     setResetSent]     = useState(false)
  const [error,         setError]         = useState('')

  // ── Save username ──────────────────────────────────────────────────────────
  const handleSaveUsername = async () => {
    const trimmed = newUsername.trim()
    if (!trimmed || trimmed === currentUsername || savingName) return
    setSavingName(true)
    setNameError('')
    setNameSaved(false)
    try {
      await updateUsername(trimmed)
      setNameSaved(true)
      setTimeout(() => setNameSaved(false), 2500)
    } catch {
      setNameError('Could not save. Please try again.')
    } finally {
      setSavingName(false)
    }
  }

  // ── Sign out ───────────────────────────────────────────────────────────────
  const handleSignOut = async () => {
    setSigningOut(true)
    setError('')
    try {
      await signOut()
      onBack()
    } catch {
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
    } catch {
      setError('Could not send reset email. Please try again.')
    } finally {
      setResetting(false)
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────
  const labelStyle = {
    display:       'block',
    color:         '#7a8a6a',
    fontSize:      '11px',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    fontFamily:    'system-ui, sans-serif',
    marginBottom:  '8px',
  }

  const inputStyle = {
    width:        '100%',
    boxSizing:    'border-box',
    background:   'rgba(245, 241, 234, 0.70)',
    border:       '1px solid rgba(107, 124, 71, 0.22)',
    borderRadius: '8px',
    padding:      '10px 12px',
    fontFamily:   'Georgia, serif',
    fontSize:     '15px',
    color:        '#2c3820',
    outline:      'none',
    marginBottom: '10px',
  }

  const primaryBtnStyle = {
    width:        '100%',
    padding:      '11px',
    background:   '#4a5a24',
    color:        '#f5f2ec',
    border:       'none',
    borderRadius: '8px',
    fontFamily:   'Georgia, serif',
    fontSize:     '14px',
    cursor:       'pointer',
    marginBottom: '6px',
  }

  const secondaryBtnStyle = {
    background:   'transparent',
    color:        '#3a4a20',
    border:       '1.5px solid rgba(107,124,71,0.35)',
    borderRadius: '8px',
    padding:      '11px',
    width:        '100%',
    fontFamily:   'Georgia, serif',
    fontSize:     '14px',
    cursor:       'pointer',
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <button className="screen-back-btn auth-back" onClick={onBack}>← Back</button>

        <div className="auth-icon">✦</div>
        <h2 className="auth-title">Account</h2>

        {/* Email (read-only) */}
        <div style={{ width: '100%', marginBottom: '28px' }}>
          <div style={{
            display:       'flex',
            justifyContent:'space-between',
            alignItems:    'center',
            padding:       '11px 0',
            borderBottom:  '1px solid rgba(107,124,71,0.12)',
          }}>
            <span style={{ color: '#7a8a6a', fontSize: '12px', letterSpacing: '0.07em', textTransform: 'uppercase', fontFamily: 'system-ui, sans-serif' }}>
              Email
            </span>
            <span style={{ color: '#2c3820', fontSize: '14px', fontFamily: 'Georgia, serif', maxWidth: '60%', textAlign: 'right', wordBreak: 'break-all' }}>
              {email}
            </span>
          </div>
        </div>

        {/* Username editing */}
        <div style={{ width: '100%', marginBottom: '28px' }}>
          <label style={labelStyle}>Username</label>
          <input
            type="text"
            value={newUsername}
            onChange={e => { setNewUsername(e.target.value); setNameSaved(false) }}
            onKeyDown={e => e.key === 'Enter' && handleSaveUsername()}
            placeholder="Your display name"
            style={inputStyle}
          />
          {nameError && (
            <div style={{ color: '#b04040', fontSize: '12px', fontFamily: 'Georgia, serif', marginBottom: '6px' }}>
              {nameError}
            </div>
          )}
          <button
            onClick={handleSaveUsername}
            disabled={savingName || !newUsername.trim() || newUsername.trim() === currentUsername}
            style={{
              ...primaryBtnStyle,
              opacity: (savingName || !newUsername.trim() || newUsername.trim() === currentUsername) ? 0.5 : 1,
              cursor:  (savingName || !newUsername.trim() || newUsername.trim() === currentUsername) ? 'default' : 'pointer',
            }}
          >
            {savingName ? 'Saving…' : nameSaved ? 'Saved ✓' : 'Save username'}
          </button>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {/* Sign out */}
        <button
          className="auth-submit-btn"
          onClick={handleSignOut}
          disabled={signingOut}
          style={{ background: 'transparent', color: '#3a4a20', border: '1.5px solid rgba(107,124,71,0.35)' }}
        >
          {signingOut ? <><span className="auth-spinner" /> Signing out…</> : 'Sign out'}
        </button>

        {/* Change password */}
        <div className="auth-mode-links" style={{ marginTop: '20px' }}>
          {resetSent ? (
            <span style={{ color: '#6b7c5a', fontSize: '14px', fontFamily: 'Georgia, serif' }}>
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
