/**
 * DevModeContext.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Research instrument for controlled testing of the Gardener architecture.
 * Provides toggle states for all seven agent layers.
 *
 * Access control: visible ONLY to authenticated users whose Supabase auth UID
 * matches VITE_DEV_USER_ID. Non-dev users get default (all ON) values and the
 * panel never renders.
 *
 * This context is NOT a product feature. Remove before public launch:
 * delete this file, DevPanel.jsx, and the VITE_DEV_USER_ID env var.
 *
 * Research protocol:
 *   - Document toggle states before each conversation
 *   - Run full conversations of at least 8 turns
 *   - Verify against console logs before drawing conclusions
 *   - Toggle states persist across page refresh; reset to all-ON on new session
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext.jsx'

const DEV_USER_ID = import.meta.env.VITE_DEV_USER_ID || ''

// localStorage keys
const LS_ROUTER   = 'kepos_dev_router'
const LS_MEMORY   = 'kepos_dev_memory'
const LS_GARDENER = 'kepos_dev_gardener'
const LS_GOOSE    = 'kepos_dev_goose'
const LS_WEATHER  = 'kepos_dev_weather'
const LS_BUGS     = 'kepos_dev_bugs'
const LS_HUX      = 'kepos_dev_hux'

const DevModeContext = createContext(null)

function readBool(key, defaultVal = true) {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return defaultVal
    return raw !== 'false'
  } catch { return defaultVal }
}

function writeBool(key, val) {
  try { localStorage.setItem(key, String(val)) } catch {}
}

export function DevModeProvider({ children }) {
  const { authUser } = useAuth()

  // Only the dev user gets real toggle control. Everyone else sees all-ON.
  const isDevUser = Boolean(DEV_USER_ID && authUser?.id === DEV_USER_ID)

  const [routerEnabled,   setRouterEnabled]   = useState(() => isDevUser ? readBool(LS_ROUTER)   : true)
  const [memoryEnabled,   setMemoryEnabled]   = useState(() => isDevUser ? readBool(LS_MEMORY)   : true)
  const [gardenerEnabled, setGardenerEnabled] = useState(() => isDevUser ? readBool(LS_GARDENER) : true)
  const [gooseEnabled,    setGooseEnabled]    = useState(() => isDevUser ? readBool(LS_GOOSE)    : true)
  const [weatherEnabled,  setWeatherEnabled]  = useState(() => isDevUser ? readBool(LS_WEATHER)  : true)
  const [bugsEnabled,     setBugsEnabled]     = useState(() => isDevUser ? readBool(LS_BUGS)     : true)
  const [huxEnabled,      setHuxEnabled]      = useState(() => isDevUser ? readBool(LS_HUX)      : true)

  // Re-read localStorage if the user logs in mid-session as dev
  useEffect(() => {
    if (isDevUser) {
      setRouterEnabled(readBool(LS_ROUTER))
      setMemoryEnabled(readBool(LS_MEMORY))
      setGardenerEnabled(readBool(LS_GARDENER))
      setGooseEnabled(readBool(LS_GOOSE))
      setWeatherEnabled(readBool(LS_WEATHER))
      setBugsEnabled(readBool(LS_BUGS))
      setHuxEnabled(readBool(LS_HUX))
    } else {
      setRouterEnabled(true)
      setMemoryEnabled(true)
      setGardenerEnabled(true)
      setGooseEnabled(true)
      setWeatherEnabled(true)
      setBugsEnabled(true)
      setHuxEnabled(true)
    }
  }, [isDevUser])

  const toggleRouter   = useCallback(() => { if (!isDevUser) return; setRouterEnabled(p   => { const n = !p; writeBool(LS_ROUTER,   n); return n }) }, [isDevUser])
  const toggleMemory   = useCallback(() => { if (!isDevUser) return; setMemoryEnabled(p   => { const n = !p; writeBool(LS_MEMORY,   n); return n }) }, [isDevUser])
  const toggleGardener = useCallback(() => { if (!isDevUser) return; setGardenerEnabled(p => { const n = !p; writeBool(LS_GARDENER, n); return n }) }, [isDevUser])
  const toggleGoose    = useCallback(() => { if (!isDevUser) return; setGooseEnabled(p    => { const n = !p; writeBool(LS_GOOSE,    n); return n }) }, [isDevUser])
  const toggleWeather  = useCallback(() => { if (!isDevUser) return; setWeatherEnabled(p  => { const n = !p; writeBool(LS_WEATHER,  n); return n }) }, [isDevUser])
  const toggleBugs     = useCallback(() => { if (!isDevUser) return; setBugsEnabled(p     => { const n = !p; writeBool(LS_BUGS,     n); return n }) }, [isDevUser])
  const toggleHux      = useCallback(() => { if (!isDevUser) return; setHuxEnabled(p      => { const n = !p; writeBool(LS_HUX,      n); return n }) }, [isDevUser])

  const value = {
    isDevUser,
    routerEnabled,
    memoryEnabled,
    gardenerEnabled,
    gooseEnabled,
    weatherEnabled,
    bugsEnabled,
    huxEnabled,
    toggleRouter,
    toggleMemory,
    toggleGardener,
    toggleGoose,
    toggleWeather,
    toggleBugs,
    toggleHux,
  }

  return (
    <DevModeContext.Provider value={value}>
      {children}
    </DevModeContext.Provider>
  )
}

export function useDevMode() {
  const ctx = useContext(DevModeContext)
  if (!ctx) throw new Error('useDevMode must be used inside <DevModeProvider>')
  return ctx
}
