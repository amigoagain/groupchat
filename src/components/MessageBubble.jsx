import { formatTime } from '../utils/roomUtils.js'

/**
 * @param {object} message
 * @param {function|null} onBranch  — if provided, shows ⎇ branch button on the message.
 *                                    Called with (message, messageIndex).
 * @param {number} messageIndex     — index in messages array (for branch metadata)
 */
export default function MessageBubble({ message, onBranch, messageIndex }) {
  if (message.type === 'user') {
    return (
      <div className="message-group message-user">
        <div className="message-user-bubble">{message.content}</div>
        <div className="message-user-footer">
          <div className="message-user-time">{formatTime(message.timestamp)}</div>
          {onBranch && (
            <button
              className="message-branch-btn"
              onClick={() => onBranch(message, messageIndex)}
              title="Branch from this message"
              type="button"
            >
              ⎇
            </button>
          )}
        </div>
      </div>
    )
  }

  if (message.type === 'character') {
    return (
      <div className="message-group message-character">
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
          {onBranch && (
            <button
              className="message-branch-btn"
              onClick={() => onBranch(message, messageIndex)}
              title="Branch from this message"
              type="button"
            >
              ⎇
            </button>
          )}
        </div>
        <div
          className={`message-character-bubble ${message.isError ? 'error' : ''}`}
          style={{ '--char-color': message.characterColor }}
        >
          {message.content}
        </div>
      </div>
    )
  }

  return null
}
