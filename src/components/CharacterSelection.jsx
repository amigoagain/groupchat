import { useState, useCallback } from 'react'
import { characters as builtInCharacters } from '../data/characters.js'
import {
  loadCustomCharacters,
  saveCustomCharacter,
  deleteCustomCharacter,
} from '../utils/customCharacters.js'
import CreateCharacterModal from './CreateCharacterModal.jsx'

const MIN_CHARS = 2
const MAX_CHARS = 6

export default function CharacterSelection({ onStartChat, onBack, selectedMode }) {
  const [selected, setSelected] = useState([])
  const [search, setSearch] = useState('')
  const [customCharacters, setCustomCharacters] = useState(() => loadCustomCharacters())
  const [modalState, setModalState] = useState(null) // null | { mode: 'create' | 'edit', character?: object }

  const allCharacters = [...builtInCharacters, ...customCharacters]

  const filtered = allCharacters.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    (c.description || '').toLowerCase().includes(search.toLowerCase())
  )

  const toggleCharacter = (char) => {
    setSelected(prev => {
      const isSelected = prev.some(c => c.id === char.id)
      if (isSelected) return prev.filter(c => c.id !== char.id)
      if (prev.length >= MAX_CHARS) return prev
      return [...prev, char]
    })
  }

  const handleSaveCharacter = useCallback((char) => {
    const updated = saveCustomCharacter(char)
    setCustomCharacters(updated)

    // If we just edited a character that's currently selected, update it in place
    setSelected(prev => prev.map(c => c.id === char.id ? char : c))

    setModalState(null)
  }, [])

  const handleDeleteCharacter = useCallback((id) => {
    const updated = deleteCustomCharacter(id)
    setCustomCharacters(updated)
    // Remove from selection if it was selected
    setSelected(prev => prev.filter(c => c.id !== id))
    setModalState(null)
  }, [])

  const openCreate = (e) => {
    e.stopPropagation()
    setModalState({ mode: 'create' })
  }

  const openEdit = (e, char) => {
    e.stopPropagation() // Don't toggle selection
    setModalState({ mode: 'edit', character: char })
  }

  const canStart = selected.length >= MIN_CHARS

  return (
    <div className="characters-screen">
      <div className="screen-header">
        <button className="screen-back-btn" onClick={onBack}>
          ← Back
        </button>
        <h1 className="screen-title">Choose Your Characters</h1>
        <p className="screen-subtitle">
          Select {MIN_CHARS}–{MAX_CHARS} characters for your {selectedMode?.name} session
        </p>
      </div>

      <div className="characters-controls">
        <input
          className="character-search"
          type="text"
          placeholder="Search characters..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="selection-count">
          <span>{selected.length}</span> / {MAX_CHARS} selected
        </div>
      </div>

      <div className="character-grid">
        {/* Built-in & custom character cards */}
        {filtered.length === 0 && (
          <div className="character-no-results">No characters match "{search}"</div>
        )}

        {filtered.map(char => {
          const isSelected = selected.some(c => c.id === char.id)
          const isMaxed = selected.length >= MAX_CHARS && !isSelected
          return (
            <button
              key={char.id}
              className={`character-card ${isSelected ? 'selected' : ''} ${char.isCustom ? 'character-card-custom' : ''}`}
              style={{ '--char-color': char.color, opacity: isMaxed ? 0.45 : 1 }}
              onClick={() => !isMaxed && toggleCharacter(char)}
              title={isMaxed ? `Maximum ${MAX_CHARS} characters` : undefined}
            >
              <div className="character-card-avatar" style={{ background: char.color }}>
                {char.initial}
              </div>
              <div className="character-card-name">{char.name}</div>
              <div className="character-card-title">{char.title}</div>
              <div className="character-card-description">{char.description}</div>
              <div className="character-card-check">✓</div>

              {/* Edit / delete buttons — custom chars only */}
              {char.isCustom && (
                <div className="character-card-actions">
                  <button
                    className="char-action-btn char-edit-btn"
                    onClick={e => openEdit(e, char)}
                    title="Edit character"
                  >
                    ✎
                  </button>
                </div>
              )}
            </button>
          )
        })}

        {/* "Create Character" card — hidden when search filters it out */}
        {!'create character'.includes(search.toLowerCase()) && search !== '' ? null : (
          <button className="character-card character-card-create" onClick={openCreate}>
            <div className="create-card-icon">+</div>
            <div className="character-card-name">Create Character</div>
            <div className="character-card-title">Custom AI persona</div>
            <div className="character-card-description">
              Define your own character with a unique personality and accent color.
            </div>
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="characters-footer">
        <div className="selected-preview">
          {selected.map(char => (
            <div
              key={char.id}
              className="selected-preview-avatar"
              style={{ background: char.color }}
              title={char.name}
            >
              {char.initial}
            </div>
          ))}
          {selected.length === 0 && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              No characters selected yet
            </span>
          )}
        </div>

        <button
          className="start-chat-btn"
          onClick={() => onStartChat(selected)}
          disabled={!canStart}
        >
          {canStart
            ? `Start Chat with ${selected.length} Character${selected.length > 1 ? 's' : ''}`
            : `Select at least ${MIN_CHARS} characters`}
        </button>
      </div>

      {/* Modal */}
      {modalState && (
        <CreateCharacterModal
          character={modalState.character || null}
          onSave={handleSaveCharacter}
          onDelete={handleDeleteCharacter}
          onClose={() => setModalState(null)}
        />
      )}
    </div>
  )
}
