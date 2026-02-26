import { useState, useEffect, useCallback } from 'react'
import {
  loadAllCharacters,
} from '../utils/customCharacters.js'
import { inferDomain, DOMAIN_COLORS } from '../utils/domainUtils.js'
import { generateBranchRoomName } from '../services/claudeApi.js'

const MAX_CHARS = 6

// ── Visibility options (full spectrum visible, only 3 functional) ────────────
const VISIBILITY_OPTS = [
  { value: 'private',          label: '🔒 Private',          desc: 'Only you, via room code' },
  { value: 'unlisted',         label: '🔓 Unlisted',         desc: 'Anyone with the code' },
  { value: 'read-only',        label: '📖 Read-only public', desc: 'Listed in Browse All; no replies' },
  { value: 'moderated-public', label: '🛡 Moderated',       desc: 'Listed; posts need approval', disabled: true },
  { value: 'open',             label: '🌐 Open',             desc: 'Listed; anyone can reply', disabled: true },
]

// ── Founding context preview ──────────────────────────────────────────────────

function FoundingContextPreview({ messages }) {
  if (!messages || messages.length === 0) return null
  return (
    <div className="branch-context-preview">
      <div className="branch-context-label">
        ⎇ Founding context · {messages.length} message{messages.length !== 1 ? 's' : ''}
      </div>
      <div className="branch-context-msgs">
        {messages.map((msg, i) => (
          <div key={msg.id || i} className="branch-context-msg">
            {msg.type === 'character' || msg.sender_type === 'character' ? (
              <div
                className="branch-ctx-avatar"
                style={{ background: msg.characterColor || msg.sender_color || '#4f7cff' }}
              >
                {msg.characterInitial || msg.sender_initial || '?'}
              </div>
            ) : (
              <div className="branch-ctx-avatar branch-ctx-avatar-user">You</div>
            )}
            <div className="branch-ctx-content">
              <span className="branch-ctx-name">
                {msg.characterName || msg.senderName || msg.sender_name || 'User'}
              </span>
              <span className="branch-ctx-text">
                {msg.content.slice(0, 120)}{msg.content.length > 120 ? '…' : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Character chip (selected) ─────────────────────────────────────────────────

function CharChip({ char, onRemove }) {
  return (
    <button
      className="char-selected-chip"
      onClick={() => onRemove(char)}
      style={{ '--chip-color': char.color }}
      type="button"
      title={`Remove ${char.name}`}
    >
      <span className="chip-avatar" style={{ background: char.color }}>{char.initial}</span>
      <span className="chip-name">{char.name.split(' ')[0]}</span>
      <span className="chip-x">×</span>
    </button>
  )
}

// ── Compact character row ─────────────────────────────────────────────────────

function CharPickRow({ char, isSelected, isMaxed, onToggle }) {
  const domain = inferDomain(char)
  const dc = DOMAIN_COLORS[domain] || DOMAIN_COLORS.Other
  return (
    <button
      className={`char-row branch-char-row${isSelected ? ' selected' : ''}${isMaxed ? ' maxed' : ''}`}
      onClick={() => (!isMaxed || isSelected) && onToggle(char)}
      type="button"
    >
      <div className="char-row-avatar" style={{ background: char.color }}>{char.initial}</div>
      <div className="char-row-info">
        <div className="char-row-name">{char.name}</div>
        <div className="char-row-subtitle">{char.title}</div>
      </div>
      <span
        className="char-domain-tag"
        style={{ background: `${dc}18`, color: dc, borderColor: `${dc}35` }}
      >
        {domain}
      </span>
      {isSelected && <span className="char-row-check">✓</span>}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * BranchConfig — configure and launch a branch room.
 *
 * Props:
 *   foundingMessages    — the selected messages (already loaded from DB)
 *   parentRoomId        — UUID of the parent room
 *   branchedAtSequence  — sequence number of the last selected message
 *   branchDepth         — parent room's branch_depth + 1
 *   parentCharacters    — character objects from the parent room (for pre-population fallback)
 *   onConfirm(config)   — called with { selectedChars, roomName, visibility, branchData }
 *   onCancel            — close without branching
 */
export default function BranchConfig({
  foundingMessages = [],
  parentRoomId,
  branchedAtSequence,
  branchDepth = 0,
  parentCharacters = [],
  onConfirm,
  onCancel,
}) {
  const [allChars, setAllChars]         = useState([])
  const [selected, setSelected]         = useState([])
  const [charSearch, setCharSearch]     = useState('')
  const [roomName, setRoomName]         = useState('')
  const [nameLoading, setNameLoading]   = useState(false)
  const [visibility, setVisibility]     = useState('private')
  const [creating, setCreating]         = useState(false)

  // Pre-select ONLY the characters who authored the selected founding messages.
  // If a name isn't found in the library, build a lightweight object from the message data.
  // Does NOT fall back to all parent-room characters — the user can add more manually.
  useEffect(() => {
    loadAllCharacters().then(chars => {
      setAllChars(chars)

      // Collect unique character authors from the selected messages (in order)
      const authorMessages = []
      const seenNames = new Set()
      for (const m of foundingMessages) {
        if (m.type !== 'character' && m.sender_type !== 'character') continue
        const name = (m.characterName || m.sender_name || '').trim()
        if (!name || seenNames.has(name.toLowerCase())) continue
        seenNames.add(name.toLowerCase())
        authorMessages.push(m)
      }

      if (authorMessages.length === 0) {
        // No character messages in selection — leave empty for manual selection
        return
      }

      // Try to match each author against the character library
      const preSelected = []
      for (const m of authorMessages) {
        const name  = (m.characterName || m.sender_name || '').trim()
        const lower = name.toLowerCase()

        // Exact name match first, then partial (last-name) match
        const found = chars.find(c =>
          c.name.toLowerCase() === lower ||
          c.name.toLowerCase().endsWith(lower.split(' ').pop())
        )

        if (found) {
          preSelected.push(found)
        } else {
          // Not in library — build a lightweight char from the message data
          preSelected.push({
            id:          m.characterId || `msg-char-${name.toLowerCase().replace(/\s+/g, '-')}`,
            name,
            title:       'Character',
            initial:     name.charAt(0).toUpperCase(),
            color:       m.characterColor || '#4A5C3A',
            personality: `You are ${name}. Continue in character.`,
            tags:        [],
            isCustom:    false,
          })
        }

        if (preSelected.length >= MAX_CHARS) break
      }

      setSelected(preSelected)
    }).catch(() => setAllChars([]))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // foundingMessages is stable at mount

  // Auto-generate room name from founding context
  useEffect(() => {
    if (foundingMessages.length === 0) return
    setNameLoading(true)
    generateBranchRoomName(foundingMessages)
      .then(name => setRoomName(name))
      .catch(() => setRoomName('Branch Room'))
      .finally(() => setNameLoading(false))
  }, [foundingMessages])

  const toggleChar = useCallback((char) => {
    setSelected(prev => {
      if (prev.some(c => c.id === char.id)) return prev.filter(c => c.id !== char.id)
      if (prev.length >= MAX_CHARS) return prev
      return [...prev, char]
    })
  }, [])

  const filteredChars = charSearch
    ? allChars.filter(c =>
        c.name.toLowerCase().includes(charSearch.toLowerCase()) ||
        c.title.toLowerCase().includes(charSearch.toLowerCase())
      )
    : allChars.slice(0, 30) // show first 30 by default

  const canConfirm = selected.length >= 1 && roomName.trim().length > 0

  const handleConfirm = async () => {
    if (!canConfirm || creating) return
    setCreating(true)
    try {
      await onConfirm({
        selectedChars: selected,
        roomName: roomName.trim(),
        visibility,
        branchData: {
          parentRoomId,
          branchedAtSequence,
          branchDepth,
          foundingContext: foundingMessages.map(m => ({
            id:              m.id,
            type:            m.type,
            sender_type:     m.type,
            sender_name:     m.characterName || m.senderName || 'User',
            sender_color:    m.characterColor || null,
            sender_initial:  m.characterInitial || null,
            characterName:   m.characterName || null,
            senderName:      m.senderName || null,
            content:         m.content,
            sequence_number: m.sequenceNumber,
          })),
        },
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="branch-config-screen">
      {/* Header */}
      <div className="branch-config-header">
        <button className="screen-back-btn" onClick={onCancel} type="button">✕ Cancel</button>
        <h2 className="branch-config-title">⎇ Branch conversation</h2>
      </div>

      <div className="branch-config-body">
        {/* Founding context */}
        <FoundingContextPreview messages={foundingMessages} />

        {/* Room name */}
        <div className="branch-config-section">
          <div className="branch-config-section-label">Room name</div>
          <div className="branch-name-input-wrap">
            {nameLoading && <span className="branch-name-spinner" />}
            <input
              className="branch-name-input"
              type="text"
              value={roomName}
              onChange={e => setRoomName(e.target.value)}
              placeholder="Name this branch…"
              maxLength={80}
            />
          </div>
        </div>

        {/* Character selection */}
        <div className="branch-config-section">
          <div className="branch-config-section-label">
            Characters
            {selected.length > 0 && (
              <span className="branch-chars-count"> · {selected.length} selected</span>
            )}
          </div>

          {selected.length > 0 && (
            <div className="char-v2-chips branch-chips">
              {selected.map(c => (
                <CharChip key={c.id} char={c} onRemove={toggleChar} />
              ))}
            </div>
          )}

          <input
            className="character-search branch-char-search"
            type="text"
            placeholder="Search characters…"
            value={charSearch}
            onChange={e => setCharSearch(e.target.value)}
          />

          <div className="branch-char-list">
            {filteredChars.map(char => (
              <CharPickRow
                key={char.id}
                char={char}
                isSelected={selected.some(c => c.id === char.id)}
                isMaxed={selected.length >= MAX_CHARS && !selected.some(c => c.id === char.id)}
                onToggle={toggleChar}
              />
            ))}
          </div>
        </div>

        {/* Visibility */}
        <div className="branch-config-section">
          <div className="branch-config-section-label">Visibility</div>
          <div className="branch-visibility-list">
            {VISIBILITY_OPTS.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`branch-vis-opt${visibility === opt.value ? ' active' : ''}${opt.disabled ? ' disabled' : ''}`}
                onClick={() => !opt.disabled && setVisibility(opt.value)}
                disabled={opt.disabled}
                title={opt.disabled ? 'Coming soon' : opt.desc}
              >
                <span className="branch-vis-label">{opt.label}</span>
                <span className="branch-vis-desc">{opt.disabled ? 'Coming soon' : opt.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="branch-config-footer">
        <button
          className="branch-confirm-btn"
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm || creating}
        >
          {creating ? (
            <><span className="auth-spinner" /> Creating branch…</>
          ) : (
            `⎇ Start branch${selected.length > 0 ? ` with ${selected.length}` : ''}`
          )}
        </button>
      </div>
    </div>
  )
}
