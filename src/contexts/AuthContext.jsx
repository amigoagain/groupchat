import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  supabase,
  isSupabaseConfigured,
  signInWithPassword as _signInWithPassword,
  signUpWithPassword as _signUpWithPassword,
  sendPasswordResetEmail as _sendPasswordReset,
  sendMagicLink as _sendMagicLink,
  signOut as _signOut,
  onAuthStateChange,
  persistSessionForPwa,
  restorePersistedSession,
} from '../lib/supabase.js'

const AuthContext = createContext(null)

/**
 * Fetch or create the app-level user profile for a Supabase auth user.
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
  const [authUser,      setAuthUser]      = useState(null)
  const [profile,       setProfile]       = useState(null)
  const [authLoading,   setAuthLoading]   = useState(true)
  const [sessionExpired, setSessionExpired] = useState(false)

  const resolveProfile = useCallback(async (user) => {
    if (!user) { setProfile(null); return }
    const p = await fetchUserProfile(user.id) ||
              await ensureUserProfile(user, user.email?.split('@')[0])
    setProfile(p)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setAuthLoading(false)
      return
    }

    const init = async () => {
      let user = null

      const { data } = await supabase.auth.getSession()
      user = data?.session?.user || null

      // PWA fallback (for any persisted sessions from before email/password migration)
      if (!user) {
        const restoredSession = await restorePersistedSession()
        user = restoredSession?.user || null
      }

      setAuthUser(user)
      await resolveProfile(user)
      setAuthLoading(false)
    }
    init()

    const unsub = onAuthStateChange((event, session) => {
      const user = session?.user || null
      setAuthUser(user)
      resolveProfile(user)

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        persistSessionForPwa(session)
        setSessionExpired(false)
      } else if (event === 'SIGNED_OUT') {
        persistSessionForPwa(null)
      } else if (event === 'TOKEN_EXPIRED') {
        setSessionExpired(true)
      }
    })

    return unsub
  }, [resolveProfile])

  // ── Auth actions ───────────────────────────────────────────────────────────

  const signInWithPassword = useCallback(async (email, password) => {
    await _signInWithPassword(email, password)
  }, [])

  const signUp = useCallback(async (email, password) => {
    await _signUpWithPassword(email, password)
  }, [])

  const sendPasswordReset = useCallback(async (email) => {
    await _sendPasswordReset(email)
  }, [])

  /** Legacy magic link — kept so any existing callsites don't crash */
  const sendMagicLink = useCallback(async (email) => {
    await _sendMagicLink(email)
  }, [])

  const signOut = useCallback(async () => {
    await _signOut()
    setAuthUser(null)
    setProfile(null)
  }, [])

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
    authUser,
    profile,
    authLoading,
    sessionExpired,
    isAuthenticated: Boolean(authUser),
    userId:   profile?.id || null,
    username: profile?.username || null,
    signInWithPassword,
    signUp,
    sendPasswordReset,
    sendMagicLink,   // legacy
    signOut,
    updateUsername,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
