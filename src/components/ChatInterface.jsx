import { useState, useRef, useEffect, useCallback } from 'react'
import MessageBubble from './MessageBubble.jsx'
import TypingIndicator from './TypingIndicator.jsx'
import UsernameModal from './UsernameModal.jsx'
import { getCharacterResponse, generateInviteMessage } from '../services/claudeApi.js'
import { routeMessage, formatRoutingNotice } from '../services/weaverRouter.js'
import { isSupabaseConfigured } from '../lib/supabase.js'
import { insertMessage, fetchMessages, fetchMessagesAfter } from '../utils/messageUtils.js'
import { saveRoom } from '../utils/roomUtils.js'
import { getUsername, setUsername } from '../utils/username.js'
import { useAuth } from '../contexts/AuthContext.jsx'

const POLL_INTERVAL_MS = 3000

export default function ChatInterface({ room, onUpdateRoom, onBack, onOpenBranchConfig }) {
  const { isAuthenticated, username: authUsername, userId } = useAuth()

  const [messages,        setMessages]        = useState([])
  const [input,           setInput]           = useState('')
  const [isLoading,       setIsLoading]       = useState(true)  // true while fetching initial msgs
  const [isSending,       setIsSending]       = useState(false)
  const [typingCharacter, setTypingCharacter] = useState(null)
  const [routingNotice,   setRoutingNotice]   = useState(null) // internal only, not rendered
  const [copied,          setCopied]          = useState(false)
  const [shareState,      setShareState]      = useState('idle')
  const [showRenameModal, setShowRenameModal] = useState(false)

  // ── Founding context collapse (branch rooms) ───────────────────────────────
  const [foundingCollapsed, setFoundingCollapsed] = useState(false)

  // ── Branch selection mode ──────────────────────────────────────────────────
  const [selectionMode,  setSelectionMode]  = useState(false)
  const [selectionRange, setSelectionRange] = useState({ start: null, end: null })
  const msgRefs = useRef([]) // one ref per message div

  const messagesEndRef    = useRef(null)
  const textareaRef       = useRef(null)
  const isSendingRef      = useRef(false)
  const messagesRef       = useRef(messages)
  const abortControllerRef = useRef(null)
  const cancelledRef      = useRef(false)
  // Synchronous lock to prevent double-fire from touch + click events
  const sendLockRef       = useRef(false)

  useEffect(() => { isSendingRef.current = isSending }, [isSending])
  useEffect(() => { messagesRef.current = messages },  [messages])

  // ── Load messages from the messages table on mount ─────────────────────────
  useEffect(() => {
    if (!room?.id) {
      setIsLoading(false)
      return
    }
    fetchMessages(room.id)
      .then(msgs => { setMessages(msgs); setIsLoading(false) })
      .catch(() => setIsLoading(false))
  }, [room?.id])

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
    sendLockRef.current = true // synchronous lock: prevents touch+click double-fire

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

    // Insert to DB and get the saved row (with real id + sequence_number)
    let savedUserMsg
    if (isSupabaseConfigured && room?.id) {
      savedUserMsg = await insertMessage(userMsgPayload, room.id)
    } else {
      savedUserMsg = { ...userMsgPayload, id: `user_${Date.now()}`, sequenceNumber: 0, timestamp: new Date().toISOString() }
    }

    const conversationSnapshot = [...messagesRef.current]
    setMessages(prev => [...prev, savedUserMsg])
    setInput('')
    setIsSending(true)
    setRoutingNotice(null)

    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // ── Weaver routing ──────────────────────────────────────────────────────
    const routing = await routeMessage(text, room.characters, conversationSnapshot, controller.signal)
    const notice  = formatRoutingNotice(routing)
    if (notice) setRoutingNotice(notice)

    const precedingResponses = []

    for (const character of routing.respondingCharacters) {
      if (cancelledRef.current) break
      setTypingCharacter(character)

      try {
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
    sendLockRef.current = false // release lock

    // Persist room metadata locally (no messages JSON)
    saveRoom(room.code, { ...room })
    onUpdateRoom({ ...room })
  }, [input, isSending, room, onUpdateRoom, isAuthenticated, authUsername, userId])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
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

  /**
   * Handle dragging the top or bottom selection handle.
   * Called from MessageBubble when the handle is dragged to a new message idx.
   */
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

  /**
   * Toggle a single message's selection by tapping it in selection mode.
   */
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

  // ── Derived state ──────────────────────────────────────────────────────────
  const isReadOnly = room.visibility === 'read-only'
  const isEmpty    = !isLoading && messages.length === 0

  const shareLabel = {
    idle:       '🔗 Share',
    generating: '✦ Writing…',
    copied:     '✓ Copied!',
    shared:     '✓ Shared!',
  }[shareState]

  return (
    <div className={`chat-screen${selectionMode ? ' selection-mode' : ''}`}>
      {/* ── Header ── */}
      <div className="chat-header">
        <div className="chat-header-left">
          <button className="chat-back-btn" onClick={onBack}>← Leave</button>
          <div className="chat-room-info">
            <h2>
              {room.mode.icon} {room.mode.name} Room
              {room.visibility && room.visibility !== 'private' && (
                <span className={`room-visibility-badge room-visibility-${room.visibility}`}>
                  {room.visibility === 'unlisted'  && '🔓'}
                  {room.visibility === 'read-only' && '🔒'}
                  {room.visibility === 'open'       && '🌐'}
                  {' '}{room.visibility}
                </span>
              )}
            </h2>
            <div className="chat-room-meta">
              {room.characters.map(c => c.name).join(' · ')}
              {room.parentRoomId && (
                <span className="chat-branch-indicator"> · ⎇ branch</span>
              )}
            </div>
          </div>
        </div>

        <div className="chat-header-right">
          <div className="chat-participants">
            {room.characters.map(char => (
              <div
                key={char.id}
                className="participant-avatar"
                style={{ background: char.color }}
                title={char.name}
              >
                {char.initial}
              </div>
            ))}
          </div>

          <button
            className={`share-btn ${shareState !== 'idle' ? `share-btn-${shareState}` : ''}`}
            onClick={handleShareLink}
            disabled={shareState === 'generating'}
          >
            {shareState === 'generating' && <span className="share-spinner" />}
            {shareLabel}
          </button>

          {/* Branch / Selection mode toggle — always available for read-only, optional otherwise */}
          {onOpenBranchConfig && (
            <button
              className={`chat-select-btn${selectionMode ? ' active' : ''}`}
              onClick={() => selectionMode ? exitSelectionMode() : setSelectionMode(true)}
              title={selectionMode ? 'Exit selection mode' : 'Select messages to branch'}
              type="button"
            >
              {selectionMode ? '✕' : '⎇'}
            </button>
          )}

          <button
            className="settings-btn"
            onClick={() => setShowRenameModal(true)}
            title={`Your name: ${isAuthenticated ? authUsername : (getUsername() || 'Not set')}`}
          >
            ⚙
          </button>

          <div className="room-code-badge">
            <span className="room-code-label">Room</span>
            <span className="room-code-value">{room.code}</span>
            <button className="copy-btn" onClick={handleCopyCode} title="Copy room code">
              {copied ? '✓' : '⎘'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Founding context (branch rooms only) — collapsible ── */}
      {room.foundingContext && room.foundingContext.length > 0 && (
        <div className={`chat-founding-context${foundingCollapsed ? ' collapsed' : ''}`}>
          <button
            className="chat-founding-toggle"
            type="button"
            onClick={() => setFoundingCollapsed(c => !c)}
          >
            <span className="chat-founding-label">⎇ Branched from this exchange</span>
            <span className="chat-founding-chevron">{foundingCollapsed ? '▸' : '▾'}</span>
          </button>
          {!foundingCollapsed && (
            <>
              {room.foundingContext.map((msg, i) => (
                <div key={i} className="chat-founding-msg">
                  {(msg.sender_type === 'character' || msg.type === 'character') ? (
                    <div
                      className="chat-founding-avatar"
                      style={{ background: msg.sender_color || msg.characterColor || '#4f7cff' }}
                    >
                      {msg.sender_initial || msg.characterInitial || '?'}
                    </div>
                  ) : (
                    <div className="chat-founding-avatar chat-founding-avatar-user">Y</div>
                  )}
                  <div className="chat-founding-content">
                    <span className="chat-founding-name">{msg.sender_name || msg.characterName || 'User'}</span>
                    <span className="chat-founding-text">{msg.content.slice(0, 150)}{msg.content.length > 150 ? '…' : ''}</span>
                  </div>
                </div>
              ))}
              <div className="chat-founding-divider">↓ New conversation begins here</div>
            </>
          )}
        </div>
      )}

      {/* ── Messages ── */}
      <div className="chat-messages">
        {isLoading ? (
          <div className="chat-loading">
            <div className="loading-spinner" style={{ width: 28, height: 28 }} />
          </div>
        ) : isEmpty ? (
          <div className="chat-empty">
            <div className="chat-empty-avatars">
              {room.characters.slice(0, 4).map((char, i) => (
                <div
                  key={char.id}
                  className="chat-empty-avatar"
                  style={{ background: char.color, zIndex: room.characters.length - i }}
                >
                  {char.initial}
                </div>
              ))}
            </div>
            <h3>The room is ready</h3>
            <p>
              {room.characters.map(c => c.name).join(', ')}{' '}
              {room.characters.length === 1 ? 'is' : 'are'} here and ready to{' '}
              {room.mode.id === 'chat' ? 'chat' :
               room.mode.id === 'discuss' ? 'debate' :
               room.mode.id === 'plan' ? 'plan with you' : 'advise you'}.
              <br />Say something to get the conversation started.
              {room.characters.length > 1 && (
                <><br /><span className="chat-empty-address-hint">
                  Tip: Start with a name like "<em>{room.characters[0].name},</em>" to address someone directly.
                </span></>
              )}
            </p>
            {isSupabaseConfigured && (
              <div className="chat-sync-badge">🔄 Live sync · share the room code for others to join</div>
            )}
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isSelected = selectionMode &&
              selectionRange.start !== null &&
              idx >= selectionRange.start && idx <= (selectionRange.end ?? selectionRange.start)

            return (
              <MessageBubble
                key={msg.id || idx}
                message={msg}
                messageIndex={idx}
                isSelected={isSelected}
                inSelectionMode={selectionMode}
                onTapInSelectionMode={() => handleMessageTap(idx)}
                onEnterSelectionMode={() => enterSelectionMode(idx)}
                onHandleMove={handleHandleMove}
                showBranchHints={selectionMode}
                isFirstSelected={selectionMode && idx === selectionRange.start}
                isLastSelected={selectionMode && idx === selectionRange.end}
                msgRef={el => { msgRefs.current[idx] = el }}
              />
            )
          })
        )}

        {/* Typing indicator — Weaver routing decisions are intentionally hidden */}
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

      {/* ── Input — hidden for read-only rooms ── */}
      {isReadOnly ? (
        <div className="chat-readonly-bar">
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
                    foundingMessages:   messages.slice(-5), // last 5 messages as context
                  })
                }
              }}
            >
              ⎇ Branch this room
            </button>
          )}
        </div>
      ) : (
        <div className="chat-input-area">
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
            {isSupabaseConfigured && <span className="chat-input-hint-sync"> · Live sync on</span>}
          </div>
        </div>
      )}

      {showRenameModal && (
        <UsernameModal onSave={handleRenameSave} isRename={true} />
      )}
    </div>
  )
}
