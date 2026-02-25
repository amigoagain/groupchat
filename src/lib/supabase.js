import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true, // handles magic-link redirect hash automatically
        },
      })
    : null

export const isSupabaseConfigured = Boolean(supabase)

// ── Auth helpers ──────────────────────────────────────────────────────────────

/**
 * Send a magic link to the given email address.
 * On click the user is redirected back to window.location.origin.
 */
export async function sendMagicLink(email) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}

/**
 * Get the current auth session (null if guest / not authenticated).
 */
export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data?.session || null
}

/**
 * Get current Supabase auth user (null if guest).
 */
export async function getAuthUser() {
  if (!supabase) return null
  const { data } = await supabase.auth.getUser()
  return data?.user || null
}

/**
 * Sign out the current user.
 */
export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
}

/**
 * Subscribe to auth-state changes (SIGNED_IN, SIGNED_OUT, etc.).
 * Returns an unsubscribe function.
 */
export function onAuthStateChange(callback) {
  if (!supabase) return () => {}
  const { data: { subscription } } = supabase.auth.onAuthStateChange(callback)
  return () => subscription.unsubscribe()
}

// ── PWA session bridge ────────────────────────────────────────────────────────
// On iOS, an installed PWA and Safari have separate localStorage contexts.
// When a magic link is clicked it opens in Safari, which handles the auth
// and stores the session there — but the PWA never sees it.
// Fix: manually persist the session under a predictable key so that on next
// app launch we can attempt to restore it via supabase.auth.setSession().

const PWA_SESSION_KEY = 'gc_pwa_session'

/**
 * Persist access + refresh tokens to localStorage for PWA session recovery.
 * Call on SIGNED_IN / TOKEN_REFRESHED events.
 */
export function persistSessionForPwa(session) {
  if (!session?.access_token) {
    try { localStorage.removeItem(PWA_SESSION_KEY) } catch {}
    return
  }
  try {
    localStorage.setItem(PWA_SESSION_KEY, JSON.stringify({
      access_token:  session.access_token,
      refresh_token: session.refresh_token,
    }))
  } catch {}
}

/**
 * Attempt to restore a previously persisted session.
 * Called on startup before the normal getSession() check.
 * Returns the restored session or null.
 */
export async function restorePersistedSession() {
  if (!supabase) return null
  try {
    const raw = localStorage.getItem(PWA_SESSION_KEY)
    if (!raw) return null
    const { access_token, refresh_token } = JSON.parse(raw)
    if (!access_token || !refresh_token) return null
    const { data, error } = await supabase.auth.setSession({ access_token, refresh_token })
    if (error) {
      localStorage.removeItem(PWA_SESSION_KEY)
      return null
    }
    return data.session || null
  } catch {
    return null
  }
}
