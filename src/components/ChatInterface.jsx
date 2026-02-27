import React, { useState, useRef, useEffect, useCallback } from 'react'
import MessageBubble from './MessageBubble.jsx'
import TypingIndicator from './TypingIndicator.jsx'
import UsernameModal from './UsernameModal.jsx'
import { getCharacterResponse, generateInviteMessage } from '../services/claudeApi.js'
import { routeMessage, formatRoutingNotice } from '../services/weaverRouter.js'
import { fetchOrCreateMemory, runGardenerRouter, updateGardenerMemory } from '../services/gardenerMemory.js'
import { isSupabaseConfigured } from '../lib/supabase.js'
import { insertMessage, fetchMessages, fetchMessagesAfter } from '../utils/messageUtils.js'
import { saveRoom, ensureParticipant, getMyRole, listParticipants, setParticipantRole, fetchRoomAncestors } from '../utils/roomUtils.js'
import { getUsername, setUsername } from '../utils/username.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDevMode } from '../contexts/DevModeContext.jsx'

const POLL_INTERVAL_MS = 3000

export default function ChatInterface({ room, onUpdateRoom, onBack, onOpenBranchConfig }) {
  const { isAuthenticated, username: authUsername, userId } = useAuth()
  const { routerEnabled, memoryEnabled, gardenerEnabled } = useDevMode()

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

  // ── Branch selection mode ──────────────────────────────────────────────────
  const [selectionMode,  setSelectionMode]  = useState(false)
  const [selectionRange, setSelectionRange] = useState({ start: null, end: null })
  const msgRefs = useRef([]) // one ref per message div

  const messagesEndRef      = useRef(null)
  const messagesContainerRef = useRef(null)
  const textareaRef         = useRef(null)
  const inputAreaRef        = useRef(null)
  const isSendingRef        = useRef(false)
  const messagesRef         = useRef(messages)
  const abortControllerRef  = useRef(null)
  const cancelledRef        = useRef(false)
  const sendLockRef         = useRef(false)

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

  // ── visualViewport: lift fixed input above keyboard on iOS ────────────────
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const handleResize = () => {
      const keyboardHeight = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop))
      document.documentElement.style.setProperty('--chat-keyboard-offset', `${keyboardHeight}px`)
    }
    handleResize()
    vv.addEventListener('resize', handleResize)
    vv.addEventListener('scroll', handleResize)
    return () => {
      vv.removeEventListener('resize', handleResize)
      vv.removeEventListener('scroll', handleResize)
      document.documentElement.style.removeProperty('--chat-keyboard-offset')
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

    // Fetch Gardener memory and run Weaver routing in parallel — both are
    // needed before we can call the Gardener Router.
    // Dev toggles: memoryEnabled gates memory fetch; routerEnabled gates Router call.
    const [routing, memory] = await Promise.all([
      routeMessage(text, room.characters, conversationSnapshot, controller.signal),
      memoryEnabled ? fetchOrCreateMemory(room.id || null) : Promise.resolve(null),
    ])

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
          gardenerEnabled,   // dev toggle: when false, skip opening/mode constraints
          openingPath,       // 'arrival' | 'deliberate' | null from Router
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
    // Runs after responses are already displayed — never blocks the user.
    // Dev toggle: when memoryEnabled is false, skip entirely.
    if (memoryEnabled && memory) {
      updateGardenerMemory(text, precedingResponses, memory, room.id || null, room.characters, room.mode, openingPath)
    }

    saveRoom(room.code, { ...room })
    onUpdateRoom({ ...room })
  }, [input, isSending, room, onUpdateRoom, isAuthenticated, authUsername, userId])

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
    const gardenerState = [
      `Router ${routerEnabled   ? 'ON' : 'OFF'}`,
      `Memory ${memoryEnabled   ? 'ON' : 'OFF'}`,
      `Gardener prompt ${gardenerEnabled ? 'ON' : 'OFF'}`,
    ].join(' | ')

    const header = [
      '--- Kepos Room Transcript ---',
      `Room: ${room.name || room.code}`,
      `Characters: ${charNames}`,
      `Date: ${now}`,
      `Gardener state: ${gardenerState}`,
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
  }, [room, routerEnabled, memoryEnabled, gardenerEnabled])

  const handleInputChange = (e) => {
    setInput(e.target.value)
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 150) + 'px'
    }
  }

  // ── Branch selection mode ──────────────────────────────────────────────────

  const enterSelectionMode = useCallback((startIdx) => {
    setSelectionMode(true)
    setSelectionRange({ start: startIdx, end: startIdx })
  }, [])

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectionRange({ start: null, end: null })
  }, [])

  const handleHandleMove = useCallback((handleType, newIdx) => {
    setSelectionRange(prev => {
      if (handleType === 'start') {
        const newStart = Math.min(newIdx, prev.end ?? newIdx)
        return { ...prev, start: newStart }
      } else {
        const newEnd = Math.max(newIdx, prev.start ?? newIdx)
        return { ...prev, end: newEnd }
      }
    })
  }, [])

  const handleMessageTap = useCallback((idx) => {
    if (!selectionMode) return
    setSelectionRange(prev => {
      if (prev.start === null) return { start: idx, end: idx }
      const newStart = Math.min(prev.start, idx)
      const newEnd   = Math.max(prev.end, idx)
      return { start: newStart, end: newEnd }
    })
  }, [selectionMode])

  const selectedMessages = selectionMode && selectionRange.start !== null
    ? messages.slice(selectionRange.start, (selectionRange.end ?? selectionRange.start) + 1)
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

  // ── Branch icon: toggle selection mode or confirm branch ──────────────────
  const handleBranchIconTap = useCallback(() => {
    if (selectionMode) {
      if (selectedMessages.length > 0) {
        handleBranchFromSelection()
      } else {
        exitSelectionMode()
      }
    } else {
      // Enter selection mode at the last non-context message
      const liveMessages = messages.filter(m => !m.isContext)
      if (liveMessages.length > 0) {
        const lastIdx = messages.length - 1
        enterSelectionMode(lastIdx)
      }
    }
  }, [selectionMode, selectedMessages, handleBranchFromSelection, exitSelectionMode, messages, enterSelectionMode])

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
    <div className={`chat-screen${selectionMode ? ' selection-mode' : ''}`}>

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

        {/* Top-right: participants, share, genealogy, branch */}
        <div className="chat-float-right">
          {/* Participants — shown to all (admin sees management) */}
          <button
            className="chat-float-btn"
            onClick={handleOpenParticipants}
            title="Characters in this room"
            aria-label="Characters"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </button>

          {/* Copy transcript */}
          <button
            className={`chat-float-btn${copyState === 'copied' ? ' share-active' : ''}`}
            onClick={handleCopyChat}
            title="Copy chat transcript"
            aria-label="Copy chat"
          >
            {copyState === 'copied'
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
            }
          </button>

          {/* Share — with live sync dot */}
          <button
            className={`chat-float-btn${shareState !== 'idle' ? ` share-active` : ''}`}
            onClick={handleShareLink}
            disabled={shareState === 'generating'}
            title="Share room"
            aria-label="Share"
          >
            {shareState === 'generating' && <span className="share-spinner" />}
            {shareState === 'copied' || shareState === 'shared'
              ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              : <span className="chat-float-share-wrap">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  {isLiveSync && <span className="chat-live-dot" />}
                </span>
            }
          </button>

          {/* Genealogy */}
          <button
            className="chat-float-btn"
            onClick={handleOpenGenealogy}
            title="Room lineage"
            aria-label="Genealogy"
          >
            {/* Branching path / lineage icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="6" cy="6" r="2"/>
              <circle cx="6" cy="18" r="2"/>
              <circle cx="18" cy="12" r="2"/>
              <line x1="6" y1="8" x2="6" y2="16"/>
              <line x1="8" y1="6" x2="16" y2="10.5"/>
              <line x1="8" y1="18" x2="16" y2="13.5"/>
            </svg>
          </button>

          {/* Branch — hidden in already-branched rooms to avoid duplicating the genealogy icon */}
          {!room.parentRoomId && (
          <button
            className={`chat-float-btn${selectionMode ? ' chat-float-btn-active' : ''}`}
            onClick={handleBranchIconTap}
            title={selectionMode ? (selectedMessages.length > 0 ? 'Branch selected messages' : 'Cancel') : 'Branch this conversation'}
            aria-label="Branch"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <line x1="6" y1="3" x2="6" y2="15"/>
              <circle cx="18" cy="6" r="3"/>
              <circle cx="6" cy="18" r="3"/>
              <path d="M18 9a9 9 0 0 1-9 9"/>
            </svg>
          </button>
          )}
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="chat-messages" ref={messagesContainerRef}>
        {isLoading ? (
          <div className="chat-loading">
            <div className="loading-spinner" style={{ width: 28, height: 28 }} />
          </div>
        ) : isEmpty ? null : (() => {
          const lastContextIdx = messages.reduce((last, m, i) => m.isContext ? i : last, -1)
          return messages.map((msg, idx) => {
            const isSelected = selectionMode &&
              selectionRange.start !== null &&
              idx >= selectionRange.start && idx <= (selectionRange.end ?? selectionRange.start)

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
                  onTapInSelectionMode={() => handleMessageTap(idx)}
                  onEnterSelectionMode={msg.isContext ? undefined : () => enterSelectionMode(idx)}
                  onHandleMove={handleHandleMove}
                  showBranchHints={selectionMode}
                  isFirstSelected={selectionMode && idx === selectionRange.start}
                  isLastSelected={selectionMode && idx === selectionRange.end}
                  msgRef={el => { msgRefs.current[idx] = el }}
                />
              </React.Fragment>
            )
          })
        })()}

        {isSending && (
          <div className="chat-generation-status">
            {typingCharacter && <TypingIndicator character={typingCharacter} />}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Branch selection floating bar ── */}
      {selectionMode && (
        <div className="chat-selection-bar">
          <button className="chat-selection-cancel" onClick={exitSelectionMode} type="button">
            ✕ Cancel
          </button>
          <span className="chat-selection-count">
            {selectedMessages.length > 0
              ? `${selectedMessages.length} message${selectedMessages.length !== 1 ? 's' : ''} selected`
              : 'Tap messages to select'}
          </span>
          <button
            className="chat-selection-branch-btn"
            onClick={handleBranchFromSelection}
            disabled={selectedMessages.length === 0}
            type="button"
          >
            ⎇ Branch
          </button>
        </div>
      )}

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
              <button className="genealogy-close" onClick={() => setShowGenealogy(false)} type="button">✕</button>
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
