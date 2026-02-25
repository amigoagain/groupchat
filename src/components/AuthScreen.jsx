import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'
import { isSupabaseConfigured } from '../lib/supabase.js'

/**
 * AuthScreen — magic link sign-in.
 *
 * States:
 *   idle      → email input form
 *   sending   → loading spinner
 *   sent      → "check your email" confirmation
 *   error     → error message + retry
 *
 * Props:
 *   onBack        — return to wherever the user came from
 *   promptReason  — optional string explaining WHY we're asking them to sign in
 *                   e.g. "Creating a public room requires an account."
 */
export default function AuthScreen({ onBack, promptReason }) {
  const { sendMagicLink } = useAuth()
  const [email,  setEmail]  = useState('')
  const [state,  setState]  = useState('idle') // idle | sending | sent | error
  const [errMsg, setErrMsg] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !trimmed.includes('@')) {
      setErrMsg('Please enter a valid email address.')
      setState('error')
      return
    }

    setState('sending')
    try {
      await sendMagicLink(trimmed)
      setState('sent')
    } catch (err) {
      setErrMsg(err.message || 'Could not send magic link. Please try again.')
      setState('error')
    }
  }

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

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <button className="screen-back-btn auth-back" onClick={onBack}>← Back</button>

        {state === 'sent' ? (
          <>
            <div className="auth-icon">✉️</div>
            <h2 className="auth-title">Check your email</h2>
            <p className="auth-subtitle">
              We sent a magic link to <strong>{email}</strong>.<br />
              Tap the link in the email to sign in — no password needed.
            </p>
            <p className="auth-hint">The link expires in 1 hour. Check your spam folder if you don't see it.</p>
            <button
              className="auth-resend-btn"
              onClick={() => { setState('idle'); setEmail('') }}
              type="button"
            >
              Use a different email
            </button>
          </>
        ) : (
          <>
            <div className="auth-icon">✦</div>
            <h2 className="auth-title">Sign in</h2>

            {promptReason && (
              <div className="auth-prompt-reason">{promptReason}</div>
            )}

            <p className="auth-subtitle">
              Enter your email and we'll send you a magic link.
              No password, no friction.
            </p>

            <form className="auth-form" onSubmit={handleSubmit}>
              <input
                className="auth-email-input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => { setEmail(e.target.value); if (state === 'error') setState('idle') }}
                autoComplete="email"
                autoFocus
                disabled={state === 'sending'}
              />

              {state === 'error' && (
                <div className="auth-error">{errMsg}</div>
              )}

              <button
                className="auth-submit-btn"
                type="submit"
                disabled={state === 'sending' || !email.trim()}
              >
                {state === 'sending' ? (
                  <><span className="auth-spinner" /> Sending…</>
                ) : (
                  'Send magic link →'
                )}
              </button>
            </form>

            <div className="auth-guest-note">
              <button className="auth-guest-link" onClick={onBack} type="button">
                Continue as guest instead
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
