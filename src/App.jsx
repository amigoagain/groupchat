import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import SetupScreen from './components/SetupScreen.jsx'
import InboxScreen from './components/InboxScreen.jsx'
import ModeSelection from './components/ModeSelection.jsx'
import CharacterSelection from './components/CharacterSelection.jsx'
import ChatInterface from './components/ChatInterface.jsx'
import AuthScreen from './components/AuthScreen.jsx'
import PasswordResetScreen from './components/PasswordResetScreen.jsx'
import BranchConfig from './components/BranchConfig.jsx'
import WeaverEntryScreen from './components/WeaverEntryScreen.jsx'
// GraphScreen (force-graph) is preserved for V2 but loaded lazily to keep it off
// the critical-path bundle (react-force-graph pulls in aframe which requires a
// global AFRAME object that isn't present in our Vite ESM build).
const GraphScreen = React.lazy(() => import('./components/GraphScreen.jsx'))
import UsernameModal from './components/UsernameModal.jsx'
import { hasApiKey } from './services/claudeApi.js'
import { loadRoom, createRoom, diagnoseSupabase, incrementParticipantCount } from './utils/roomUtils.js'
import { insertMessages } from './utils/messageUtils.js'
import { hasUsername, setUsername, getUsername } from './utils/username.js'
import { markRoomVisited, markAllSeen } from './utils/inboxUtils.js'
import { useAuth } from './contexts/AuthContext.jsx'

export default function App() {
  const { code: urlCode } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated, username: authUsername, userId, authLoading, isRecovery } = useAuth()

  const [screen, setScreen] = useState('loading')
  const [selectedMode, setSelectedMode] = useState(null)
  const [selectedCharacters, setSelectedCharacters] = useState([])
  const [currentRoom, setCurrentRoom] = useState(null)
  const [joinError, setJoinError] = useState('')
  const [pendingCode, setPendingCode] = useState(urlCode || null)

  // Auth screen
  const [authPromptReason, setAuthPromptReason] = useState('')

  // Branch config screen
  const [branchConfigData, setBranchConfigData] = useState(null)

  // Username gate: true means we need to collect the name first
  const [needsUsername, setNeedsUsername] = useState(!hasUsername())

  // ── Derived display name ──────────────────────────────────────────────────
  const displayName = isAuthenticated
    ? (authUsername || getUsername() || 'User')
    : (getUsername() || 'Guest')

  // ── Helpers ───────────────────────────────────────────────────────────────
  const loadAndEnterRoom = async (code) => {
    setScreen('loading')
    try {
      const room = await loadRoom(code.trim().toUpperCase())
      if (room) {
        setCurrentRoom(room)
        setJoinError('')
        markRoomVisited(code)
        markAllSeen(code, 0) // messages now in separate table
        incrementParticipantCount(code) // fire-and-forget
        navigate(`/room/${code.trim().toUpperCase()}`, { replace: true })
        setScreen('chat')
      } else {
        setJoinError(`Room "${code.toUpperCase()}" not found. Check the code and try again.`)
        navigate('/', { replace: true })
        setScreen('weaver')
      }
    } catch {
      setJoinError(`Could not load room "${code.toUpperCase()}". Please try again.`)
      navigate('/', { replace: true })
      setScreen('weaver')
    }
  }

  // ── Password recovery detection ───────────────────────────────────────────
  // Fires when Supabase triggers PASSWORD_RECOVERY via onAuthStateChange
  useEffect(() => {
    if (isRecovery) setScreen('password-reset')
  }, [isRecovery])

  // Belt-and-suspenders: also detect type=recovery in URL hash on first load
  useEffect(() => {
    if (window.location.hash.includes('type=recovery')) {
      setScreen('password-reset')
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Initial load — waits for username + auth ──────────────────────────────
  useEffect(() => {
    if (needsUsername) {
      setScreen('loading')
      return
    }
    if (authLoading) return // wait for auth session to resolve

    // Don't override password-reset screen triggered by URL hash
    if (screen === 'password-reset') return

    const init = async () => {
      diagnoseSupabase()

      if (!hasApiKey()) {
        if (urlCode) setPendingCode(urlCode)
        setScreen('setup')
        return
      }

      if (urlCode || pendingCode) {
        const code = urlCode || pendingCode
        setPendingCode(null)
        await loadAndEnterRoom(code)
      } else {
        setScreen('weaver')
      }
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsUsername, authLoading])

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleUsernameSave = (name) => {
    setUsername(name)
    setNeedsUsername(false)
  }

  const handleApiKeySet = async () => {
    if (pendingCode) {
      const code = pendingCode
      setPendingCode(null)
      await loadAndEnterRoom(code)
    } else {
      setScreen('weaver')
    }
  }

  const handleStartRoom = () => setScreen('mode')

  const handleJoinRoom = async (code) => {
    await loadAndEnterRoom(code)
  }

  const handleOpenRoom = async (code) => {
    await loadAndEnterRoom(code)
  }

  const handleSelectMode = (mode) => {
    setSelectedMode(mode)
    setScreen('characters')
  }

  /**
   * Called by CharacterSelection when the user taps Start.
   * Creates a normal (non-branch) room.
   *
   * @param {array}  characters
   * @param {'private'|'unlisted'|'read-only'} visibility
   */
  const handleStartChat = async (characters, visibility = 'private') => {
    setSelectedCharacters(characters)
    const room = await createRoom(
      selectedMode,
      characters,
      displayName,
      isAuthenticated ? userId : null,
      visibility,
      null, // no branchData for new rooms
    )
    setCurrentRoom(room)
    markRoomVisited(room.code)
    navigate(`/room/${room.code}`, { replace: true })
    setScreen('chat')
  }

  /**
   * Show the auth screen (magic link sign-in).
   * @param {string} reason — optional prompt reason shown to user
   */
  const handleSignIn = (reason = '') => {
    setAuthPromptReason(reason)
    setScreen('auth')
  }

  /**
   * Called by ChatInterface / InboxScreen when user wants to branch.
   * Auth-gates: if not authenticated, show auth screen first.
   *
   * @param {{ parentRoomId, branchedAtSequence, branchDepth, foundingMessages }} data
   */
  const handleOpenBranchConfig = (data) => {
    if (!isAuthenticated) {
      handleSignIn('Branching a conversation requires a free account.')
      return
    }
    // Include parent room characters for pre-population in BranchConfig
    setBranchConfigData({ ...data, parentCharacters: currentRoom?.characters || [] })
    setScreen('branch-config')
  }

  /**
   * Called by BranchConfig when the user confirms the branch.
   * Creates a new branch room, inserts the founding messages as visible
   * context (with isContext flag so they don't trigger AI responses),
   * then navigates into the new room.
   *
   * @param {{ selectedChars, roomName, visibility, branchData }} config
   */
  const handleBranchConfirm = async ({ selectedChars, roomName, visibility, branchData }) => {
    const room = await createRoom(
      selectedMode || { id: 'discuss', name: 'Discuss', icon: '🗣', modeContext: '' },
      selectedChars,
      displayName,
      isAuthenticated ? userId : null,
      visibility,
      branchData,
    )

    // Insert the founding messages as visible context at the top of the new room.
    // metadata.isContext = true prevents them from being included in AI conversation history.
    if (branchData?.foundingContext?.length > 0 && room.id) {
      const parentCode = currentRoom?.code || null
      const ctxMsgs = branchData.foundingContext.map(m => ({
        type:             m.sender_type === 'character' ? 'character' : 'user',
        content:          m.content,
        characterName:    m.characterName || m.sender_name || null,
        characterColor:   m.characterColor || m.sender_color || null,
        characterInitial: m.characterInitial || m.sender_initial || null,
        characterId:      m.sender_id || null,
        senderName:       m.senderName || m.sender_name || 'User',
        userId:           null,
        isError:          false,
        metadata:         { isContext: true, fromRoomCode: parentCode },
      }))
      await insertMessages(ctxMsgs, room.id)
    }

    setBranchConfigData(null)
    setCurrentRoom(room)
    markRoomVisited(room.code)
    navigate(`/room/${room.code}`, { replace: true })
    setScreen('chat')
  }

  const handleUpdateRoom = (updatedRoom) => setCurrentRoom(updatedRoom)

  const handleBackToStart = () => {
    setCurrentRoom(null)
    setSelectedMode(null)
    setSelectedCharacters([])
    setBranchConfigData(null)
    navigate('/', { replace: true })
    setScreen('weaver')
  }

  const handleBackToMode = () => {
    setSelectedCharacters([])
    setScreen('mode')
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Persistent Kepos mark — tap to return to entry screen.
          Hidden in chat, weaver, loading, branch-config, and password-reset screens. */}
      {screen !== 'weaver' && screen !== 'loading' && screen !== 'chat' &&
       screen !== 'branch-config' && screen !== 'password-reset' && !needsUsername && (
        <button className="kepos-mark" onClick={handleBackToStart} title="Return to Kepos">
          kepos
        </button>
      )}

      {/* Username modal — shown as an overlay before anything else on first visit */}
      {needsUsername && (
        <UsernameModal onSave={handleUsernameSave} isRename={false} />
      )}

      {screen === 'loading' && !needsUsername && (
        <div className="loading-screen">
          <div className="loading-spinner" />
        </div>
      )}

      {screen === 'setup' && (
        <SetupScreen onApiKeySet={handleApiKeySet} />
      )}

      {screen === 'auth' && (
        <AuthScreen
          onBack={() => setScreen(currentRoom ? 'chat' : 'weaver')}
          promptReason={authPromptReason}
        />
      )}

      {screen === 'password-reset' && (
        <PasswordResetScreen
          onSuccess={() => setScreen(isAuthenticated ? 'weaver' : 'auth')}
        />
      )}

      {screen === 'weaver' && (
        <WeaverEntryScreen
          onOpenRoom={handleOpenRoom}
          onRoomCreated={(room) => {
            setCurrentRoom(room)
            markRoomVisited(room.code)
            navigate(`/room/${room.code}`, { replace: true })
            setScreen('chat')
          }}
          onSignIn={() => handleSignIn()}
          onStartRoom={handleStartRoom}
        />
      )}

      {screen === 'graph' && (
        <React.Suspense fallback={<div className="loading-screen"><div className="loading-spinner" /></div>}>
          <GraphScreen
            onOpenRoom={handleOpenRoom}
            onStartRoom={handleStartRoom}
            onSignIn={() => handleSignIn()}
          />
        </React.Suspense>
      )}

      {screen === 'inbox' && (
        <InboxScreen
          onStartRoom={handleStartRoom}
          onOpenRoom={handleOpenRoom}
          onJoinRoom={handleJoinRoom}
          onSignIn={() => handleSignIn()}
          joinError={joinError}
          onClearJoinError={() => setJoinError('')}
        />
      )}

      {screen === 'mode' && (
        <ModeSelection
          onSelectMode={handleSelectMode}
          onBack={handleBackToStart}
        />
      )}

      {screen === 'characters' && (
        <CharacterSelection
          onStartChat={handleStartChat}
          onBack={handleBackToMode}
          selectedMode={selectedMode}
          onSignIn={handleSignIn}
        />
      )}

      {screen === 'branch-config' && branchConfigData && (
        <BranchConfig
          foundingMessages={branchConfigData.foundingMessages}
          parentRoomId={branchConfigData.parentRoomId}
          branchedAtSequence={branchConfigData.branchedAtSequence}
          branchDepth={branchConfigData.branchDepth}
          parentCharacters={branchConfigData.parentCharacters || []}
          onConfirm={handleBranchConfirm}
          onCancel={() => setScreen(currentRoom ? 'chat' : 'weaver')}
        />
      )}

      {screen === 'chat' && currentRoom && (
        <ChatInterface
          room={currentRoom}
          onUpdateRoom={handleUpdateRoom}
          onBack={handleBackToStart}
          onOpenBranchConfig={handleOpenBranchConfig}
        />
      )}
    </div>
  )
}
