import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { isSupabaseConfigured } from '../lib/supabase.js'

/**
 * AuthScreen — email/password sign-in and sign-up.
 *
 * Modes:
 *   signin    → email + password form
 *   signup    → email + password + confirm form
 *   forgot    → email-only (sends reset email)
 *   reset-sent → confirmation after reset email
 *
 * Props:
 *   onBack        — return to wherever the user came from
 *   promptReason  — optional string explaining WHY we're asking them to sign in
 */
export default function AuthScreen({ onBack, promptReason }) {
  const { signInWithPassword, signUp, sendPasswordReset, sessionExpired } = useAuth()

  const [mode,     setMode]     = useState('signin')  // signin | signup | forgot | reset-sent
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [magicLinkMsg, setMagicLinkMsg] = useState('')

  const clearError = () => { setError(''); setMagicLinkMsg('') }

  if (!isSupabaseConfigured) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <button className="screen-back-btn auth-back" onClick={onBack}>← Back</button>
          <div className="auth-icon">🔒</div>
          <h2 className="auth-title">Authentication unavailable</h2>
          <p className="auth-subtitle">
            Supabase is not configured. Accounts require Supabase to be set up.
          </p>
          <button className="auth-cta-btn" onClick={onBack}>Continue as guest</button>
        </div>
      </div>
    )
  }

  // ── Sign in ────────────────────────────────────────────────────────────────
  const handleSignIn = async (e) => {
    e.preventDefault()
    clearError()
    const trimEmail = email.trim().toLowerCase()
    if (!trimEmail || !trimEmail.includes('@')) { setError('Enter a valid email address.'); return }
    if (!password) { setError('Enter your password.'); return }

    setLoading(true)
    try {
      await signInWithPassword(trimEmail, password)
      // onBack will be handled by auth state change via AuthProvider
      onBack()
    } catch (err) {
      const msg = err.message || ''
      if (msg.toLowerCase().includes('invalid login credentials') || msg.toLowerCase().includes('invalid credentials')) {
        setError('Incorrect email or password.')
        setMagicLinkMsg('If this account was created with a magic link, use "Forgot password?" to set a password and continue.')
      } else if (msg.toLowerCase().includes('email not confirmed')) {
        setError('Please confirm your email address first. Check your inbox.')
      } else {
        setError(msg || 'Sign in failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Sign up ────────────────────────────────────────────────────────────────
  const handleSignUp = async (e) => {
    e.preventDefault()
    clearError()
    const trimEmail = email.trim().toLowerCase()
    if (!trimEmail || !trimEmail.includes('@')) { setError('Enter a valid email address.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    try {
      await signUp(trimEmail, password)
      onBack()
    } catch (err) {
      const msg = err.message || ''
      if (msg.toLowerCase().includes('already registered') || msg.toLowerCase().includes('user already exists')) {
        setError('An account with this email already exists. Try signing in.')
      } else {
        setError(msg || 'Sign up failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Forgot password ────────────────────────────────────────────────────────
  const handleForgot = async (e) => {
    e.preventDefault()
    clearError()
    const trimEmail = email.trim().toLowerCase()
    if (!trimEmail || !trimEmail.includes('@')) { setError('Enter a valid email address.'); return }

    setLoading(true)
    try {
      await sendPasswordReset(trimEmail)
      setMode('reset-sent')
    } catch (err) {
      setError(err.message || 'Could not send reset email. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Reset sent ─────────────────────────────────────────────────────────────
  if (mode === 'reset-sent') {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <button className="screen-back-btn auth-back" onClick={onBack}>← Back</button>
          <div className="auth-icon">✉️</div>
          <h2 className="auth-title">Check your email</h2>
          <p className="auth-subtitle">
            We sent a password reset link to <strong>{email}</strong>.
            Follow the link to set a new password.
          </p>
          <p className="auth-hint">Check your spam folder if you don't see it.</p>
          <button
            className="auth-resend-btn"
            onClick={() => { setMode('signin'); clearError() }}
            type="button"
          >
            Back to sign in
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <button className="screen-back-btn auth-back" onClick={onBack}>← Back</button>

        <div className="auth-icon">✦</div>
        <h2 className="auth-title">
          {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Reset password'}
        </h2>

        {promptReason && mode === 'signin' && (
          <div className="auth-prompt-reason">{promptReason}</div>
        )}

        {sessionExpired && mode === 'signin' && (
          <div className="auth-session-expired">Your session expired — please sign in again.</div>
        )}

        <p className="auth-subtitle">
          {mode === 'signin'
            ? 'Sign in to save rooms and branch conversations.'
            : mode === 'signup'
              ? 'Create a free account to save your rooms.'
              : 'Enter your email and we\'ll send a reset link.'}
        </p>

        <form
          className="auth-form"
          onSubmit={mode === 'signin' ? handleSignIn : mode === 'signup' ? handleSignUp : handleForgot}
        >
          {/* Email */}
          <input
            className="auth-email-input"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={e => { setEmail(e.target.value); clearError() }}
            autoComplete="email"
            autoFocus
            disabled={loading}
          />

          {/* Password */}
          {mode !== 'forgot' && (
            <div className="auth-pw-wrap">
              <input
                className="auth-email-input auth-pw-input"
                type={showPw ? 'text' : 'password'}
                placeholder="Password (min 8 characters)"
                value={password}
                onChange={e => { setPassword(e.target.value); clearError() }}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
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
          )}

          {/* Confirm password (sign-up only) */}
          {mode === 'signup' && (
            <input
              className="auth-email-input"
              type={showPw ? 'text' : 'password'}
              placeholder="Confirm password"
              value={confirm}
              onChange={e => { setConfirm(e.target.value); clearError() }}
              autoComplete="new-password"
              disabled={loading}
            />
          )}

          {error && <div className="auth-error">{error}</div>}
          {magicLinkMsg && <div className="auth-magic-hint">{magicLinkMsg}</div>}

          <button
            className="auth-submit-btn"
            type="submit"
            disabled={loading || !email.trim()}
          >
            {loading ? (
              <><span className="auth-spinner" /> {mode === 'signin' ? 'Signing in…' : mode === 'signup' ? 'Creating account…' : 'Sending…'}</>
            ) : (
              mode === 'signin' ? 'Sign in →' : mode === 'signup' ? 'Create account →' : 'Send reset link →'
            )}
          </button>
        </form>

        {/* Mode toggles */}
        <div className="auth-mode-links">
          {mode === 'signin' && (
            <>
              <button className="auth-mode-link" type="button" onClick={() => { setMode('forgot'); clearError() }}>
                Forgot password?
              </button>
              <span className="auth-mode-sep">·</span>
              <button className="auth-mode-link" type="button" onClick={() => { setMode('signup'); clearError() }}>
                Create account
              </button>
              <div className="auth-reset-hint">Reset links open a set-password page automatically</div>
            </>
          )}
          {mode === 'signup' && (
            <button className="auth-mode-link" type="button" onClick={() => { setMode('signin'); clearError() }}>
              Already have an account? Sign in
            </button>
          )}
          {mode === 'forgot' && (
            <button className="auth-mode-link" type="button" onClick={() => { setMode('signin'); clearError() }}>
              Back to sign in
            </button>
          )}
        </div>

        <div className="auth-guest-note">
          <button className="auth-guest-link" onClick={onBack} type="button">
            Continue as guest instead
          </button>
        </div>
      </div>
    </div>
  )
}
