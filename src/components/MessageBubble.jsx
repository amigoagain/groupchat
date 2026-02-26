import { useRef, useCallback } from 'react'
import { formatTime } from '../utils/roomUtils.js'

/**
 * MessageBubble — renders one chat message with selection/branch support.
 *
 * Props:
 *   message               — message object (type, content, characterName, etc.)
 *   messageIndex          — index in the messages array
 *   isSelected            — highlight when in selection range
 *   inSelectionMode       — true when branch-selection mode is active
 *   onTapInSelectionMode  — extend/contract selection by tapping
 *   onEnterSelectionMode  — long-press or ⎇ click to enter selection mode
 *   onHandleMove(type, idx) — drag handle moved; type = 'start' | 'end'
 *   isFirstSelected       — show top drag handle
 *   isLastSelected        — show bottom drag handle
 *   msgRef                — forwarded ref (for data-msg-index hit-testing)
 */
export default function MessageBubble({
  message,
  messageIndex,
  isSelected          = false,
  inSelectionMode     = false,
  onTapInSelectionMode,
  onEnterSelectionMode,
  onHandleMove,
  isFirstSelected     = false,
  isLastSelected      = false,
  msgRef,
}) {
  const longPressTimer = useRef(null)

  // Long-press (500ms) → enter selection mode on the tapped message
  const handlePointerDown = useCallback(() => {
    if (inSelectionMode || !onEnterSelectionMode) return
    longPressTimer.current = setTimeout(() => onEnterSelectionMode(), 500)
  }, [inSelectionMode, onEnterSelectionMode])

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  // Drag-handle: attach global listeners, resolve message index from DOM
  const makeDragHandlers = useCallback((handleType) => {
    const resolveIndexFromTouch = (clientX, clientY) => {
      const el = document.elementFromPoint(clientX, clientY)
      if (!el) return null
      const msgEl = el.closest('[data-msg-index]')
      return msgEl ? parseInt(msgEl.dataset.msgIndex, 10) : null
    }

    const onMouseMove = (e) => {
      e.preventDefault()
      // Use closest message element under cursor
      const el = document.elementFromPoint(e.clientX, e.clientY)
      if (!el) return
      const msgEl = el.closest('[data-msg-index]')
      if (msgEl) {
        const idx = parseInt(msgEl.dataset.msgIndex, 10)
        if (!isNaN(idx)) onHandleMove?.(handleType, idx)
      }
    }

    const onTouchMove = (e) => {
      e.preventDefault()
      const touch = e.touches[0]
      const idx = resolveIndexFromTouch(touch.clientX, touch.clientY)
      if (idx !== null && !isNaN(idx)) onHandleMove?.(handleType, idx)
    }

    const stopDrag = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', stopDrag)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', stopDrag)
    }

    return {
      onMouseDown: (e) => {
        e.stopPropagation()
        e.preventDefault()
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', stopDrag)
      },
      onTouchStart: (e) => {
        e.stopPropagation()
        e.preventDefault()
        document.addEventListener('touchmove', onTouchMove, { passive: false })
        document.addEventListener('touchend', stopDrag)
      },
    }
  }, [onHandleMove])

  const sharedProps = {
    'data-msg-index': messageIndex,
    ref:              msgRef,
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
        {isFirstSelected && (
          <div className="msg-drag-handle msg-drag-handle-top" {...makeDragHandlers('start')} />
        )}

        <div className="message-user-bubble">{message.content}</div>
        <div className="message-user-footer">
          <div className="message-user-time">{formatTime(message.timestamp)}</div>
          {!inSelectionMode && onEnterSelectionMode && (
            <button
              className="message-branch-btn"
              type="button"
              title="Select to branch"
              onClick={(e) => { e.stopPropagation(); onEnterSelectionMode() }}
            >⎇</button>
          )}
        </div>

        {isLastSelected && (
          <div className="msg-drag-handle msg-drag-handle-bottom" {...makeDragHandlers('end')} />
        )}
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
        {isFirstSelected && (
          <div className="msg-drag-handle msg-drag-handle-top" {...makeDragHandlers('start')} />
        )}

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
          {!inSelectionMode && onEnterSelectionMode && (
            <button
              className="message-branch-btn"
              type="button"
              title="Select to branch"
              onClick={(e) => { e.stopPropagation(); onEnterSelectionMode() }}
            >⎇</button>
          )}
        </div>

        <div
          className={`message-character-bubble${message.isError ? ' error' : ''}`}
          style={{ '--char-color': message.characterColor }}
        >
          {message.content}
        </div>

        {isLastSelected && (
          <div className="msg-drag-handle msg-drag-handle-bottom" {...makeDragHandlers('end')} />
        )}
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
