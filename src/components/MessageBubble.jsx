import { useRef, useCallback } from 'react'
import { formatTime } from '../utils/roomUtils.js'

/**
 * MessageBubble — renders one chat message with long-press selection support.
 *
 * Props:
 *   message               — message object (type, content, characterName, etc.)
 *   messageIndex          — index in the messages array
 *   isSelected            — highlight when selected
 *   inSelectionMode       — true when message selection mode is active
 *   onTapInSelectionMode  — toggle this message's selection
 *   onEnterSelectionMode  — long-press (400ms) to enter selection mode on this message
 */
export default function MessageBubble({
  message,
  messageIndex,
  isSelected          = false,
  inSelectionMode     = false,
  onTapInSelectionMode,
  onEnterSelectionMode,
}) {
  const longPressTimer = useRef(null)

  // Long-press (400ms) → enter selection mode on the tapped message
  const handlePointerDown = useCallback(() => {
    if (inSelectionMode || !onEnterSelectionMode) return
    longPressTimer.current = setTimeout(() => onEnterSelectionMode(), 400)
  }, [inSelectionMode, onEnterSelectionMode])

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const sharedProps = {
    'data-msg-index': messageIndex,
  }

  // ── Context message (carried over from parent branch) ───────────────────────
  if (message.isContext) {
    return (
      <div
        {...sharedProps}
        className={`message-group message-context${message.type === 'user' ? ' message-context-user' : ' message-context-char'}`}
      >
        {message.type === 'character' && (
          <div className="message-character-header">
            <div
              className="message-character-avatar msg-ctx-avatar"
              style={{ background: message.characterColor }}
            >
              {message.characterInitial}
            </div>
            <div className="message-character-name" style={{ color: message.characterColor }}>
              {message.characterName}
            </div>
          </div>
        )}
        <div className="msg-ctx-bubble">{message.content}</div>
      </div>
    )
  }

  // ── User message ────────────────────────────────────────────────────────────
  if (message.type === 'user') {
    return (
      <div
        {...sharedProps}
        className={`message-group message-user${isSelected ? ' msg-selected' : ''}${inSelectionMode ? ' msg-selectable' : ''}`}
        onClick={inSelectionMode ? onTapInSelectionMode : undefined}
        onPointerDown={handlePointerDown}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
      >
        <div className="message-user-bubble">{message.content}</div>
        <div className="message-user-footer">
          <div className="message-user-time">{formatTime(message.timestamp)}</div>
        </div>
      </div>
    )
  }

  // ── Character message ───────────────────────────────────────────────────────
  if (message.type === 'character') {
    return (
      <div
        {...sharedProps}
        className={`message-group message-character${isSelected ? ' msg-selected' : ''}${inSelectionMode ? ' msg-selectable' : ''}`}
        onClick={inSelectionMode ? onTapInSelectionMode : undefined}
        onPointerDown={handlePointerDown}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
      >
        <div className="message-character-header">
          <div
            className="message-character-avatar"
            style={{ background: message.characterColor }}
          >
            {message.characterInitial}
          </div>
          <div
            className="message-character-name"
            style={{ color: message.characterColor }}
          >
            {message.characterName}
          </div>
          <div className="message-character-time">{formatTime(message.timestamp)}</div>
        </div>

        <div
          className={`message-character-bubble${message.isError ? ' error' : ''}`}
          style={{ '--char-color': message.characterColor }}
        >
          {message.content}
        </div>
      </div>
    )
  }

  // ── Weaver notice ───────────────────────────────────────────────────────────
  if (message.type === 'weaver') {
    return (
      <div {...sharedProps} className="message-group message-weaver">
        <div className="message-weaver-notice">{message.content}</div>
      </div>
    )
  }

  return null
}
