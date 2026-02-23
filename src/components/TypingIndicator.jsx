export default function TypingIndicator({ character }) {
  if (!character) return null

  return (
    <div className="typing-indicator">
      <div
        className="typing-avatar"
        style={{ background: character.color }}
      >
        {character.initial}
      </div>
      <div className="typing-info">
        <div className="typing-name" style={{ color: character.color }}>
          {character.name}
        </div>
        <div className="typing-dots">
          <div className="typing-dot" style={{ background: character.color }} />
          <div className="typing-dot" style={{ background: character.color }} />
          <div className="typing-dot" style={{ background: character.color }} />
        </div>
      </div>
    </div>
  )
}
