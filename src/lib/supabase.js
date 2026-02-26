import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null

export const isSupabaseConfigured = Boolean(supabase)

// ── Auth helpers ──────────────────────────────────────────────────────────────

/**
 * Sign in with email and password.
 */
export async function signInWithPassword(email, password) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signInWithPassword({
    email:    email.trim().toLowerCase(),
    password,
  })
  if (error) throw error
  return data
}

/**
 * Sign up with email and password.
 * Supabase will send a confirmation email unless email confirmations are disabled.
 */
export async function signUpWithPassword(email, password) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.auth.signUp({
    email:    email.trim().toLowerCase(),
    password,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
  return data
}

/**
 * Send a password reset email.
 */
export async function sendPasswordResetEmail(email) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo: `${window.location.origin}/reset-password` },
  )
  if (error) throw error
}

/**
 * Send a magic link to the given email address (kept for legacy fallback).
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
// With email/password auth, sessions persist natively in localStorage and do
// not require the PWA bridge. The bridge is kept for backwards compatibility
// with any existing sessions.

const PWA_SESSION_KEY = 'gc_pwa_session'

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
