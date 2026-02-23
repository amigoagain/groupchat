import { useState, useRef, useEffect, useCallback } from 'react'
import MessageBubble from './MessageBubble.jsx'
import TypingIndicator from './TypingIndicator.jsx'
import UsernameModal from './UsernameModal.jsx'
import { getCharacterResponse, generateInviteMessage } from '../services/claudeApi.js'
import { updateRoomMessages, fetchRoomMessages, saveRoom } from '../utils/roomUtils.js'
import { isSupabaseConfigured } from '../lib/supabase.js'
import { getUsername, setUsername } from '../utils/username.js'

const POLL_INTERVAL_MS = 3000

export default function ChatInterface({ room, onUpdateRoom, onBack }) {
  const [messages, setMessages] = useState(room.messages || [])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [typingCharacter, setTypingCharacter] = useState(null)
  const [copied, setCopied] = useState(false)
  const [shareState, setShareState] = useState('idle') // 'idle' | 'generating' | 'copied' | 'shared'
  const [showRenameModal, setShowRenameModal] = useState(false)

  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  // Refs used inside intervals/async callbacks to avoid stale closures
  const isLoadingRef = useRef(false)
  const messagesRef = useRef(messages)

  useEffect(() => { isLoadingRef.current = isLoading }, [isLoading])
  useEffect(() => { messagesRef.current = messages }, [messages])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typingCharacter])

  // ── Supabase polling (every 3 s) ────────────────────────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) return

    const poll = async () => {
      if (isLoadingRef.current) return
      const remoteMessages = await fetchRoomMessages(room.code)
      if (!remoteMessages) return
      setMessages(prev => {
        if (remoteMessages.length > prev.length) return remoteMessages
        return prev
      })
    }

    const id = setInterval(poll, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [room.code])

  // ── Send message ────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    const userMessage = {
      id: `user_${Date.now()}`,
      type: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }

    const conversationSnapshot = [...messagesRef.current]
    const newMessages = [userMessage]

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    const precedingResponses = []

    for (const character of room.characters) {
      setTypingCharacter(character)

      try {
        const responseText = await getCharacterResponse(
          character,
          room.mode,
          room.characters,
          conversationSnapshot,
          text,
          precedingResponses
        )

        const charMsg = {
          id: `char_${character.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          type: 'character',
          characterId: character.id,
          characterName: character.name,
          characterColor: character.color,
          characterInitial: character.initial,
          content: responseText,
          timestamp: new Date().toISOString(),
        }

        precedingResponses.push({ characterName: character.name, content: responseText })
        newMessages.push(charMsg)
        setMessages(prev => [...prev, charMsg])

        // Push each character's response to Supabase progressively
        updateRoomMessages(room.code, [...conversationSnapshot, ...newMessages])
          .catch(err => console.warn('Background Supabase update failed:', err))

      } catch (err) {
        console.error(`Error getting response from ${character.name}:`, err)

        const errMsg = {
          id: `err_${character.id}_${Date.now()}`,
          type: 'character',
          characterId: character.id,
          characterName: character.name,
          characterColor: character.color,
          characterInitial: character.initial,
          content: `[${character.name} couldn't respond: ${err.message || 'Unknown error'}.]`,
          isError: true,
          timestamp: new Date().toISOString(),
        }

        newMessages.push(errMsg)
        setMessages(prev => [...prev, errMsg])
      }
    }

    setTypingCharacter(null)
    setIsLoading(false)

    const finalMessages = [...conversationSnapshot, ...newMessages]
    const updatedRoom = { ...room, messages: finalMessages }
    saveRoom(room.code, updatedRoom)
    onUpdateRoom(updatedRoom)
  }, [input, isLoading, room, onUpdateRoom])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(room.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Smart share: AI invite message + native share sheet ──────────────────────
  const handleShareLink = async () => {
    if (shareState === 'generating') return

    const url = `${window.location.origin}/room/${room.code}`
    const username = getUsername() || 'Someone'

    setShareState('generating')

    try {
      const inviteText = await generateInviteMessage(username, room.characters, messagesRef.current)
      const fullMessage = `${inviteText} ${url}`

      if (navigator.share) {
        // Mobile: native share sheet
        await navigator.share({ text: fullMessage })
        setShareState('shared')
      } else {
        // Desktop: copy to clipboard
        await navigator.clipboard.writeText(fullMessage)
        setShareState('copied')
      }
      setTimeout(() => setShareState('idle'), 3000)
    } catch (err) {
      if (err.name !== 'AbortError') {
        // Generation or share failed — fall back to plain URL
        try {
          await navigator.clipboard.writeText(url)
          setShareState('copied')
          setTimeout(() => setShareState('idle'), 3000)
        } catch {
          setShareState('idle')
        }
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

  const isEmpty = messages.length === 0

  const shareLabel = {
    idle: '🔗 Share',
    generating: '✦ Writing…',
    copied: '✓ Copied!',
    shared: '✓ Shared!',
  }[shareState]

  return (
    <div className="chat-screen">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-left">
          <button className="chat-back-btn" onClick={onBack}>← Leave</button>
          <div className="chat-room-info">
            <h2>{room.mode.icon} {room.mode.name} Room</h2>
            <div className="chat-room-meta">
              {room.characters.map(c => c.name).join(' · ')}
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
            title="Share room link with an AI-generated invite"
          >
            {shareState === 'generating' && <span className="share-spinner" />}
            {shareLabel}
          </button>

          {/* Settings: rename yourself */}
          <button
            className="settings-btn"
            onClick={() => setShowRenameModal(true)}
            title={`Your name: ${getUsername() || 'Not set'} — click to change`}
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

      {/* Messages */}
      <div className="chat-messages">
        {isEmpty ? (
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
            </p>
            {isSupabaseConfigured && (
              <div className="chat-sync-badge">🔄 Live sync active — share the room code for others to join</div>
            )}
          </div>
        ) : (
          messages.map(msg => <MessageBubble key={msg.id} message={msg} />)
        )}

        {typingCharacter && <TypingIndicator character={typingCharacter} />}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-input-area">
        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            placeholder={isLoading ? 'Characters are responding…' : 'Message the group…'}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            title="Send (Enter)"
          >
            {isLoading
              ? <span style={{ fontSize: 14, display: 'inline-block', animation: 'spin 0.8s linear infinite' }}>⟳</span>
              : '→'}
          </button>
        </div>
        <div className="chat-input-hint">
          Press Enter to send · Shift+Enter for new line
          {isSupabaseConfigured && <span className="chat-input-hint-sync"> · Live sync on</span>}
        </div>
      </div>

      {/* Rename modal */}
      {showRenameModal && (
        <UsernameModal onSave={handleRenameSave} isRename={true} />
      )}
    </div>
  )
}
