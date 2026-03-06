import React, { useState, useRef, useEffect, useCallback } from 'react'
import MessageBubble from './MessageBubble.jsx'
import TypingIndicator from './TypingIndicator.jsx'
import UsernameModal from './UsernameModal.jsx'
import { getCharacterResponse, getStroll2Response, generateInviteMessage, callDirectAPI } from '../services/claudeApi.js'
import { routeMessage, formatRoutingNotice } from '../services/weaverRouter.js'
import {
  fetchOrCreateMemory, runGardenerRouter, updateGardenerMemory,
  writeSeasonalAssessment, fetchStrollState, incrementStrollTurn,
  runStrollGardener, setStrollDormant, updateHandoffState, buildStroll2DispositionLayer,
} from '../services/gardenerMemory.js'
import { gooseHonk2, checkGovernanceCollapse } from '../services/gooseAgent.js'
import { runWeatherAssessment, getLatestWeather } from '../services/weatherAgent.js'
import { runBugsAssessment } from '../services/bugsAgent.js'
import { runHuxAssessment } from '../services/huxAgent.js'
import { isSupabaseConfigured, supabase } from '../lib/supabase.js'
import { insertMessage, fetchMessages, fetchMessagesAfter } from '../utils/messageUtils.js'
import { saveRoom, ensureParticipant, getMyRole, listParticipants, setParticipantRole, fetchRoomAncestors } from '../utils/roomUtils.js'
import { getUsername, setUsername } from '../utils/username.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDevMode } from '../contexts/DevModeContext.jsx'
// LibraryScreen is now a full-screen view navigated to via onOpenLibrary prop

const POLL_INTERVAL_MS = 3000

// ── Handoff affirmative detection ─────────────────────────────────────────────
function detectAffirmative(text) {
  const lower = text.toLowerCase().trim()
  const affirms = [
    'yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'alright', 'alright,',
    'let\'s do it', 'let\'s go', 'sounds good', 'please', 'definitely',
    'of course', 'absolutely', 'why not', 'yes please', 'go ahead', 'do it',
    'i\'d like that', 'that sounds', 'good idea', 'great', 'perfect',
  ]
  return affirms.some(a => lower === a || lower.startsWith(a + ' ') || lower.startsWith(a + ',') || lower.startsWith(a + '.'))
}

export default function ChatInterface({ room, onUpdateRoom, onBack, onOpenBranchConfig, onTriggerStroll, onStrollClose, onOpenLibrary, onHandoffAccepted }) {
  const { isAuthenticated, username: authUsername, userId } = useAuth()
  const {
    routerEnabled, memoryEnabled, gardenerEnabled,
    gooseEnabled, weatherEnabled, bugsEnabled, huxEnabled,
  } = useDevMode()

  // Stroll close visual sequence
  const [strollClosing, setStrollClosing] = useState(false)
  const [strollFading,  setStrollFading]  = useState(false)

  // Stroll state — loaded once on mount for stroll rooms
  const [strollState, setStrollState] = useState(null)
  const GARDENER_MODES = ['stroll', 'thinking', 'research', 'professional']
  const isStrollRoom   = GARDENER_MODES.includes(room?.mode?.id) || GARDENER_MODES.includes(room?.roomMode)
  const isStroll2      = isStrollRoom && (room?.strollType === 'character_stroll')

  // Handoff tracking for Stroll 1
  const [strollHandoff, setStrollHandoff] = useState({ status: 'none', characterName: null })

  // Handoff threshold UI state
  const [pendingHandoffChar,      setPendingHandoffChar]      = useState(null)
  const [handoffThresholdVisible, setHandoffThresholdVisible] = useState(false)
  const [handoffTransitioned,     setHandoffTransitioned]     = useState(false)

  // Disposition layer for Stroll 2 character responses
  const [stroll2Disposition, setStroll2Disposition] = useState('')

  const [messages,        setMessages]        = useState([])
  const [input,           setInput]           = useState('')
  const [isLoading,       setIsLoading]       = useState(true)  // true while fetching initial msgs
  const [isSending,       setIsSending]       = useState(false)
  const [typingCharacter, setTypingCharacter] = useState(null)
  const [routingNotice,   setRoutingNotice]   = useState(null) // internal only, not rendered
  const [shareState,      setShareState]      = useState('idle')
  const [showRenameModal, setShowRenameModal] = useState(false)
  const [copyState,       setCopyState]       = useState('idle') // 'idle' | 'copied'

  // ── Participant management ─────────────────────────────────────────────────
  const [showParticipants,  setShowParticipants]  = useState(false)
  const [participants,      setParticipants]      = useState([])
  const [myRole,            setMyRole]            = useState(null)

  // ── Genealogy panel ────────────────────────────────────────────────────────
  const [showGenealogy,  setShowGenealogy]  = useState(false)
  const [ancestors,      setAncestors]      = useState([])
  const [ancestorsLoading, setAncestorsLoading] = useState(false)

  // ── Message selection mode ─────────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds,   setSelectedIds]   = useState(new Set())
  const [notesCopied,   setNotesCopied]   = useState(false)

  const messagesEndRef      = useRef(null)
  const messagesContainerRef = useRef(null)
  const textareaRef         = useRef(null)
  const inputAreaRef        = useRef(null)
  const isSendingRef        = useRef(false)
  const messagesRef         = useRef(messages)
  const abortControllerRef  = useRef(null)
  const cancelledRef        = useRef(false)
  const sendLockRef         = useRef(false)
  const strollCloseTimer1   = useRef(null) // outer 2s timer for stroll fade
  const strollCloseTimer2   = useRef(null) // inner 1.5s timer for onStrollClose

  // ── Jump-to-bottom button ──────────────────────────────────────────────────
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  useEffect(() => { isSendingRef.current = isSending }, [isSending])
  useEffect(() => { messagesRef.current = messages },  [messages])

  // ── Derived admin state ────────────────────────────────────────────────────
  const isCreator = isAuthenticated && userId && room.createdByUserId === userId

  // ── Load messages + resolve participant role on mount ─────────────────────
  useEffect(() => {
    if (!room?.id) {
      setIsLoading(false)
      return
    }

    fetchMessages(room.id)
      .then(msgs => { setMessages(msgs); setIsLoading(false) })
      .catch(() => setIsLoading(false))

    // Load stroll state if applicable
    if (isStrollRoom) {
      fetchStrollState(room.id).then(s => setStrollState(s))
    }

    // Load Stroll 2 disposition layer if this is a character_stroll
    if (isStroll2 && room.characters?.length > 0) {
      const char = room.characters[0]
      ;(async () => {
        let conversationSpine = ''
        let openingContext    = ''
        if (isSupabaseConfigured && supabase && room.parentRoomId) {
          try {
            const { data: mem } = await supabase
              .from('gardener_memory')
              .select('conversation_spine, opening_context')
              .eq('room_id', room.parentRoomId)
              .maybeSingle()
            if (mem) {
              conversationSpine = mem.conversation_spine || ''
              openingContext    = mem.opening_context    || ''
            }
          } catch {}
        }
        const layer = buildStroll2DispositionLayer(char.name, openingContext, conversationSpine)
        setStroll2Disposition(layer)
      })()
    }

    if (isAuthenticated && userId) {
      const uname = authUsername || getUsername() || 'User'
      ensureParticipant(room.id, userId, uname, isCreator)
      if (!isCreator) {
        getMyRole(room.id, userId).then(role => setMyRole(role))
      } else {
        setMyRole('admin')
      }
    }
  }, [room?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Dormancy handoff recovery ─────────────────────────────────────────────
  // When a user returns to a Stroll 1 room, check whether a handoff was
  // suggested but never completed. If so, re-surface the threshold icon
  // without re-sending the bridging message.
  useEffect(() => {
    if (!isStrollRoom || isStroll2 || !room?.id) return
    if (!isSupabaseConfigured || !supabase) return
    ;(async () => {
      try {
        const { data: mem } = await supabase
          .from('gardener_memory')
          .select('handoff_status, handoff_character')
          .eq('room_id', room.id)
          .maybeSingle()
        if (
          mem?.handoff_character &&
          (mem.handoff_status === 'suggested' ||
           mem.handoff_status === 'question_asked' ||
           mem.handoff_status === 'accepted')
        ) {
          setStrollHandoff({ status: mem.handoff_status, characterName: mem.handoff_character })
          setPendingHandoffChar(mem.handoff_character)
          setHandoffThresholdVisible(true)
        }
      } catch {}
    })()
  }, [room?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Polling for new messages ───────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured || !room?.id) return

    const poll = async () => {
      if (isSendingRef.current) return
      const lastSeq = messagesRef.current.at(-1)?.sequenceNumber || 0
      const newMsgs = await fetchMessagesAfter(room.id, lastSeq)
      if (newMsgs.length > 0) {
        setMessages(prev => [...prev, ...newMsgs])
      }
    }

    const id = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [room?.id])

  // ── Scroll to bottom on new messages ──────────────────────────────────────
  useEffect(() => {
    if (!selectionMode) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, typingCharacter, selectionMode])

  // ── visualViewport: constrain height + lift input above keyboard on iOS ──────
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    let prevKeyboardHeight = 0
    const handleResize = () => {
      const keyboardHeight = Math.max(0, window.innerHeight - vv.height)
      document.documentElement.style.setProperty('--chat-keyboard-offset', `${keyboardHeight}px`)
      // Constrain chat-screen to the visual viewport height so the layout
      // doesn't overflow below the keyboard, keeping messages in view
      document.documentElement.style.setProperty('--chat-vv-height', `${vv.height}px`)
      // When keyboard newly opens, snap message list to bottom so the latest
      // message stays visible just above the lifted input
      if (keyboardHeight > 50 && prevKeyboardHeight <= 50) {
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
        })
      }
      prevKeyboardHeight = keyboardHeight
    }
    handleResize()
    vv.addEventListener('resize', handleResize)
    vv.addEventListener('scroll', handleResize)
    return () => {
      vv.removeEventListener('resize', handleResize)
      vv.removeEventListener('scroll', handleResize)
      document.documentElement.style.removeProperty('--chat-keyboard-offset')
      document.documentElement.style.removeProperty('--chat-vv-height')
    }
  }, [])

  // ── Scroll tracking for jump-to-bottom button ──────────────────────────────
  useEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
      setShowScrollBtn(distFromBottom > 200)
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  // ── Stop generation ────────────────────────────────────────────────────────
  const handleStop = useCallback(() => {
    cancelledRef.current = true
    abortControllerRef.current?.abort()
    setTypingCharacter(null)
    setIsSending(false)
    setRoutingNotice(null)
  }, [])

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isSending || sendLockRef.current) return

    // ── Command parsing ───────────────────────────────────────────────────────
    if (text === '/library') {
      setInput('')
      if (onOpenLibrary) onOpenLibrary()
      return
    }
    if (text === '/stroll') {
      setInput('')
      if (onTriggerStroll) onTriggerStroll()
      return
    }
    if (text === '/farmer') {
      setInput('')
      // Goose Honk 2 — collect state and write to library_reports
      const summary = await gooseHonk2(room.id, 'farmer_trigger', gooseEnabled)
      if (summary) {
        const sysMsg = {
          type:          'character',
          content:       summary,
          characterName: 'Goose',
          characterColor: '#6b7c47',
          characterInitial: 'G',
          characterId:   'goose',
          isError:       false,
        }
        if (isSupabaseConfigured && room?.id) {
          const saved = await insertMessage(sysMsg, room.id)
          setMessages(prev => [...prev, saved])
        } else {
          setMessages(prev => [...prev, { ...sysMsg, id: `goose_${Date.now()}`, timestamp: new Date().toISOString() }])
        }
      }
      return
    }

    sendLockRef.current = true

    const controller = new AbortController()
    abortControllerRef.current = controller
    cancelledRef.current = false

    const senderName = isAuthenticated
      ? (authUsername || getUsername() || 'User')
      : (getUsername() || 'Guest')

    const userMsgPayload = {
      type:       'user',
      content:    text,
      senderName,
      userId:     userId || null,
    }

    let savedUserMsg
    if (isSupabaseConfigured && room?.id) {
      savedUserMsg = await insertMessage(userMsgPayload, room.id)
    } else {
      savedUserMsg = { ...userMsgPayload, id: `user_${Date.now()}`, sequenceNumber: 0, timestamp: new Date().toISOString() }
    }

    const conversationSnapshot = messagesRef.current.filter(m => !m.isContext)
    setMessages(prev => [...prev, savedUserMsg])
    setInput('')
    setIsSending(true)
    setRoutingNotice(null)

    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // Fetch Gardener memory, run Weaver routing, and run Weather assessment in parallel.
    // Dev toggles: memoryEnabled gates memory fetch; routerEnabled gates Router call.
    const currentStrollState = strollState
    const [routing, memory] = await Promise.all([
      isStrollRoom
        ? Promise.resolve({ respondingCharacters: [], routingReason: 'stroll', weights: [] })
        : routeMessage(text, room.characters, conversationSnapshot, controller.signal),
      memoryEnabled ? fetchOrCreateMemory(room.id || null) : Promise.resolve(null),
    ])

    // Weather assessment (fire-and-forget — doesn't block response flow)
    if (weatherEnabled) {
      const turnsElapsed   = currentStrollState?.turns_elapsed ?? 0
      const turnsRemaining = currentStrollState?.turns_remaining ?? 0
      const turnTotal      = currentStrollState?.turn_count_total ?? 0
      runWeatherAssessment(
        room.id, text, conversationSnapshot, turnsElapsed, turnsRemaining, turnTotal, weatherEnabled
      ).catch(() => {})
    }

    const notice = formatRoutingNotice(routing)
    if (notice) setRoutingNotice(notice)

    // ── Gardener Router ───────────────────────────────────────────────────────
    // Runs as a distinct haiku call. Returns a routing plan that may restrict
    // or re-weight the Weaver's character list.
    // Silence is architectural: characters not in the plan are never invoked.
    // Dev toggle: when routerEnabled is false, skip the Router call entirely.
    const routerPlan = routerEnabled
      ? await runGardenerRouter(text, room.characters, memory)
      : null

    // Extract opening_path from the Router plan for this turn.
    // 'arrival' | 'deliberate' | null — shapes character posture on first turns.
    const openingPath = routerPlan?.opening_path || null

    // Apply the Gardener Router's plan to the Weaver's respondingCharacters list.
    // The Router can only restrict (remove / silence), not expand.
    // If the Router fails (null), fall back to the Weaver list unchanged.
    let respondingCharacters = routing.respondingCharacters
    if (routerPlan && Array.isArray(routerPlan.routing)) {
      // Build a lookup: character name (lowercase) → plan entry
      const planByName = Object.fromEntries(
        routerPlan.routing.map(r => [r.character.toLowerCase(), r])
      )
      respondingCharacters = routing.respondingCharacters
        .filter(char => {
          const entry = planByName[char.name.toLowerCase()]
          // Unknown to the plan → keep (safety); known → only if respond: true
          return entry ? entry.respond !== false : true
        })
        .map(char => {
          const entry = planByName[char.name.toLowerCase()]
          // Carry the Router's mode into responseWeight
          const weight = entry?.mode === 'brief' ? 'brief' : 'full'
          return { ...char, responseWeight: weight }
        })
    }

    const precedingResponses = []

    // ── Stroll 2 — character(s) are the voice (disposition layer active) ───────
    if (isStroll2) {
      const chars = room.characters || []
      if (chars.length === 0) {
        setTypingCharacter(null)
        setIsSending(false)
        sendLockRef.current = false
        return
      }

      // Professional rooms with multiple characters: every selected character
      // responds in turn. Single-character strolls use only the first character.
      const isProfMulti = room.roomMode === 'professional' && chars.length > 1
      const respondingChars = isProfMulti ? chars : [chars[0]]

      // For multi-char professional rooms fetch the parent context once so we
      // can build a per-character disposition layer for each respondent.
      let profOpeningContext = ''
      let profSpine          = ''
      if (isProfMulti && isSupabaseConfigured && supabase && room?.parentRoomId) {
        try {
          const { data: mem } = await supabase
            .from('gardener_memory')
            .select('conversation_spine, opening_context')
            .eq('room_id', room.parentRoomId)
            .maybeSingle()
          if (mem) {
            profOpeningContext = mem.opening_context    || ''
            profSpine          = mem.conversation_spine || ''
          }
        } catch {}
      }

      for (const stroll2Char of respondingChars) {
        if (cancelledRef.current) break

        setTypingCharacter({
          name:    stroll2Char.name,
          color:   stroll2Char.color || '#5a7a8a',
          initial: (stroll2Char.name || '?')[0].toUpperCase(),
        })

        // Build a disposition layer per character for professional multi-char rooms;
        // single-char strolls use the pre-built stroll2Disposition from state.
        const charDisposition = isProfMulti
          ? buildStroll2DispositionLayer(stroll2Char.name, profOpeningContext, profSpine)
          : stroll2Disposition

        try {
          const responseText = await getStroll2Response(
            stroll2Char,
            conversationSnapshot,
            text,
            charDisposition,
            controller.signal,
            room.characters,   // full roster so each character knows who else is present
          )

          if (!cancelledRef.current) {
            const charMsgPayload = {
              type:             'character',
              content:          responseText,
              characterId:      stroll2Char.id,
              characterName:    stroll2Char.name,
              characterColor:   stroll2Char.color || '#5a7a8a',
              characterInitial: (stroll2Char.name || '?')[0].toUpperCase(),
            }
            let savedMsg
            if (isSupabaseConfigured && room?.id) {
              savedMsg = await insertMessage(charMsgPayload, room.id)
            } else {
              savedMsg = { ...charMsgPayload, id: `s2_${Date.now()}`, timestamp: new Date().toISOString() }
            }
            setMessages(prev => [...prev, savedMsg])
          }
        } catch (err) {
          if (err.name !== 'AbortError') {
            console.error('[Stroll2] Character error:', err)
            const errMsg = {
              type: 'character', content: '[A moment of quiet.]',
              characterId: stroll2Char.id, characterName: stroll2Char.name,
              characterColor: stroll2Char.color || '#5a7a8a',
              characterInitial: (stroll2Char.name || '?')[0].toUpperCase(), isError: true,
            }
            setMessages(prev => [...prev, { ...errMsg, id: `s2_err_${Date.now()}`, timestamp: new Date().toISOString() }])
          }
        }
      }

      setTypingCharacter(null)
      setIsSending(false)
      setRoutingNotice(null)
      cancelledRef.current = false
      sendLockRef.current = false
      return
    }

    // ── Stroll 1 — Gardener is the only voice ─────────────────────────────────
    if (isStrollRoom) {
      // Handoff affirmative detection: if Gardener has suggested a character,
      // check whether this message is an acceptance
      if (strollHandoff.status === 'suggested' && strollHandoff.characterName) {
        if (detectAffirmative(text)) {
          // Accept: update DB, generate brief bridging message, then show threshold icon.
          // onHandoffAccepted is deferred to the user tapping the icon.
          const acceptedChar = strollHandoff.characterName
          await updateHandoffState(room.id, 'accepted', acceptedChar)
          setStrollHandoff(h => ({ ...h, status: 'accepting' }))

          // Generate a warm bridging message via direct API (not gardenerMemory)
          setTypingCharacter({ name: 'Gardener', color: '#6b7c47', initial: 'G' })
          try {
            const bridgingSystemPrompt =
              `You are the Gardener — a warm, unhurried companion who has been walking with someone through an open conversation. ` +
              `You've just suggested that ${acceptedChar} could be a good companion for the next part of their walk, and the person has accepted. ` +
              `Write one brief, warm bridging message (2–4 sentences). ` +
              `Acknowledge their acceptance gently. Orient them toward the new companion with warmth and a sense of quiet possibility. ` +
              `End the message with exactly the phrase "tap the icon to continue." ` +
              `Do not use any special markers, brackets, or formatting. Respond with only the message text.`
            const bridgingText = await callDirectAPI(
              bridgingSystemPrompt,
              [{ role: 'user', content: text }],
              200,
              controller.signal,
            )
            if (!cancelledRef.current) {
              const bridgingPayload = {
                type: 'character', content: bridgingText,
                characterId: 'gardener', characterName: 'Gardener',
                characterColor: '#6b7c47', characterInitial: 'G',
              }
              let savedBridging
              if (isSupabaseConfigured && room?.id) {
                savedBridging = await insertMessage(bridgingPayload, room.id)
              } else {
                savedBridging = { ...bridgingPayload, id: `stroll_bridge_${Date.now()}`, timestamp: new Date().toISOString() }
              }
              setMessages(prev => [...prev, savedBridging])
            }
          } catch (err) {
            if (err.name !== 'AbortError') console.error('[Stroll] Bridging message error:', err)
          }

          setTypingCharacter(null)
          setIsSending(false)
          setRoutingNotice(null)
          cancelledRef.current = false
          sendLockRef.current = false

          // Surface threshold icon — onHandoffAccepted fires only when icon is tapped
          setPendingHandoffChar(acceptedChar)
          setHandoffThresholdVisible(true)
          return
        } else {
          // Decline: close the handoff window, continue normally
          updateHandoffState(room.id, 'declined', null).catch(() => {})
          setStrollHandoff({ status: 'declined', characterName: null })
        }
      }

      setTypingCharacter({ name: 'Gardener', color: '#6b7c47', initial: 'G' })
      try {
        const { text: responseText, handoffMeta } = await runStrollGardener(
          text, memory, currentStrollState, conversationSnapshot, room.id,
          room.isKidsMode === true,
          room.roomMode || 'stroll'
        )

        if (!cancelledRef.current) {
          // If Gardener suggested a character, update handoff state
          if (handoffMeta) {
            updateHandoffState(room.id, handoffMeta.type, handoffMeta.characterName).catch(() => {})
            setStrollHandoff({ status: 'suggested', characterName: handoffMeta.characterName })
            console.log('[Stroll] Handoff suggested:', handoffMeta.characterName)
          }

          const strollMsgPayload = {
            type:             'character',
            content:          responseText,
            characterId:      'gardener',
            characterName:    'Gardener',
            characterColor:   '#6b7c47',
            characterInitial: 'G',
          }
          let savedMsg
          if (isSupabaseConfigured && room?.id) {
            savedMsg = await insertMessage(strollMsgPayload, room.id)
          } else {
            savedMsg = { ...strollMsgPayload, id: `stroll_${Date.now()}`, timestamp: new Date().toISOString() }
          }
          setMessages(prev => [...prev, savedMsg])
          precedingResponses.push({ characterName: 'Gardener', content: responseText })

          // Track stroll turn
          const newStrollState = await incrementStrollTurn(room.id, currentStrollState)
          setStrollState(newStrollState)
          console.log('[Stroll] turn:', newStrollState?.turns_elapsed, '/', newStrollState?.turn_count_total, '| season:', newStrollState?.current_season, '| remaining:', newStrollState?.turns_remaining)

          // Hard stop: when turns_remaining reaches zero, enforce closure immediately.
          // The Gardener may have already signalled the close; if not, the system closes for her.
          if ((newStrollState?.turns_remaining ?? 1) <= 0 || newStrollState?.current_season === 'dormant') {
            setStrollDormant(room.id).catch(() => {})
            // Trigger visual close sequence: dormant divider → fade → navigate to entry
            setStrollClosing(true)
            setTypingCharacter(null)
            setIsSending(false)
            setRoutingNotice(null)
            cancelledRef.current = false
            sendLockRef.current = false
            strollCloseTimer1.current = setTimeout(() => {
              setStrollFading(true)
              strollCloseTimer2.current = setTimeout(() => {
                if (onStrollClose) onStrollClose()
              }, 1500)
            }, 2000)
            return // do not continue processing
          }
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error('[Stroll] Gardener error:', err)
          const errMsg = { type: 'character', content: '[The garden is quiet right now.]', characterId: 'gardener', characterName: 'Gardener', characterColor: '#6b7c47', characterInitial: 'G', isError: true }
          setMessages(prev => [...prev, { ...errMsg, id: `stroll_err_${Date.now()}`, timestamp: new Date().toISOString() }])
        }
      }

      setTypingCharacter(null)
      setIsSending(false)
      setRoutingNotice(null)
      cancelledRef.current = false
      sendLockRef.current = false
      if (memoryEnabled && memory) {
        updateGardenerMemory(text, precedingResponses, memory, room.id || null, [], room.mode, null)
        writeSeasonalAssessment(room.id, memory, text, precedingResponses).catch(() => {})
      }
      saveRoom(room.code, { ...room })
      onUpdateRoom({ ...room })
      return
    }

    // ── Regular mode — multi-character flow ───────────────────────────────────
    for (const character of respondingCharacters) {
      if (cancelledRef.current) break
      setTypingCharacter(character)

      try {
        const lastSeq = messagesRef.current.at(-1)?.sequenceNumber ?? null
        const responseText = await getCharacterResponse(
          character,
          room.mode,
          room.characters,
          conversationSnapshot,
          text,
          precedingResponses,
          controller.signal,
          character.responseWeight || 'full',
          room.foundingContext || null,
          room.id || null,
          lastSeq,
          gardenerEnabled,   // dev toggle: includes Gardener governance layer in prompt
          openingPath,       // 'arrival' | 'deliberate' | null from Router
          gardenerEnabled ? memory : null, // pass memory for ladybug/hux context
        )

        if (cancelledRef.current) break

        const charMsgPayload = {
          type:             'character',
          content:          responseText,
          characterId:      character.id,
          characterName:    character.name,
          characterColor:   character.color,
          characterInitial: character.initial,
        }

        let savedCharMsg
        if (isSupabaseConfigured && room?.id) {
          savedCharMsg = await insertMessage(charMsgPayload, room.id)
        } else {
          savedCharMsg = { ...charMsgPayload, id: `char_${character.id}_${Date.now()}`, sequenceNumber: 0, timestamp: new Date().toISOString() }
        }

        precedingResponses.push({ characterName: character.name, content: responseText })
        setMessages(prev => [...prev, savedCharMsg])

        // Run Bugs + Hux in parallel (fire-and-forget) after each character response
        const currentTurnNumber = (memory?.turn_count || 0) + 1
        if (bugsEnabled || huxEnabled) {
          Promise.all([
            bugsEnabled
              ? runBugsAssessment(character.id, character.name, responseText, precedingResponses, room.id, currentTurnNumber, bugsEnabled)
              : Promise.resolve(null),
            huxEnabled
              ? runHuxAssessment(precedingResponses, room.id, currentTurnNumber, huxEnabled)
              : Promise.resolve(null),
          ]).catch(() => {})
        }

      } catch (err) {
        if (err.name === 'AbortError') break
        console.error(`Error from ${character.name}:`, err)

        const errPayload = {
          type:             'character',
          content:          `[${character.name} couldn't respond: ${err.message || 'Unknown error'}.]`,
          characterId:      character.id,
          characterName:    character.name,
          characterColor:   character.color,
          characterInitial: character.initial,
          isError:          true,
        }
        if (isSupabaseConfigured && room?.id) {
          const saved = await insertMessage(errPayload, room.id)
          setMessages(prev => [...prev, saved])
        } else {
          setMessages(prev => [...prev, { ...errPayload, id: `err_${Date.now()}`, timestamp: new Date().toISOString() }])
        }
      }
    }

    setTypingCharacter(null)
    setIsSending(false)
    setRoutingNotice(null)
    cancelledRef.current = false
    sendLockRef.current = false

    // Fire-and-forget Gardener Memory update.
    if (memoryEnabled && memory) {
      updateGardenerMemory(text, precedingResponses, memory, room.id || null, room.characters, room.mode, openingPath)
      writeSeasonalAssessment(room.id, memory, text, precedingResponses).catch(() => {})
    }

    // Governance collapse check (fire-and-forget)
    if (gooseEnabled && room?.id) {
      const currentTurn = (memory?.turn_count || 0) + 1
      checkGovernanceCollapse(room.id, currentTurn).then(collapsed => {
        if (collapsed) gooseHonk2(room.id, 'governance_collapse', gooseEnabled)
      }).catch(() => {})
    }

    saveRoom(room.code, { ...room })
    onUpdateRoom({ ...room })
  }, [input, isSending, room, onUpdateRoom, isAuthenticated, authUsername, userId, isStrollRoom, strollState, gooseEnabled, weatherEnabled, bugsEnabled, huxEnabled, gardenerEnabled, routerEnabled, memoryEnabled])

  // ── Handoff threshold tap ──────────────────────────────────────────────────
  const handleThresholdTap = useCallback(() => {
    if (!pendingHandoffChar) return
    // Cancel any pending stroll-close sequence (race condition: turn 8 may have
    // triggered the 2s fade timer before the user taps the threshold icon)
    if (strollCloseTimer1.current) clearTimeout(strollCloseTimer1.current)
    if (strollCloseTimer2.current) clearTimeout(strollCloseTimer2.current)
    setStrollFading(false)
    setStrollClosing(false)
    setHandoffTransitioned(true)
    setHandoffThresholdVisible(false)
    if (onHandoffAccepted) onHandoffAccepted(pendingHandoffChar)
  }, [pendingHandoffChar, onHandoffAccepted])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleShareLink = async () => {
    if (shareState === 'generating') return
    const url  = `${window.location.origin}/room/${room.code}`
    const name = isAuthenticated ? (authUsername || getUsername()) : (getUsername() || 'Someone')
    setShareState('generating')
    try {
      const inviteText  = await generateInviteMessage(name, room.characters, messagesRef.current)
      const fullMessage = `${inviteText} ${url}`
      if (navigator.share) {
        await navigator.share({ text: fullMessage })
        setShareState('shared')
      } else {
        await navigator.clipboard.writeText(fullMessage)
        setShareState('copied')
      }
      setTimeout(() => setShareState('idle'), 3000)
    } catch (err) {
      if (err.name !== 'AbortError') {
        try { await navigator.clipboard.writeText(url); setShareState('copied') } catch {}
        setTimeout(() => setShareState('idle'), 3000)
      } else {
        setShareState('idle')
      }
    }
  }

  const handleRenameSave = (newName) => {
    if (newName) setUsername(newName)
    setShowRenameModal(false)
  }

  // ── Copy whole chat transcript ─────────────────────────────────────────────
  const handleCopyChat = useCallback(async () => {
    const msgs = messagesRef.current.filter(m => !m.isContext)
    if (msgs.length === 0) return

    const charNames = room.characters.map(c => c.name).join(', ')
    const now       = new Date().toLocaleString()

    // Full Kepos agent state line (Stage 8 expansion)
    const agentState = [
      `Router ${routerEnabled   ? 'ON' : 'OFF'}`,
      `Memory ${memoryEnabled   ? 'ON' : 'OFF'}`,
      `Gardener ${gardenerEnabled ? 'ON' : 'OFF'}`,
      `Goose ${gooseEnabled    ? 'ON' : 'OFF'}`,
      `Weather ${weatherEnabled  ? 'ON' : 'OFF'}`,
      `Bugs ${bugsEnabled     ? 'ON' : 'OFF'}`,
      `Hux ${huxEnabled      ? 'ON' : 'OFF'}`,
    ].join(' | ')

    const strollLines = isStrollRoom && strollState ? [
      `Season: ${strollState.current_season || 'winter_1'}`,
      `Turns remaining: ${strollState.turns_remaining ?? '?'}`,
    ] : []

    const header = [
      '--- Kepos Room Transcript ---',
      `Room: ${room.name || room.code}`,
      `Mode: ${isStrollRoom ? 'stroll' : (room.mode?.name || 'Chat')}`,
      ...(charNames ? [`Characters: ${charNames}`] : []),
      `Date: ${now}`,
      `Kepos state: ${agentState}`,
      ...strollLines,
      '---',
    ].join('\n')

    const body = msgs.map(m => {
      const ts = m.timestamp
        ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '--:--'
      const sender = m.type === 'user'
        ? (m.senderName || 'User')
        : (m.characterName || 'Character')
      return `[${ts}] ${sender}: ${m.content}`
    }).join('\n')

    const footer = '\n--- End Transcript ---'
    const transcript = `${header}\n${body}${footer}`

    try {
      await navigator.clipboard.writeText(transcript)
      setCopyState('copied')
      setTimeout(() => setCopyState('idle'), 2000)
    } catch (err) {
      console.warn('[CopyChat] clipboard write failed:', err)
    }
  }, [room, routerEnabled, memoryEnabled, gardenerEnabled, gooseEnabled, weatherEnabled, bugsEnabled, huxEnabled, isStrollRoom, strollState])

  const handleInputChange = (e) => {
    setInput(e.target.value)
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 150) + 'px'
    }
  }

  // ── Message selection mode ─────────────────────────────────────────────────

  const enterSelectionMode = useCallback((msgId) => {
    setSelectionMode(true)
    setSelectedIds(new Set([msgId]))
  }, [])

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  const handleMessageToggle = useCallback((msgId) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(msgId)) next.delete(msgId)
      else next.add(msgId)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    const allIds = new Set(messages.filter(m => !m.isContext).map(m => m.id))
    setSelectedIds(allIds)
  }, [messages])

  const selectedMessages = selectionMode
    ? messages.filter(m => selectedIds.has(m.id))
    : []

  const handleBranchFromSelection = useCallback(() => {
    if (!onOpenBranchConfig || selectedMessages.length === 0) return
    onOpenBranchConfig({
      parentRoomId:       room.id,
      branchedAtSequence: selectedMessages.at(-1)?.sequenceNumber || null,
      branchDepth:        (room.branchDepth || 0) + 1,
      foundingMessages:   selectedMessages,
    })
    exitSelectionMode()
  }, [onOpenBranchConfig, selectedMessages, room, exitSelectionMode])

  // ── Copy to Notes ──────────────────────────────────────────────────────────
  const handleCopyToNotes = useCallback(async () => {
    if (!userId || selectedMessages.length === 0) return
    if (!isSupabaseConfigured || !supabase) return
    const date = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    const header = `Room ${room.code} · ${date}`
    const body = selectedMessages.map(m => {
      const sender = m.type === 'user' ? (m.senderName || 'User') : (m.characterName || 'Character')
      return `${sender}: ${m.content}`
    }).join('\n\n')
    const content = `${header}\n\n${body}`
    try {
      await supabase.from('notebook_entries').insert({ user_id: userId, content })
      setNotesCopied(true)
      setTimeout(() => { setNotesCopied(false); exitSelectionMode() }, 1500)
    } catch (err) {
      console.warn('[CopyToNotes] failed:', err)
    }
  }, [userId, selectedMessages, room, exitSelectionMode])

  // ── Participant management ─────────────────────────────────────────────────
  const handleOpenParticipants = async () => {
    const list = await listParticipants(room.id)
    setParticipants(list)
    setShowParticipants(true)
  }

  const handleToggleRole = async (p) => {
    const newRole = p.role === 'participant' ? 'viewer' : 'participant'
    await setParticipantRole(room.id, p.user_id, newRole)
    setParticipants(prev => prev.map(x => x.user_id === p.user_id ? { ...x, role: newRole } : x))
  }

  // ── Genealogy panel ────────────────────────────────────────────────────────
  const handleOpenGenealogy = async () => {
    setShowGenealogy(true)
    if (room.parentRoomId && ancestors.length === 0) {
      setAncestorsLoading(true)
      const chain = await fetchRoomAncestors(room.parentRoomId)
      setAncestors(chain)
      setAncestorsLoading(false)
    }
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const isReadOnly = room.visibility === 'read-only'
  const canType    = !isReadOnly || isCreator || myRole === 'participant'
  const isEmpty    = !isLoading && messages.length === 0
  const isLiveSync = isSupabaseConfigured

  // Abbreviated character names for room title
  const charTitle = (() => {
    const names = room.characters.map(c => c.name.split(' ').pop())
    if (names.length <= 3) return names.join(' · ')
    return names.slice(0, 2).join(' · ') + ` +${names.length - 2}`
  })()

  const modeLabel = room.mode?.name || 'Chat'

  return (
    <div className={`chat-screen${selectionMode ? ' selection-mode' : ''}${strollFading ? ' stroll-fade-out' : ''}${room.isKidsMode ? ' chat-screen--kids' : ''}`}>

      {/* ── Floating header overlay ── */}
      <div className="chat-float-header">
        {/* Top-left: back arrow */}
        <div className="chat-float-left">
          <button
            className="chat-float-btn"
            onClick={onBack}
            title="Back"
            aria-label="Back"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
        </div>

        {/* Top-right: character count */}
        <div className="chat-float-right">
          <button
            className="chat-float-btn"
            onClick={handleOpenParticipants}
            title="Characters in this room"
            aria-label="Characters"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              <span style={{ fontFamily: 'Georgia, serif', fontSize: '12px', color: 'inherit', lineHeight: 1 }}>
                {room.characters.length}
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* ── Selection action bar — slides down below header when selection mode active ── */}
      {selectionMode && (
        <div style={{
          position:       'fixed',
          top:            'calc(max(10px, env(safe-area-inset-top, 0px)) + 54px)',
          left:           0,
          right:          0,
          zIndex:         100,
          background:     'rgba(245, 242, 236, 0.97)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderBottom:   '1px solid rgba(107, 124, 71, 0.14)',
          display:        'flex',
          alignItems:     'center',
          padding:        '7px 12px',
          gap:            '8px',
        }}>

          {/* × dismiss */}
          <button
            onClick={exitSelectionMode}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#6b7c47', fontSize: '15px', padding: '4px 6px',
              fontFamily: 'system-ui, sans-serif', lineHeight: 1, flexShrink: 0,
            }}
          >✕</button>

          {/* Count + Select all */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span style={{ fontFamily: 'Georgia, serif', fontSize: '13px', color: selectedIds.size > 0 ? '#4a5830' : '#8a9a70', whiteSpace: 'nowrap' }}>
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Hold to select'}
            </span>
            <button
              onClick={handleSelectAll}
              style={{
                background: 'none', border: '1px solid rgba(107,124,71,0.28)', borderRadius: '8px',
                cursor: 'pointer', color: '#4a5830', fontFamily: 'Georgia, serif',
                fontSize: '11px', padding: '2px 8px', flexShrink: 0,
              }}
            >All</button>
          </div>

          {/* Action icons: Notes · Genealogy · Branch */}
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>

            {/* Save to Notes */}
            <button
              onClick={handleCopyToNotes}
              disabled={selectedIds.size === 0}
              title={notesCopied ? 'Saved!' : 'Save to notes'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '36px', height: '36px', borderRadius: '50%',
                background: notesCopied ? 'rgba(74,90,36,0.15)' : 'rgba(107,124,71,0.08)',
                border: `1px solid ${notesCopied ? 'rgba(74,90,36,0.35)' : 'rgba(107,124,71,0.20)'}`,
                cursor: selectedIds.size === 0 ? 'default' : 'pointer',
                color: notesCopied ? '#4a5a24' : (selectedIds.size === 0 ? '#b8c8a8' : '#5a6b30'),
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              {notesCopied
                ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
              }
            </button>

            {/* Genealogy */}
            <button
              onClick={() => { handleOpenGenealogy(); exitSelectionMode() }}
              title="Room lineage"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'rgba(107,124,71,0.08)',
                border: '1px solid rgba(107,124,71,0.20)',
                cursor: 'pointer', color: '#5a6b30',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="6" cy="6" r="2"/>
                <circle cx="6" cy="18" r="2"/>
                <circle cx="18" cy="12" r="2"/>
                <line x1="6" y1="8" x2="6" y2="16"/>
                <line x1="8" y1="6" x2="16" y2="10.5"/>
                <line x1="8" y1="18" x2="16" y2="13.5"/>
              </svg>
            </button>

            {/* Branch */}
            <button
              onClick={handleBranchFromSelection}
              disabled={selectedIds.size === 0}
              title="Branch from selected messages"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'rgba(107,124,71,0.08)',
                border: '1px solid rgba(107,124,71,0.20)',
                cursor: selectedIds.size === 0 ? 'default' : 'pointer',
                color: selectedIds.size === 0 ? '#b8c8a8' : '#5a6b30',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" y1="3" x2="6" y2="15"/>
                <circle cx="18" cy="6" r="3"/>
                <circle cx="6" cy="18" r="3"/>
                <path d="M18 9a9 9 0 0 1-9 9"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Messages ── */}
      <div className="chat-messages" ref={messagesContainerRef}>

        {/* Stroll 2 entry divider — thin HR marks where Stroll 1 ended */}
        {isStroll2 && !isLoading && (
          <div className="stroll-2-divider">
            <hr className="stroll-2-hr" />
          </div>
        )}

        {isLoading ? (
          <div className="chat-loading">
            <div className="loading-spinner" style={{ width: 28, height: 28 }} />
          </div>
        ) : isEmpty ? null : (() => {
          const lastContextIdx = messages.reduce((last, m, i) => m.isContext ? i : last, -1)
          return messages.map((msg, idx) => {
            const isSelected = selectionMode && selectedIds.has(msg.id)

            return (
              <React.Fragment key={msg.id || idx}>
                {idx === lastContextIdx + 1 && lastContextIdx >= 0 && (
                  <div className="msg-context-divider">conversation continues here</div>
                )}
                <MessageBubble
                  message={msg}
                  messageIndex={idx}
                  isSelected={isSelected}
                  inSelectionMode={selectionMode}
                  onTapInSelectionMode={() => handleMessageToggle(msg.id)}
                  onEnterSelectionMode={msg.isContext ? undefined : () => enterSelectionMode(msg.id)}
                />
              </React.Fragment>
            )
          })
        })()}

        {/* ── Handoff threshold — feature explainer + continue button ── */}
        {handoffThresholdVisible && !handoffTransitioned && (
          <div style={{
            margin:       '20px 20px 8px',
            background:   'rgba(107, 124, 71, 0.05)',
            border:       '1px solid rgba(107, 124, 71, 0.16)',
            borderRadius: '14px',
            padding:      '18px 16px 14px',
          }}>
            {/* Header */}
            <div style={{
              fontFamily:  'Georgia, serif',
              fontSize:    '13px',
              color:       '#4a5830',
              textAlign:   'center',
              marginBottom:'18px',
              lineHeight:  1.5,
            }}>
              In your next room, press and hold any message to:
            </div>

            {/* 3 feature icons */}
            <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: '20px' }}>

              {/* Save to notes */}
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'rgba(107,124,71,0.10)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 7px',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a6b30" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                </div>
                <div style={{ fontSize: '11px', color: '#6b7c47', fontFamily: 'system-ui, sans-serif', letterSpacing: '0.02em' }}>
                  Save to notes
                </div>
              </div>

              {/* Branch */}
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'rgba(107,124,71,0.10)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 7px',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a6b30" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="6" y1="3" x2="6" y2="15"/>
                    <circle cx="18" cy="6" r="3"/>
                    <circle cx="6" cy="18" r="3"/>
                    <path d="M18 9a9 9 0 0 1-9 9"/>
                  </svg>
                </div>
                <div style={{ fontSize: '11px', color: '#6b7c47', fontFamily: 'system-ui, sans-serif', letterSpacing: '0.02em' }}>
                  Branch
                </div>
              </div>

              {/* Trace lineage */}
              <div style={{ textAlign: 'center', flex: 1 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'rgba(107,124,71,0.10)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 7px',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a6b30" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="6" cy="6" r="2"/>
                    <circle cx="6" cy="18" r="2"/>
                    <circle cx="18" cy="12" r="2"/>
                    <line x1="6" y1="8" x2="6" y2="16"/>
                    <line x1="8" y1="6" x2="16" y2="10.5"/>
                    <line x1="8" y1="18" x2="16" y2="13.5"/>
                  </svg>
                </div>
                <div style={{ fontSize: '11px', color: '#6b7c47', fontFamily: 'system-ui, sans-serif', letterSpacing: '0.02em' }}>
                  Trace lineage
                </div>
              </div>
            </div>

            {/* Separator + walking man continue */}
            <div style={{
              borderTop:  '1px solid rgba(107,124,71,0.14)',
              paddingTop: '14px',
              display:    'flex',
              justifyContent: 'center',
            }}>
              <button
                onClick={handleThresholdTap}
                onTouchEnd={(e) => { e.preventDefault(); handleThresholdTap() }}
                title="Continue to next companion"
                aria-label="Continue handoff"
                style={{
                  display:     'flex',
                  alignItems:  'center',
                  gap:         '8px',
                  background:  'rgba(107, 124, 71, 0.10)',
                  border:      '1.5px solid rgba(107, 124, 71, 0.32)',
                  borderRadius:'24px',
                  padding:     '9px 22px',
                  cursor:      'pointer',
                  color:       '#6b7c47',
                  fontFamily:  'Georgia, serif',
                  fontSize:    '13px',
                }}
              >
                <svg width="16" height="19" viewBox="0 0 14 16" fill="none"
                  stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="2" r="1.5" />
                  <line x1="8.5" y1="3.5" x2="7.5" y2="8" />
                  <line x1="8"   y1="5.5" x2="11"  y2="7.5" />
                  <line x1="8"   y1="5.5" x2="5.5" y2="6.5" />
                  <line x1="7.5" y1="8"   x2="10"  y2="13" />
                  <line x1="7.5" y1="8"   x2="5"   y2="12" />
                </svg>
                Continue
              </button>
            </div>
          </div>
        )}

        {/* ── Soft transition marker ── */}
        {/* Rendered in-place when the threshold icon is tapped. */}
        {/* Stays in the thread permanently — stroll messages above, character below. */}
        {handoffTransitioned && (
          <div style={{ padding: '16px 24px 6px', textAlign: 'center' }}>
            <hr style={{
              border:    'none',
              borderTop: '1px solid rgba(107, 124, 71, 0.25)',
              margin:    '0 0 6px',
            }} />
            <span style={{
              fontFamily:    "'Courier Prime', 'Courier New', Courier, monospace",
              fontSize:      '11px',
              color:         'rgba(107, 124, 71, 0.50)',
              letterSpacing: '0.06em',
            }}>continuing</span>
          </div>
        )}

        {/* Stroll dormant close — visual break rendered when stroll reaches turn limit */}
        {strollClosing && (
          <div className="stroll-dormant-close">
            <hr className="stroll-dormant-hr" />
            <div className="stroll-dormant-label">dormant</div>
          </div>
        )}

        {isSending && (
          <div className="chat-generation-status">
            {typingCharacter && <TypingIndicator character={typingCharacter} />}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>


      {/* ── Jump to bottom button ── */}
      {showScrollBtn && (
        <button
          className="chat-scroll-bottom-btn"
          onClick={scrollToBottom}
          aria-label="Scroll to bottom"
          type="button"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
      )}

      {/* ── Input ── */}
      {isReadOnly && !canType ? (
        <div className="chat-readonly-bar" ref={inputAreaRef}>
          <span className="chat-readonly-label">🔒 Read-only room</span>
          {onOpenBranchConfig && (
            <button
              className="chat-readonly-branch-btn"
              type="button"
              onClick={() => {
                const lastMsg = messages[messages.length - 1]
                if (lastMsg) {
                  onOpenBranchConfig({
                    parentRoomId:       room.id,
                    branchedAtSequence: lastMsg.sequenceNumber,
                    branchDepth:        (room.branchDepth || 0) + 1,
                    foundingMessages:   messages.slice(-5),
                  })
                }
              }}
            >
              ⎇ Branch this room
            </button>
          )}
        </div>
      ) : (
        <div className="chat-input-area" ref={inputAreaRef}>
          <div className="chat-input-wrapper">
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder={isSending ? 'Characters are responding…' : 'Message the group…'}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={isSending}
              rows={1}
            />

            {isSending ? (
              <button
                type="button"
                className="send-btn stop-btn"
                onClick={handleStop}
                onTouchEnd={(e) => { e.preventDefault(); handleStop() }}
                title="Stop generation"
              >■</button>
            ) : (
              <button
                type="button"
                className="send-btn"
                onClick={handleSend}
                onTouchEnd={(e) => { e.preventDefault(); if (input.trim()) handleSend() }}
                disabled={!input.trim()}
                title="Send (Enter)"
              >→</button>
            )}
          </div>
          <div className="chat-input-hint">
            {isSending
              ? 'Tap ■ to stop · Shift+Enter for new line'
              : 'Enter to send · Shift+Enter for new line'}
          </div>
        </div>
      )}

      {showRenameModal && (
        <UsernameModal onSave={handleRenameSave} isRename={true} />
      )}

      {/* ── Participants panel ── */}
      {showParticipants && (
        <div className="participants-overlay" onClick={() => setShowParticipants(false)}>
          <div className="participants-panel" onClick={e => e.stopPropagation()}>
            <div className="participants-header">
              <span className="participants-title">Characters</span>
              <button className="participants-close" onClick={() => setShowParticipants(false)} type="button">✕</button>
            </div>

            {/* Always show the characters in this room */}
            <div className="participants-chars-list">
              {room.characters.map(c => (
                <div key={c.id} className="participants-char-row">
                  <div className="participants-char-avatar" style={{ background: c.color }}>
                    {c.initial}
                  </div>
                  <div className="participants-char-info">
                    <div className="participants-char-name">{c.name}</div>
                    <div className="participants-char-title">{c.title}</div>
                  </div>
                  <div className={`participants-char-tier ${c.isCanonical ? 'canonical' : c.category === 'expert' ? 'expert' : 'variant'}`}>
                    {c.isCanonical ? 'canonical' : c.category === 'expert' ? 'expert' : 'variant'}
                  </div>
                </div>
              ))}
            </div>

            {/* Admin: manage human participants */}
            {isCreator && room.visibility === 'read-only' && (
              <>
                <div className="participants-divider" />
                <div className="participants-subtext">
                  Toggle who can type. Viewers can read; participants can reply.
                </div>
                {participants.length === 0 ? (
                  <div className="participants-empty">No one has joined yet.</div>
                ) : (
                  <div className="participants-list">
                    {participants.map(p => (
                      <div key={p.user_id} className="participants-row">
                        <div className="participants-name">{p.username || 'Anonymous'}</div>
                        <button
                          className={`participants-role-btn ${p.role === 'participant' ? 'active' : ''}`}
                          onClick={() => handleToggleRole(p)}
                          type="button"
                        >
                          {p.role === 'participant' ? '✓ Can type' : 'Viewer'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="participants-admin-note">
                  You (admin) can always type in this room.
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Genealogy panel ── */}
      {showGenealogy && (
        <div className="genealogy-overlay" onClick={() => setShowGenealogy(false)}>
          <div className="genealogy-panel" onClick={e => e.stopPropagation()}>
            <div className="genealogy-pull-handle" />

            <div className="genealogy-header">
              <span className="genealogy-title">Room lineage</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={handleCopyChat}
                  title="Copy transcript"
                  type="button"
                  style={{
                    background:   'none',
                    border:       '1px solid rgba(107,124,71,0.28)',
                    borderRadius: '8px',
                    cursor:       'pointer',
                    color:        copyState === 'copied' ? '#4a5a24' : '#6b7c47',
                    fontFamily:   'Georgia, serif',
                    fontSize:     '12px',
                    padding:      '4px 10px',
                    display:      'flex',
                    alignItems:   'center',
                    gap:          '5px',
                    transition:   'color 0.15s ease',
                  }}
                >
                  {copyState === 'copied'
                    ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied</>
                    : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Transcript</>
                  }
                </button>
                <button className="genealogy-close" onClick={() => setShowGenealogy(false)} type="button">✕</button>
              </div>
            </div>

            {/* Room details */}
            <div className="genealogy-section">
              <div className="genealogy-section-label">This room</div>
              <div className="genealogy-detail-row">
                <span className="genealogy-detail-key">Characters</span>
                <span className="genealogy-detail-val">{room.characters.map(c => c.name).join(', ')}</span>
              </div>
              <div className="genealogy-detail-row">
                <span className="genealogy-detail-key">Mode</span>
                <span className="genealogy-detail-val">{modeLabel}</span>
              </div>
              <div className="genealogy-detail-row">
                <span className="genealogy-detail-key">Created by</span>
                <span className="genealogy-detail-val">{room.createdByName || 'Guest'}</span>
              </div>
              <div className="genealogy-detail-row">
                <span className="genealogy-detail-key">Created</span>
                <span className="genealogy-detail-val">{formatDate(room.createdAt)}</span>
              </div>
              <div className="genealogy-detail-row">
                <span className="genealogy-detail-key">Room code</span>
                <span className="genealogy-detail-val genealogy-code">{room.code}</span>
              </div>
            </div>

            {/* Branch context — founding messages that seeded this room */}
            {room.foundingContext && room.foundingContext.length > 0 && (
              <div className="genealogy-section">
                <div className="genealogy-section-label">Branched from</div>
                <div className="genealogy-branch-context">
                  {room.foundingContext.map((msg, i) => (
                    <div key={i} className="genealogy-branch-msg">
                      {(msg.sender_type === 'character' || msg.type === 'character') && (
                        <div
                          className="genealogy-branch-avatar"
                          style={{ background: msg.sender_color || msg.characterColor || '#4A5C3A' }}
                        >
                          {msg.sender_initial || msg.characterInitial || '?'}
                        </div>
                      )}
                      <div className="genealogy-branch-body">
                        <div className="genealogy-branch-sender">
                          {msg.sender_name || msg.characterName || msg.senderName || 'User'}
                        </div>
                        <div className="genealogy-branch-text">{msg.content}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lineage chain */}
            {room.parentRoomId ? (
              <div className="genealogy-section">
                <div className="genealogy-section-label">Branch lineage</div>
                {ancestorsLoading ? (
                  <div className="genealogy-loading">
                    <div className="loading-spinner" style={{ width: 22, height: 22 }} />
                  </div>
                ) : (
                  <div className="genealogy-chain">
                    {/* Current room marker */}
                    <div className="genealogy-chain-node current">
                      <div className="genealogy-node-dot current" />
                      <div className="genealogy-node-content">
                        <div className="genealogy-node-chars">{charTitle}</div>
                        <div className="genealogy-node-meta">{formatDate(room.createdAt)}</div>
                      </div>
                    </div>

                    {ancestors.map((ancestor, i) => (
                      <React.Fragment key={ancestor.id || i}>
                        <div className="genealogy-chain-line" />
                        <div
                          className={`genealogy-chain-node${ancestor.accessible === false ? ' locked' : ' clickable'}`}
                          onClick={() => {
                            if (ancestor.accessible !== false && ancestor.code) {
                              setShowGenealogy(false)
                              // Navigate to parent room
                              window.location.href = `${window.location.origin}/room/${ancestor.code}`
                            }
                          }}
                        >
                          <div className="genealogy-node-dot" />
                          <div className="genealogy-node-content">
                            <div className="genealogy-node-chars">
                              {ancestor.characters?.map(c => c.name?.split(' ').pop()).join(' · ') || 'Room'}
                              {ancestor.accessible === false && <span className="genealogy-lock-icon">🔒</span>}
                            </div>
                            <div className="genealogy-node-meta">
                              {formatDate(ancestor.createdAt)} · by {ancestor.createdByName || 'Guest'}
                            </div>
                            {ancestor.code && ancestor.accessible !== false && (
                              <div className="genealogy-node-code">{ancestor.code}</div>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    ))}

                    {/* Root indicator */}
                    {ancestors.length > 0 && !ancestors[ancestors.length - 1]?.parentRoomId && (
                      <>
                        <div className="genealogy-chain-line" />
                        <div className="genealogy-chain-node root">
                          <div className="genealogy-node-dot root" />
                          <div className="genealogy-node-content">
                            <div className="genealogy-node-chars">Origin room</div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="genealogy-section">
                <div className="genealogy-origin-badge">✦ Origin room — this is where the chain begins</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
