import { formatTime } from '../utils/roomUtils.js'

export default function MessageBubble({ message }) {
  if (message.type === 'user') {
    return (
      <div className="message-group message-user">
        <div className="message-user-bubble">{message.content}</div>
        <div className="message-user-time">{formatTime(message.timestamp)}</div>
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
