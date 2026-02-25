import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  supabase,
  isSupabaseConfigured,
  sendMagicLink as _sendMagicLink,
  signOut as _signOut,
  onAuthStateChange,
  persistSessionForPwa,
  restorePersistedSession,
} from '../lib/supabase.js'

const AuthContext = createContext(null)

/**
 * Fetch or create the app-level user profile for a Supabase auth user.
 * Calls the upsert_user_profile function defined in the SQL schema.
 */
async function ensureUserProfile(authUser, desiredUsername) {
  if (!supabase || !authUser) return null
  try {
    const { data, error } = await supabase.rpc('upsert_user_profile', {
      p_auth_id:  authUser.id,
      p_email:    authUser.email || '',
      p_username: desiredUsername || authUser.email?.split('@')[0] || 'User',
    })
    if (error) throw error
    return data
  } catch (err) {
    console.warn('[Auth] ensureUserProfile failed:', err)
    return null
  }
}

/**
 * Fetch the user profile row by Supabase auth_id.
 */
async function fetchUserProfile(authId) {
  if (!supabase) return null
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authId)
      .single()
    if (error || !data) return null
    return data
  } catch { return null }
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [authUser, setAuthUser]     = useState(null)   // Supabase auth.user
  const [profile, setProfile]       = useState(null)   // users table row
  const [authLoading, setAuthLoading] = useState(true)

  // Resolve profile from auth user
  const resolveProfile = useCallback(async (user) => {
    if (!user) { setProfile(null); return }
    const p = await fetchUserProfile(user.id) ||
              await ensureUserProfile(user, user.email?.split('@')[0])
    setProfile(p)
  }, [])

  // Subscribe to auth state changes
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false)
      return
    }

    // Initialise: check existing session, falling back to persisted PWA token
    const init = async () => {
      let user = null

      // 1. Normal session check (works in browser / when magic link lands in same context)
      const { data } = await supabase.auth.getSession()
      user = data?.session?.user || null

      // 2. PWA fallback: if no session found, try restoring from the persisted token.
      //    This handles the case where the magic link was opened in Safari but the app
      //    is running as a standalone home-screen install with separate localStorage.
      if (!user) {
        const restoredSession = await restorePersistedSession()
        user = restoredSession?.user || null
      }

      setAuthUser(user)
      await resolveProfile(user)
      setAuthLoading(false)
    }
    init()

    // Listen for subsequent changes (magic link click, sign-out, token refresh, etc.)
    const unsub = onAuthStateChange((event, session) => {
      const user = session?.user || null
      setAuthUser(user)
      resolveProfile(user)

      // Persist session for PWA recovery on every sign-in and token refresh
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        persistSessionForPwa(session)
      } else if (event === 'SIGNED_OUT') {
        persistSessionForPwa(null)
      }
    })

    return unsub
  }, [resolveProfile])

  const sendMagicLink = useCallback(async (email) => {
    await _sendMagicLink(email)
  }, [])

  const signOut = useCallback(async () => {
    await _signOut()
    setAuthUser(null)
    setProfile(null)
  }, [])

  /**
   * Update the username for the current user.
   * Used after sign-in to let the user set/confirm their display name.
   */
  const updateUsername = useCallback(async (username) => {
    if (!authUser || !supabase) return
    const { data, error } = await supabase
      .from('users')
      .update({ username })
      .eq('auth_id', authUser.id)
      .select()
      .single()
    if (!error && data) setProfile(data)
  }, [authUser])

  const value = {
    authUser,                    // Supabase auth user (null = guest)
    profile,                     // users table row (null = guest)
    authLoading,
    isAuthenticated: Boolean(authUser),
    userId: profile?.id || null, // app-level user UUID
    username: profile?.username || null,
    sendMagicLink,
    signOut,
    updateUsername,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/**
 * Hook to access auth state from any component.
 * Throws if used outside <AuthProvider>.
 */
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
