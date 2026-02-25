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
