import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchMyRooms } from '../utils/roomUtils.js'
import {
  generateRoomName,
  relativeTime,
  getVisitedRoomCodes,
  removeFromVisited,
} from '../utils/inboxUtils.js'
import { useAuth } from '../contexts/AuthContext.jsx'

const MODE_COLORS = {
  chat:    '#4f7cff',
  discuss: '#a855f7',
  plan:    '#f59e0b',
  advise:  '#22c55e',
  stroll:  '#6b7c47',
}

function getPreview(room) {
  if (room.lastMessagePreview) return room.lastMessagePreview
  return 'No messages yet'
}

// ── Avatar cluster ─────────────────────────────────────────────────────────────

function AvatarCluster({ characters }) {
  const list    = (characters || []).slice(0, 3)
  const size    = 28
  const overlap = 10
  const totalWidth = list.length > 0 ? size + (list.length - 1) * (size - overlap) : size

  return (
    <div className="inbox-avatars" style={{ width: totalWidth, flexShrink: 0 }}>
      {list.map((char, i) => (
        <div
          key={char.id || i}
          className="inbox-avatar"
          style={{ background: char.color, left: i * (size - overlap), zIndex: 3 - i }}
        >
          {char.initial}
        </div>
      ))}
      {list.length === 0 && (
        <div className="inbox-avatar" style={{ background: '#4f7cff', left: 0 }}>?</div>
      )}
    </div>
  )
}

// ── Room card ──────────────────────────────────────────────────────────────────

function RoomCard({ room, onOpen, onRemove, showRemove }) {
  const touchStartX = useRef(null)
  const [swiped, setSwiped] = useState(false)

  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX }
  const handleTouchEnd   = (e) => {
    if (touchStartX.current === null) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (delta < -60) setSwiped(true)
    if (delta >  40) setSwiped(false)
  }

  const handleRemove = (e) => {
    e.stopPropagation()
    setSwiped(false)
    onRemove(room.code)
  }

  const isStroll  = room.mode?.id === 'stroll' || room.roomMode === 'stroll'
  const isDormant = Boolean(room.dormant_at || room.dormantAt)
  const roomName  = isStroll ? 'Stroll' : generateRoomName(room.characters || [])
  const preview   = isStroll ? (isDormant ? 'dormant · branchable' : 'stroll in progress') : getPreview(room)
  const modeName  = room.mode?.name || 'Chat'
  const modeId    = room.mode?.id   || 'chat'
  const modeColor = MODE_COLORS[modeId] || '#4f7cff'
  const timestamp = relativeTime(room.lastActivity || room.createdAt)

  return (
    <div
      className={`inbox-card-wrapper${swiped ? ' swiped' : ''}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={isDormant && isStroll ? { opacity: 0.7 } : {}}
    >
      <button
        className="inbox-card"
        onClick={() => onOpen(room.code)}
        style={isDormant && isStroll ? { borderLeft: '3px solid #6b7c47' } : {}}
      >
        <AvatarCluster characters={room.characters} />

        <div className="inbox-card-content">
          <div className="inbox-card-top">
            <span className="inbox-card-name">
              {roomName}
              {isStroll && isDormant && (
                <span style={{ fontSize: '10px', color: '#6b7c47', marginLeft: '6px', fontFamily: 'monospace' }}>dormant</span>
              )}
            </span>
            <span className="inbox-card-time">{timestamp}</span>
          </div>
          <div className="inbox-card-preview">{preview}</div>
          <div className="inbox-card-meta">
            <span
              className="inbox-mode-badge"
              style={{
                background:  `${modeColor}22`,
                color:       modeColor,
                borderColor: `${modeColor}44`,
              }}
            >
              {isStroll ? '🌿 Stroll' : modeName}
            </span>

            {/* Visibility badge */}
            {room.visibility && room.visibility !== 'private' && (
              <span className={`inbox-visibility-badge inbox-vis-${room.visibility}`}>
                {room.visibility === 'read-only'        && '🔒 read-only'}
                {room.visibility === 'unlisted'         && '🔓 unlisted'}
                {room.visibility === 'open'             && '🌐 open'}
                {room.visibility === 'moderated-public' && '🛡 moderated'}
              </span>
            )}

            {/* Branch indicator */}
            {room.parentRoomId && (
              <span className="inbox-branch-badge">⎇ branch</span>
            )}

            <span className="inbox-card-code">{room.code}</span>
            {room.participantCount > 0 && (
              <span className="inbox-participants">👤 {room.participantCount}</span>
            )}
          </div>
        </div>

      </button>

      {showRemove && (
        <button className="inbox-swipe-remove" onClick={handleRemove}>Remove</button>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function InboxScreen({
  initialTab,
  onStartRoom,
  onOpenRoom,
  onJoinRoom,
  onSignIn,
  onCreateCharacter,
  onOpenLibrary,
  joinError,
  onClearJoinError,
}) {
  const { isAuthenticated, userId, username, authLoading } = useAuth()

  const [myRooms,   setMyRooms]   = useState([])
  const [loading,   setLoading]   = useState(true)
  const [joinCode,  setJoinCode]  = useState('')
  const [showMenu,  setShowMenu]  = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const menuRef = useRef(null)

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setShowMenu(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [showMenu])

  const loadRooms = useCallback(async () => {
    setLoading(true)
    try {
      const visitedCodes = isAuthenticated ? [] : getVisitedRoomCodes()
      const my = await fetchMyRooms(visitedCodes, isAuthenticated ? userId : null)
      setMyRooms(my)
    } catch (err) {
      console.warn('[Kepos] Inbox load error:', err)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, userId])

  useEffect(() => {
    if (!authLoading) loadRooms()
  }, [authLoading, loadRooms])

  const handleRemove = (code) => {
    removeFromVisited(code)
    setMyRooms(prev => prev.filter(r => r.code !== code))
  }

  const handleJoin = (e) => {
    e.preventDefault()
    const code = joinCode.trim()
    if (code.length >= 4) onJoinRoom(code)
  }

  const rooms = myRooms

  return (
    <div className="inbox-screen">
      {/* ── Header ── */}
      <div className="inbox-header">
        <div className="inbox-header-left">
          <div className="inbox-logo-dot" />
          <h1 className="inbox-title">Kepos</h1>
        </div>
        <div className="inbox-header-right" ref={menuRef}>
          {/* Library icon */}
          <button
            className="inbox-library-btn"
            onClick={() => onOpenLibrary && onOpenLibrary()}
            aria-label="Library"
            title="Library"
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </button>
          <button
            className="inbox-hamburger-btn"
            onClick={() => setShowMenu(v => !v)}
            aria-label="Menu"
            type="button"
          >
            ☰
          </button>

          {showMenu && (
            <div className="inbox-menu-dropdown">
              {/* Account */}
              <div className="inbox-menu-item" onClick={() => { setShowMenu(false); onSignIn && onSignIn() }}>
                <span className="inbox-menu-icon">👤</span>
                <span className="inbox-menu-label">
                  {isAuthenticated ? (username || 'Account') : 'Sign in'}
                </span>
                {isAuthenticated && (
                  <span className="inbox-menu-sub">Re-send sign-in link</span>
                )}
              </div>

              <div className="inbox-menu-divider" />

              {/* My Inquiry Map — disabled */}
              <div className="inbox-menu-item inbox-menu-disabled">
                <span className="inbox-menu-icon">🗺</span>
                <span className="inbox-menu-label">My Inquiry Map</span>
                <span className="inbox-menu-soon">soon</span>
              </div>

              {/* Create Character */}
              <div className="inbox-menu-item" onClick={() => { setShowMenu(false); onCreateCharacter && onCreateCharacter() }}>
                <span className="inbox-menu-icon">✦</span>
                <span className="inbox-menu-label">Create Character</span>
              </div>

              {/* Library */}
              <div className="inbox-menu-item" onClick={() => { setShowMenu(false); onOpenLibrary && onOpenLibrary() }}>
                <span className="inbox-menu-icon">📖</span>
                <span className="inbox-menu-label">Library</span>
              </div>

              <div className="inbox-menu-divider" />

              {/* Settings — disabled */}
              <div className="inbox-menu-item inbox-menu-disabled">
                <span className="inbox-menu-icon">⚙︎</span>
                <span className="inbox-menu-label">Settings</span>
                <span className="inbox-menu-soon">soon</span>
              </div>

              {/* About */}
              <div className="inbox-menu-item" onClick={() => { setShowMenu(false); setShowAbout(true) }}>
                <span className="inbox-menu-icon">ℹ</span>
                <span className="inbox-menu-label">About Kepos</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── About panel ── */}
      {showAbout && (
        <div className="inbox-about-overlay" onClick={() => setShowAbout(false)}>
          <div className="inbox-about-card" onClick={e => e.stopPropagation()}>
            <button className="inbox-about-close" onClick={() => setShowAbout(false)} type="button">✕</button>
            <div className="inbox-about-title">Kepos</div>
            <div className="inbox-about-body">
              A space for multi-character conversations. Bring together historical figures, philosophers, scientists, and experts — and let them talk to each other and to you.
            </div>
            <div className="inbox-about-version">v0.6 — early access</div>
          </div>
        </div>
      )}

      {/* ── Tab header ── */}
      <div className="inbox-tabs">
        <div className="inbox-tab active">
          My Chats
          {myRooms.length > 0 && <span className="inbox-tab-count">{myRooms.length}</span>}
        </div>
      </div>

      {/* ── Room list ── */}
      <div className="inbox-list">
        {loading || authLoading ? (
          <div className="inbox-loading">
            <div className="loading-spinner" style={{ width: 28, height: 28 }} />
            <span>Loading rooms…</span>
          </div>
        ) : rooms.length === 0 ? (
          <div className="inbox-empty">
            <div className="inbox-empty-icon">💬</div>
            <div className="inbox-empty-title">No chats yet</div>
            <div className="inbox-empty-sub">
              Tap <strong>+</strong> to start your first room, or enter a room code below
            </div>
            {!isAuthenticated && (
              <button className="inbox-auth-nudge" onClick={onSignIn} type="button">
                Sign in to keep your rooms across devices →
              </button>
            )}
          </div>
        ) : (
          rooms.map(room => (
            <RoomCard
              key={room.code}
              room={room}
              onOpen={onOpenRoom}
              onRemove={handleRemove}
              showRemove={true}
            />
          ))
        )}
      </div>

      {/* ── Join by code ── */}
      <div className="inbox-join-section">
        <form onSubmit={handleJoin} className="inbox-join-form">
          <input
            className="inbox-join-input"
            type="text"
            placeholder="Enter room code to join"
            maxLength={6}
            value={joinCode}
            onChange={e => {
              setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
              onClearJoinError()
            }}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            className="inbox-join-btn"
            type="submit"
            disabled={joinCode.trim().length < 4}
          >
            Join
          </button>
        </form>
        {joinError && <div className="join-error">{joinError}</div>}
      </div>
    </div>
  )
}
