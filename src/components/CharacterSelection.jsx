import { useState, useEffect, useCallback } from 'react'
import {
  loadAllCharacters,
  saveCustomCharacter,
  deleteCustomCharacter,
} from '../utils/customCharacters.js'
import CreateCharacterModal from './CreateCharacterModal.jsx'

const MIN_CHARS = 1
const MAX_CHARS = 6

export default function CharacterSelection({ onStartChat, onBack, selectedMode }) {
  const [selected, setSelected] = useState([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'canonical' | 'variants' | 'experts' | 'custom'
  const [allCharacters, setAllCharacters] = useState([])
  const [charsLoading, setCharsLoading] = useState(true)
  const [modalState, setModalState] = useState(null)

  useEffect(() => {
    loadAllCharacters()
      .then(chars => setAllCharacters(chars))
      .catch(() => setAllCharacters([]))
      .finally(() => setCharsLoading(false))
  }, [])

  const baseFiltered = allCharacters.filter(c => {
    if (filter === 'canonical') return c.isCanonical
    if (filter === 'variants')  return c.isVariant
    if (filter === 'experts')   return c.isExpert
    if (filter === 'custom')    return c.isCustom
    return true
  })

  const filtered = baseFiltered.filter(c =>
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

  const handleSaveCharacter = useCallback(async (char) => {
    try {
      await saveCustomCharacter(char)
      const updated = await loadAllCharacters()
      setAllCharacters(updated)
      setSelected(prev => prev.map(c => c.id === char.id ? char : c))
    } catch (err) {
      console.error('Failed to save character:', err)
    }
    setModalState(null)
  }, [])

  const handleDeleteCharacter = useCallback(async (id) => {
    try {
      await deleteCustomCharacter(id)
      const updated = await loadAllCharacters()
      setAllCharacters(updated)
      setSelected(prev => prev.filter(c => c.id !== id))
    } catch (err) {
      console.error('Failed to delete character:', err)
    }
    setModalState(null)
  }, [])

  const openCreate = (e) => {
    e.stopPropagation()
    setModalState({ mode: 'create' })
  }

  const openEdit = (e, char) => {
    e.stopPropagation()
    setModalState({ mode: 'edit', character: char })
  }

  const canStart = selected.length >= MIN_CHARS

  const showCreateCard = (filter === 'all' || filter === 'custom') &&
    (search === '' || 'create character'.includes(search.toLowerCase()))

  // Counts for filter tabs
  const counts = {
    all:       allCharacters.length,
    canonical: allCharacters.filter(c => c.isCanonical).length,
    variants:  allCharacters.filter(c => c.isVariant).length,
    experts:   allCharacters.filter(c => c.isExpert).length,
    custom:    allCharacters.filter(c => c.isCustom).length,
  }

  return (
    <div className="characters-screen">
      <div className="screen-header">
        <button className="screen-back-btn" onClick={onBack}>← Back</button>
        <h1 className="screen-title">Choose Your Characters</h1>
        <p className="screen-subtitle">
          Select up to {MAX_CHARS} characters for your {selectedMode?.name} session
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

      {/* Filter tabs — only show when we have seeded data */}
      {counts.canonical > 0 && (
        <div className="char-filter-tabs">
          {[
            { key: 'all',       label: 'All',       count: counts.all },
            { key: 'canonical', label: '🔵 Canonical', count: counts.canonical },
            { key: 'variants',  label: '🟣 Variants',  count: counts.variants },
            ...(counts.experts > 0 ? [{ key: 'experts', label: '🟢 Experts', count: counts.experts }] : []),
            ...(counts.custom > 0  ? [{ key: 'custom',  label: '✎ Custom',  count: counts.custom  }] : []),
          ].map(tab => (
            <button
              key={tab.key}
              className={`char-filter-tab ${filter === tab.key ? 'active' : ''}`}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
              <span className="char-filter-count">{tab.count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="character-grid">
        {filtered.length === 0 && !showCreateCard && !charsLoading && (
          <div className="character-no-results">No characters match &ldquo;{search}&rdquo;</div>
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

              {/* Badges */}
              <div className="char-badge-row">
                {char.isCanonical && (
                  <span className="char-badge char-badge-canonical">🔵 Canonical</span>
                )}
                {char.isVariant && (
                  <span className="char-badge char-badge-variant">🟣 Variant</span>
                )}
                {char.isExpert && (
                  <span className="char-badge char-badge-expert">🟢 Expert</span>
                )}
              </div>

              <div className="character-card-check">✓</div>

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

        {/* Loading skeleton */}
        {charsLoading && (
          <div className="character-card-loading">
            <div className="char-loading-spinner" />
            <span>Loading character library…</span>
          </div>
        )}

        {/* Create Character card */}
        {showCreateCard && (
          <button className="character-card character-card-create" onClick={openCreate}>
            <div className="create-card-icon">+</div>
            <div className="character-card-name">Create Character</div>
            <div className="character-card-title">Custom AI persona</div>
            <div className="character-card-description">
              Define your own character or generate one with AI.
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
            : 'Select a character to begin'}
        </button>
      </div>

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
