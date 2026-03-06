import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import SetupScreen from './components/SetupScreen.jsx'
import InboxScreen from './components/InboxScreen.jsx'
import ModeSelection from './components/ModeSelection.jsx'
import CharacterSelection from './components/CharacterSelection.jsx'
import ChatInterface from './components/ChatInterface.jsx'
import AuthScreen from './components/AuthScreen.jsx'
import AccountScreen from './components/AccountScreen.jsx'
import PasswordResetScreen from './components/PasswordResetScreen.jsx'
import BranchConfig from './components/BranchConfig.jsx'
import WeaverEntryScreen from './components/WeaverEntryScreen.jsx'
import ProfessionalScreen from './components/ProfessionalScreen.jsx'
import StrollConfig from './components/StrollConfig.jsx'
import LibraryScreen from './components/LibraryScreen.jsx'
import KidsComingSoonScreen from './components/KidsComingSoonScreen.jsx'
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
import { loadAllCharacters, autoCreateGardenerCharacter } from './utils/customCharacters.js'
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
  const [libraryReturnScreen,  setLibraryReturnScreen]  = useState('weaver')
  // Library initial tab/section — 'public' | 'private', and initial section for private
  const [libraryInitialTab,    setLibraryInitialTab]    = useState('public')
  const [libraryInitialSection, setLibraryInitialSection] = useState('my_convos')
  // When true, hide the section nav in the library (e.g. when opening Notes or Kids directly)
  const [libraryFocused,       setLibraryFocused]       = useState(false)

  // Username gate: disabled for now — name collection happens at a later point
  const [needsUsername, setNeedsUsername] = useState(false)

  // ── Derived display name ──────────────────────────────────────────────────
  const displayName = isAuthenticated
    ? (authUsername || getUsername() || 'User')
    : (getUsername() || 'Guest')

  // ── Professional mode gate ────────────────────────────────────────────────
  const isProfessionalUnlocked =
    (userId && userId === import.meta.env.VITE_DEV_USER_ID) ||
    (userId && userId === import.meta.env.VITE_PERSONAL_USER_ID)

  // Console log session UUID so the professional gate can be configured
  useEffect(() => {
    if (userId) console.log('[Kepos] Session user UUID:', userId)
  }, [userId])

  // ── Professional screen state ─────────────────────────────────────────────
  const [showProfessionalScreen, setShowProfessionalScreen] = useState(false)

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
    if (isAuthenticated) {
      setScreen('account')
      return
    }
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
   * @param {{ mode, branchText, selectedChars, branchData }} config
   */
  const handleBranchConfirm = async ({ mode, branchText, selectedChars, branchData }) => {
    const GARDENER_BRANCH_MODES = ['stroll', 'thinking']
    const parentCode = currentRoom?.code || null

    // Helper: insert founding messages as visible context
    const insertFoundingCtx = async (roomId) => {
      if (!branchData?.foundingContext?.length || !roomId) return
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
      await insertMessages(ctxMsgs, roomId)
    }

    if (GARDENER_BRANCH_MODES.includes(mode)) {
      // ── Stroll / Thinking branch → Gardener-only room with branch context ──
      const TURN_COUNTS = { stroll: 8, thinking: 8 }
      const STROLL_TURNS = TURN_COUNTS[mode] || 8
      const branchMode   = { id: mode, name: mode.charAt(0).toUpperCase() + mode.slice(1), icon: '🌿', modeContext: '' }

      const room = await createRoom(branchMode, [], displayName, isAuthenticated ? userId : null, 'private', branchData)

      if (room.id && supabase) {
        try {
          await supabase.from('rooms').update({
            room_mode:         mode,
            stroll_type:       'gardener_only',
            stroll_turn_count: STROLL_TURNS,
          }).eq('id', room.id)
        } catch {}
      }

      await gooseHonk1(room.id, STROLL_TURNS)

      const openingCtx = branchText?.trim() || ''
      await initStrollState(room.id, STROLL_TURNS, null, 'gardener_only', openingCtx, null)
      await fetchOrCreateMemory(room.id)

      if (supabase && room.id) {
        try {
          await supabase.from('gardener_memory').upsert(
            { room_id: room.id, stroll_mode: true, handoff_mentions: 0, handoff_character: null, handoff_status: 'none', opening_context: openingCtx, updated_at: new Date().toISOString() },
            { onConflict: 'room_id' }
          )
        } catch {}
      }

      await insertFoundingCtx(room.id)

      // Build branchContext string passed to Gardener system prompt
      const branchContextStr = branchData?.foundingContext?.length
        ? branchData.foundingContext.map(m => `${m.characterName || m.sender_name || 'User'}: ${m.content}`).join('\n')
        : null

      const senderName = isAuthenticated ? (authUsername || getUsername() || 'User') : (getUsername() || 'Guest')
      if (openingCtx && isSupabaseConfigured && room.id) {
        await insertMessage({ type: 'user', content: openingCtx, senderName, userId: userId || null }, room.id)
      }

      const initialStrollState = { room_id: room.id, turn_count_total: STROLL_TURNS, turn_count_chosen: STROLL_TURNS, turns_elapsed: 0, turns_remaining: STROLL_TURNS, current_season: 'winter_1', season_cycle: 1, opening_context: openingCtx }
      const initialMemory      = { stroll_mode: true, opening_context: openingCtx, handoff_mentions: 0, handoff_status: 'none', handoff_character: null, ladybug_instances: [] }

      try {
        const { text: gardenerResponse } = await runStrollGardener(
          openingCtx || '[branch opened]', initialMemory, initialStrollState, [], room.id, false, mode, branchContextStr
        )
        if (isSupabaseConfigured && room.id) {
          await insertMessage({ type: 'character', content: gardenerResponse, characterId: 'gardener', characterName: 'Gardener', characterColor: '#6b7c47', characterInitial: 'G' }, room.id)
        }
        await incrementStrollTurn(room.id, initialStrollState)
      } catch (err) {
        console.error('[Branch] Gardener init error:', err)
      }

      setBranchConfigData(null)
      setCurrentRoom({ ...room, mode: branchMode, roomMode: mode, strollType: 'gardener_only', stroll_turn_count: STROLL_TURNS })
      markRoomVisited(room.code)
      navigate(`/room/${room.code}`, { replace: true })
      setScreen('chat')

    } else {
      // ── Research / Professional branch → room with selected characters ──
      const branchMode = { id: mode, name: mode.charAt(0).toUpperCase() + mode.slice(1), icon: '🗣', modeContext: '' }
      const room = await createRoom(branchMode, selectedChars, displayName, isAuthenticated ? userId : null, 'private', branchData)
      await insertFoundingCtx(room.id)
      setBranchConfigData(null)
      setCurrentRoom(room)
      markRoomVisited(room.code)
      navigate(`/room/${room.code}`, { replace: true })
      setScreen('chat')
    }
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
   * Called by WeaverEntryScreen when user submits from any mode icon.
   * Creates a gardener_only room for the selected mode, inserts the user's message
   * and first Gardener response, then navigates into the dialogue.
   *
   * @param {'stroll'|'thinking'|'research'|'professional'} mode
   * @param {string} text — the user's opening question/curiosity
   */
  const handleModeEntry = async (mode, text) => {
    const trimmed = text.trim()
    if (!trimmed) return

    const TURN_COUNTS = { stroll: 8, thinking: 8, research: 6, professional: 4 }
    const STROLL_TURNS = TURN_COUNTS[mode] || 8
    const strollMode   = { id: mode, name: mode.charAt(0).toUpperCase() + mode.slice(1), icon: '🌿', modeContext: '' }

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
          room_mode:         mode,
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
        false,  // isKidsMode
        mode,   // gardener mode
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
      console.error('[ModeEntry] Gardener init error:', err)
      // Still navigate — user can see the empty room and type
    }

    // Navigate into room
    const strollRoom = {
      ...room,
      mode:             strollMode,
      roomMode:         mode,
      strollType:       'gardener_only',
      stroll_turn_count: STROLL_TURNS,
    }
    setCurrentRoom(strollRoom)
    markRoomVisited(room.code)
    navigate(`/room/${room.code}`, { replace: true })
    setScreen('chat')
  }

  /**
   * Called by ProfessionalScreen "Start a Discussion" — direct multi-character room.
   * Creates a professional-mode room with selected chars and a 20-turn limit.
   */
  const handleProfessionalDirectStart = async (chars) => {
    if (!chars?.length) return
    const profMode = { id: 'professional', name: 'Professional', icon: '🗣', modeContext: '' }
    const room = await createRoom(
      profMode,
      chars,
      displayName,
      isAuthenticated ? userId : null,
      'private',
      null,
    )
    if (room.id && supabase) {
      try {
        await supabase.from('rooms').update({
          room_mode:         'professional',
          stroll_type:       'character_stroll',
          stroll_turn_count: 20,
        }).eq('id', room.id)
      } catch {}
    }
    await initStrollState(room.id, 20, null, 'character_stroll', '', null)
    setShowProfessionalScreen(false)
    const profRoom = { ...room, mode: profMode, roomMode: 'professional', strollType: 'character_stroll', stroll_turn_count: 20, characters: chars }
    setCurrentRoom(profRoom)
    markRoomVisited(room.code)
    navigate(`/room/${room.code}`, { replace: true })
    setScreen('chat')
  }

  /**
   * Called by ProfessionalScreen "Start with Gardener" — professional Gardener-led entry.
   * Reuses handleModeEntry with mode 'professional'. Selected chars are passed as
   * branchContext so the Gardener knows which experts the user has in mind.
   */
  const handleProfessionalGardenerStart = async (chars, text) => {
    const trimmed = text?.trim()
    if (!trimmed) return
    setShowProfessionalScreen(false)
    // Build a one-line roster to inject as branch context for the Gardener
    const roster = chars.map(c => `${c.displayName || c.name}${c.title ? ` (${c.title})` : ''}`).join(', ')
    const enrichedText = trimmed  // text goes through normal entry; roster injected via branchContext
    // Reuse the entry flow — branchContext is not yet wired into handleModeEntry directly,
    // so we call it normally and let the Gardener route from the professional prompt.
    await handleModeEntry('professional', enrichedText)
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

    const CHAR_ROOM_TURN_COUNTS = { stroll: 20, thinking: 30 }
    const parentMode             = currentRoom.roomMode || 'stroll'
    const STROLL_2_TURNS         = CHAR_ROOM_TURN_COUNTS[parentMode] || 20
    const strollMode             = { id: parentMode, name: parentMode.charAt(0).toUpperCase() + parentMode.slice(1), icon: '🌿', modeContext: '' }

    // Look up the character — if not in DB, auto-create and persist it.
    // autoCreateGardenerCharacter handles: DB lookup → Claude generation → DB insert.
    let character = null
    try {
      const allChars = await loadAllCharacters()
      character = allChars.find(c =>
        c.name.toLowerCase() === characterName.toLowerCase()
      ) || null
    } catch {}

    if (!character) {
      // Character not found in DB — generate a full profile via Claude and save to DB
      // so the community of Gardener-discovered thinkers grows over time.
      try {
        character = await autoCreateGardenerCharacter(characterName)
      } catch {
        // Last-resort in-memory fallback (no DB, no network)
        character = {
          id:          characterName.toLowerCase().replace(/\s+/g, '_'),
          name:        characterName,
          title:       'Thinker',
          personality: `You are ${characterName}. Respond in character based on your known views, ideas, and historical context.`,
          color:       '#5a7a8a',
        }
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
          room_mode:         parentMode,
          stroll_type:       'character_stroll',
          stroll_turn_count: STROLL_2_TURNS,
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
      mode:            strollMode,
      roomMode:        parentMode,
      strollType:      'character_stroll',
      stroll_turn_count: STROLL_2_TURNS,
      characters:      [character],
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
   * Open the Kepos for Kids coming-soon gate from the public library.
   */
  const handleKidsMode = () => {
    setScreen('kids-coming-soon')
  }

  /**
   * Called when a parent/teacher taps the walking figure on KidsComingSoonScreen.
   * Creates a kids stroll room (is_kids_mode: true, 8 turns, gardener_only),
   * gets a warm Gardener greeting, and navigates straight into the stroll.
   */
  const handleKidsEntry = async () => {
    const STROLL_TURNS = 8
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

    // Tag it as a kids stroll
    if (room.id && supabase) {
      try {
        await supabase.from('rooms').update({
          room_mode:         'stroll',
          stroll_type:       'gardener_only',
          stroll_turn_count: STROLL_TURNS,
          is_kids_mode:      true,
        }).eq('id', room.id)
      } catch {}
    }

    await gooseHonk1(room.id, STROLL_TURNS)
    await initStrollState(room.id, STROLL_TURNS, null, 'gardener_only', '', null)
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
            opening_context:   '',
            updated_at:        new Date().toISOString(),
          },
          { onConflict: 'room_id' }
        )
      } catch {}
    }

    const initialStrollState = {
      room_id:           room.id,
      turn_count_total:  STROLL_TURNS,
      turn_count_chosen: STROLL_TURNS,
      turns_elapsed:     0,
      turns_remaining:   STROLL_TURNS,
      current_season:    'winter_1',
      season_cycle:      1,
      opening_context:   '',
    }

    const initialMemory = {
      stroll_mode:       true,
      opening_context:   '',
      handoff_mentions:  0,
      handoff_status:    'none',
      handoff_character: null,
      ladybug_instances: [],
    }

    // Get the Gardener's warm kids greeting (turn 0 — no user message in DB)
    try {
      const { text: greeting } = await runStrollGardener(
        'hello',
        initialMemory,
        initialStrollState,
        [],
        room.id,
        true, // isKidsMode
      )

      const greetingPayload = {
        type:             'character',
        content:          greeting,
        characterId:      'gardener',
        characterName:    'Gardener',
        characterColor:   '#6b7c47',
        characterInitial: 'G',
      }

      if (isSupabaseConfigured && room.id) {
        await insertMessage(greetingPayload, room.id)
      }

      await incrementStrollTurn(room.id, initialStrollState)
    } catch (err) {
      console.error('[KidsEntry] Gardener init error:', err)
    }

    const kidsRoom = {
      ...room,
      mode:              strollMode,
      roomMode:          'stroll',
      strollType:        'gardener_only',
      stroll_turn_count: STROLL_TURNS,
      isKidsMode:        true,
    }

    setCurrentRoom(kidsRoom)
    markRoomVisited(room.code)
    navigate(`/room/${room.code}`, { replace: true })
    setScreen('chat')
  }

  /**
   * Open the Library full-screen view from any screen.
   * Saves current screen so back navigation can restore it.
   * @param {'public'|'private'} tab      — which tab to land on
   * @param {string}             section  — which section within private tab
   */
  const handleOpenLibrary = (tab = 'public', section = 'my_convos', focused = false) => {
    setLibraryReturnScreen(screen)
    setLibraryInitialTab(tab)
    setLibraryInitialSection(section)
    setLibraryFocused(focused)
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

  /**
   * Called by ChatInterface back button.
   * Returns user to My Conversations in the private library.
   */
  const handleBackFromChat = () => {
    setCurrentRoom(null)
    navigate('/', { replace: true })
    handleOpenLibrary('private', 'my_convos')
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
       screen !== 'branch-config' && screen !== 'password-reset' &&
       screen !== 'kids-coming-soon' && screen !== 'library' && !needsUsername && (
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

      {screen === 'account' && (
        <AccountScreen onBack={() => setScreen('weaver')} />
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
          onKidsMode={handleKidsMode}
          initialTab={libraryInitialTab}
          initialSection={libraryInitialSection}
          focused={libraryFocused}
        />
      )}

      {screen === 'kids-coming-soon' && (
        <KidsComingSoonScreen
          onBack={() => setScreen('library')}
          onEnter={handleKidsEntry}
        />
      )}

      {screen === 'weaver' && (
        <WeaverEntryScreen
          onModeEntry={handleModeEntry}
          onOpenLibrary={handleOpenLibrary}
          onSignIn={() => {
            if (isAuthenticated) setScreen('account')
            else handleSignIn()
          }}
          onOpenProfessional={() => setShowProfessionalScreen(true)}
          isProfessionalUnlocked={isProfessionalUnlocked}
          isAuthenticated={isAuthenticated}
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
          isProfessionalUnlocked={isProfessionalUnlocked}
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

      {/* Professional character screen — overlay above entry screen */}
      {showProfessionalScreen && (
        <ProfessionalScreen
          onDirectStart={handleProfessionalDirectStart}
          onGardenerStart={handleProfessionalGardenerStart}
          onClose={() => setShowProfessionalScreen(false)}
        />
      )}

      {screen === 'chat' && currentRoom && (
        <ChatInterface
          room={currentRoom}
          onUpdateRoom={handleUpdateRoom}
          onBack={handleBackFromChat}
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
