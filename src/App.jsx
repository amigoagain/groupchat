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
import StrollConfig from './components/StrollConfig.jsx'
import LibraryScreen from './components/LibraryScreen.jsx'
// GraphScreen (force-graph) is preserved for V2 but loaded lazily to keep it off
// the critical-path bundle (react-force-graph pulls in aframe which requires a
// global AFRAME object that isn't present in our Vite ESM build).
const GraphScreen = React.lazy(() => import('./components/GraphScreen.jsx'))
import UsernameModal from './components/UsernameModal.jsx'
import DevPanel from './components/DevPanel.jsx'
import { hasApiKey } from './services/claudeApi.js'
import { loadRoom, createRoom, diagnoseSupabase, incrementParticipantCount } from './utils/roomUtils.js'
import { insertMessage, insertMessages } from './utils/messageUtils.js'
import { hasUsername, setUsername, getUsername } from './utils/username.js'
import { markRoomVisited, markAllSeen } from './utils/inboxUtils.js'
import { useAuth } from './contexts/AuthContext.jsx'
import { gooseHonk1 } from './services/gooseAgent.js'
import {
  initStrollState,
  fetchOrCreateMemory,
  seedMemoryFromParent,
  runStrollGardener,
  incrementStrollTurn,
  updateHandoffState,
  buildStroll2DispositionLayer,
} from './services/gardenerMemory.js'
import { getStroll2Response } from './services/claudeApi.js'
import { loadAllCharacters } from './utils/customCharacters.js'
import { supabase, isSupabaseConfigured } from './lib/supabase.js'

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

  // Stroll config screen
  const [showStrollConfig,    setShowStrollConfig]    = useState(false)
  // Stroll branch — when "Continue stroll" is tapped from Library private section
  const [branchFromStrollRoom, setBranchFromStrollRoom] = useState(null)

  // Library screen — tracks which screen to return to on back
  const [libraryReturnScreen, setLibraryReturnScreen] = useState('weaver')

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
    // Data from Library includes parentCharacters directly; fall back to currentRoom
    setBranchConfigData({ ...data, parentCharacters: data.parentCharacters ?? currentRoom?.characters ?? [] })
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

  /**
   * Trigger the stroll config screen from any context (/stroll command or button).
   * If there's an active conversation, set its dormant_at immediately.
   */
  const handleTriggerStroll = async () => {
    // Set current room dormant if there is one
    if (currentRoom?.id && supabase) {
      try {
        await supabase.from('rooms').update({ dormant_at: new Date().toISOString() }).eq('id', currentRoom.id)
      } catch {}
    }
    setShowStrollConfig(true)
  }

  /**
   * Called by WeaverEntryScreen when user submits a question from the entry input bar.
   * Creates a 10-turn gardener_only stroll room, inserts the user's message and first
   * Gardener response, then navigates into the stroll dialogue.
   *
   * @param {string} text — the user's opening question/curiosity
   */
  const handleEntrySubmit = async (text) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const STROLL_TURNS = 10
    const strollMode   = { id: 'stroll', name: 'Stroll', icon: '🌿', modeContext: '' }

    // Create the room
    const room = await createRoom(
      strollMode,
      [],
      displayName,
      isAuthenticated ? userId : null,
      'private',
      null,
    )

    // Set room_mode + stroll_type
    if (room.id && supabase) {
      try {
        await supabase.from('rooms').update({
          room_mode:         'stroll',
          stroll_type:       'gardener_only',
          stroll_turn_count: STROLL_TURNS,
        }).eq('id', room.id)
      } catch {}
    }

    // Goose Honk 1
    await gooseHonk1(room.id, STROLL_TURNS)

    // Initialize stroll_state with opening_context
    await initStrollState(room.id, STROLL_TURNS, null, 'gardener_only', trimmed, null)

    // Initialize gardener_memory with stroll_mode + handoff fields + opening_context
    await fetchOrCreateMemory(room.id)
    if (supabase && room.id) {
      try {
        await supabase.from('gardener_memory').upsert(
          {
            room_id:           room.id,
            stroll_mode:       true,
            handoff_mentions:  0,
            handoff_character: null,
            handoff_status:    'none',
            opening_context:   trimmed,
            updated_at:        new Date().toISOString(),
          },
          { onConflict: 'room_id' }
        )
      } catch {}
    }

    // Insert user's opening message
    const senderName = isAuthenticated
      ? (authUsername || getUsername() || 'User')
      : (getUsername() || 'Guest')

    const userMsgPayload = {
      type:       'user',
      content:    trimmed,
      senderName,
      userId:     userId || null,
    }

    if (isSupabaseConfigured && room.id) {
      await insertMessage(userMsgPayload, room.id)
    }

    // Build a local stroll state for the first Gardener call
    const initialStrollState = {
      room_id:          room.id,
      turn_count_total: STROLL_TURNS,
      turn_count_chosen: STROLL_TURNS,
      turns_elapsed:    0,
      turns_remaining:  STROLL_TURNS,
      current_season:   'winter_1',
      season_cycle:     1,
      opening_context:  trimmed,
    }

    const initialMemory = {
      stroll_mode:       true,
      opening_context:   trimmed,
      handoff_mentions:  0,
      handoff_status:    'none',
      handoff_character: null,
      ladybug_instances: [],
    }

    // Get first Gardener response
    try {
      const { text: gardenerResponse } = await runStrollGardener(
        trimmed,
        initialMemory,
        initialStrollState,
        [],
        room.id,
      )

      const strollMsgPayload = {
        type:             'character',
        content:          gardenerResponse,
        characterId:      'gardener',
        characterName:    'Gardener',
        characterColor:   '#6b7c47',
        characterInitial: 'G',
      }

      if (isSupabaseConfigured && room.id) {
        await insertMessage(strollMsgPayload, room.id)
      }

      // Increment stroll turn after Gardener responds
      await incrementStrollTurn(room.id, initialStrollState)
    } catch (err) {
      console.error('[Entry] Gardener init error:', err)
      // Still navigate — user can see the empty room and type
    }

    // Navigate into stroll
    const strollRoom = {
      ...room,
      mode:             strollMode,
      roomMode:         'stroll',
      strollType:       'gardener_only',
      stroll_turn_count: STROLL_TURNS,
    }
    setCurrentRoom(strollRoom)
    markRoomVisited(room.code)
    navigate(`/room/${room.code}`, { replace: true })
    setScreen('chat')
  }

  /**
   * Called by ChatInterface when the user accepts a character handoff from the Gardener.
   * Creates Stroll 2 room (character_stroll), seeds it from Stroll 1 memory,
   * gets the character's first response, and navigates seamlessly into Stroll 2.
   *
   * @param {string} characterName — the name the Gardener suggested
   */
  const handleHandoffAccepted = async (characterName) => {
    if (!currentRoom?.id) return

    const STROLL_2_TURNS = 10
    const strollMode     = { id: 'stroll', name: 'Stroll', icon: '🌿', modeContext: '' }

    // Look up the character
    let character = null
    try {
      const allChars = await loadAllCharacters()
      character = allChars.find(c =>
        c.name.toLowerCase() === characterName.toLowerCase()
      ) || null
    } catch {}

    if (!character) {
      // Auto-create a minimal character object if not found
      character = {
        id:          characterName.toLowerCase().replace(/\s+/g, '_'),
        name:        characterName,
        title:       'Thinker',
        personality: `You are ${characterName}. Speak in your own voice.`,
        color:       '#5a7a8a',
      }
    }

    // Fetch Stroll 1 gardener_memory for conversation_spine + opening_context
    let conversationSpine = ''
    let openingContext    = ''
    if (supabase && currentRoom.id) {
      try {
        const { data: mem } = await supabase
          .from('gardener_memory')
          .select('conversation_spine, opening_context')
          .eq('room_id', currentRoom.id)
          .maybeSingle()
        if (mem) {
          conversationSpine = mem.conversation_spine || ''
          openingContext    = mem.opening_context    || ''
        }
      } catch {}
    }

    const dispositionLayer = buildStroll2DispositionLayer(
      character.name,
      openingContext,
      conversationSpine,
    )

    // Create Stroll 2 room
    const stroll2Room = await createRoom(
      strollMode,
      [character],
      displayName,
      isAuthenticated ? userId : null,
      'private',
      { parentRoomId: currentRoom.id, branchedAtSequence: null, branchDepth: 1, foundingContext: null },
    )

    if (stroll2Room.id && supabase) {
      try {
        await supabase.from('rooms').update({
          room_mode:   'stroll',
          stroll_type: 'character_stroll',
        }).eq('id', stroll2Room.id)
      } catch {}
    }

    // Initialize stroll_state for Stroll 2
    await initStrollState(
      stroll2Room.id,
      STROLL_2_TURNS,
      null,
      'character_stroll',
      openingContext,
      currentRoom.id, // parent_stroll_id
    )

    // Seed gardener_memory from Stroll 1
    if (stroll2Room.id && currentRoom.id) {
      await seedMemoryFromParent(stroll2Room.id, currentRoom.id).catch(() => {})
    }

    // Get first character response using disposition layer
    try {
      const firstResponse = await getStroll2Response(
        character,
        [],
        openingContext || 'I wanted to think about something.',
        dispositionLayer,
        null,
      )

      const charMsgPayload = {
        type:             'character',
        content:          firstResponse,
        characterId:      character.id,
        characterName:    character.name,
        characterColor:   character.color || '#5a7a8a',
        characterInitial: (character.name || '?')[0].toUpperCase(),
      }

      if (isSupabaseConfigured && stroll2Room.id) {
        await insertMessage(charMsgPayload, stroll2Room.id)
      }
    } catch (err) {
      console.error('[Stroll2] First character response error:', err)
    }

    // Navigate to Stroll 2 — same chat screen, different room
    const stroll2 = {
      ...stroll2Room,
      mode:       strollMode,
      roomMode:   'stroll',
      strollType: 'character_stroll',
      characters: [character],
    }
    setCurrentRoom(stroll2)
    markRoomVisited(stroll2Room.code)
    navigate(`/room/${stroll2Room.code}`, { replace: true })
    // screen stays 'chat' — no navigation jump
  }

  /**
   * Called by StrollConfig when user confirms turn count.
   * Creates a stroll room and initializes all stroll infrastructure.
   */
  const handleStrollConfirm = async (turnCount) => {
    setShowStrollConfig(false)

    // If branching from a dormant stroll, capture the parent before clearing
    const parentStrollRoom = branchFromStrollRoom
    setBranchFromStrollRoom(null)

    // Create room with mode: stroll
    const strollMode = { id: 'stroll', name: 'Stroll', icon: '🌿', modeContext: '' }
    const room = await createRoom(
      strollMode,
      [], // no characters in stroll rooms
      displayName,
      isAuthenticated ? userId : null,
      'private',
      null,
    )

    // Set room_mode, stroll_turn_count, and parent link if branching
    if (room.id && supabase) {
      try {
        await supabase.from('rooms').update({
          room_mode:         'stroll',
          stroll_turn_count: turnCount,
          ...(parentStrollRoom?.id ? { parent_room_id: parentStrollRoom.id } : {}),
        }).eq('id', room.id)
      } catch {}
    }

    // Goose Honk 1 — write turn count to agent_signals
    await gooseHonk1(room.id, turnCount)

    // Initialize stroll_state (with parent link if branching)
    await initStrollState(room.id, turnCount, parentStrollRoom?.id || null)

    // Initialize gardener_memory with stroll_mode: true
    const freshMemory = await fetchOrCreateMemory(room.id)
    if (freshMemory && supabase && room.id) {
      try {
        await supabase.from('gardener_memory').upsert(
          { room_id: room.id, stroll_mode: true, updated_at: new Date().toISOString() },
          { onConflict: 'room_id' }
        )
      } catch {}
    }

    // If branching from dormant stroll, seed memory from parent's final state
    if (parentStrollRoom?.id && room.id) {
      seedMemoryFromParent(room.id, parentStrollRoom.id).catch(() => {})
    }

    setCurrentRoom({ ...room, mode: strollMode, roomMode: 'stroll', stroll_turn_count: turnCount })
    markRoomVisited(room.code)
    navigate(`/room/${room.code}`, { replace: true })
    setScreen('chat')
  }

  /**
   * Open the Library full-screen view from any screen.
   * Saves current screen so back navigation can restore it.
   */
  const handleOpenLibrary = () => {
    setLibraryReturnScreen(screen)
    setScreen('library')
  }

  /**
   * Called by Library back button — returns to whichever screen opened Library.
   */
  const handleBackFromLibrary = () => {
    setScreen(libraryReturnScreen || 'weaver')
  }

  /**
   * Called when a stroll reaches zero turns — navigate back to entry screen.
   */
  const handleStrollClose = () => {
    setCurrentRoom(null)
    navigate('/', { replace: true })
    setScreen('weaver')
  }

  /**
   * Called by Private Library when "Continue stroll" is tapped on a dormant stroll.
   * Stores the parent room, closes Library, opens StrollConfig.
   */
  const handleContinueStroll = (dormantRoom) => {
    setBranchFromStrollRoom(dormantRoom)
    setScreen('weaver') // go to entry first so StrollConfig opens cleanly
    setShowStrollConfig(true)
  }

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
      {/* Dev banner — visible only to the dev user, above all other UI */}
      <DevPanel />

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

      {screen === 'library' && (
        <LibraryScreen
          onBack={handleBackFromLibrary}
          onOpenRoom={handleOpenRoom}
          onOpenBranchConfig={handleOpenBranchConfig}
          onContinueStroll={handleContinueStroll}
        />
      )}

      {screen === 'weaver' && (
        <WeaverEntryScreen
          onEntrySubmit={handleEntrySubmit}
          onOpenLibrary={handleOpenLibrary}
          onSignIn={() => handleSignIn()}
          onStartRoom={handleStartRoom}
          onOpenRoom={handleOpenRoom}
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
          onOpenLibrary={handleOpenLibrary}
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

      {/* Stroll config overlay — shown above any current screen */}
      {showStrollConfig && (
        <StrollConfig
          onConfirm={handleStrollConfirm}
          onCancel={() => setShowStrollConfig(false)}
        />
      )}

      {screen === 'chat' && currentRoom && (
        <ChatInterface
          room={currentRoom}
          onUpdateRoom={handleUpdateRoom}
          onBack={handleBackToStart}
          onOpenBranchConfig={handleOpenBranchConfig}
          onTriggerStroll={handleTriggerStroll}
          onStrollClose={handleStrollClose}
          onOpenLibrary={handleOpenLibrary}
          onHandoffAccepted={handleHandoffAccepted}
        />
      )}
    </div>
  )
}
