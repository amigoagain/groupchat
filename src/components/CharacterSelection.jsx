import { useState, useEffect, useCallback } from 'react'
import {
  loadAllCharacters,
  saveCustomCharacter,
  deleteCustomCharacter,
} from '../utils/customCharacters.js'
import { inferDomain, ALL_DOMAINS, DOMAIN_COLORS } from '../utils/domainUtils.js'
import CreateCharacterModal from './CreateCharacterModal.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

// Full visibility spectrum — read-only available to authenticated users
// moderated-public and open are visible but inactive (coming soon)
const VISIBILITY_OPTS = [
  { value: 'private',          icon: '🔒', label: 'Private',          desc: 'Only you via room code' },
  { value: 'unlisted',         icon: '🔓', label: 'Unlisted',         desc: 'Anyone with the code' },
  { value: 'read-only',        icon: '📖', label: 'Read-only public', desc: 'Listed; no replies', requiresAuth: true },
  { value: 'moderated-public', icon: '🛡', label: 'Moderated',       desc: 'Coming soon', disabled: true },
  { value: 'open',             icon: '🌐', label: 'Open',             desc: 'Coming soon', disabled: true },
]

const MIN_CHARS = 1
const MAX_CHARS = 6

// ─── Character detail drawer ──────────────────────────────────────────────────

function CharacterDetailDrawer({ char, isSelected, isMaxed, onToggle, onClose, onEdit }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const domain = inferDomain(char)
  const dc = DOMAIN_COLORS[domain] || DOMAIN_COLORS.Other
  const canAdd = !isSelected && !isMaxed

  return (
    <div className="char-drawer-backdrop" onClick={onClose}>
      <div className="char-drawer" onClick={e => e.stopPropagation()}>
        <div className="char-drawer-handle" />

        <div className="char-drawer-header">
          <div className="char-drawer-avatar" style={{ background: char.color }}>
            {char.initial}
          </div>
          <div className="char-drawer-identity">
            <h2 className="char-drawer-name">{char.name}</h2>
            <div className="char-drawer-title-text">{char.title}</div>
            <div className="char-drawer-badges">
              {char.isCanonical && <span className="char-badge char-badge-canonical">🔵 Canonical</span>}
              {char.isVariant   && <span className="char-badge char-badge-variant">🟣 Variant</span>}
              {char.isExpert    && <span className="char-badge char-badge-expert">🟢 Expert</span>}
              <span
                className="char-domain-tag"
                style={{ background: `${dc}18`, color: dc, borderColor: `${dc}40` }}
              >
                {domain}
              </span>
            </div>
          </div>
          <button className="char-drawer-close" onClick={onClose}>×</button>
        </div>

        <div className="char-drawer-body">
          {char.description && (
            <p className="char-drawer-description">{char.description}</p>
          )}
          {char.personalityText && (
            <div className="char-drawer-personality">
              <div className="char-drawer-section-label">Personality</div>
              <p>{char.personalityText}</p>
            </div>
          )}
        </div>

        <div className="char-drawer-footer">
          {char.isCustom && onEdit && (
            <button
              className="char-drawer-edit-btn"
              onClick={() => { onEdit(char); onClose() }}
            >
              ✎ Edit
            </button>
          )}
          <button
            className={`char-drawer-select-btn ${isSelected ? 'remove' : 'add'}`}
            onClick={() => { if (canAdd || isSelected) { onToggle(char); onClose() } }}
            disabled={!canAdd && !isSelected}
            title={isMaxed && !isSelected ? `Maximum ${MAX_CHARS} characters selected` : undefined}
          >
            {isSelected ? '✕ Remove from Room' : '+ Add to Room'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Character list row ───────────────────────────────────────────────────────

function CharacterRow({ char, isSelected, isMaxed, onToggle, onShowDetail }) {
  const domain = inferDomain(char)
  const dc = DOMAIN_COLORS[domain] || DOMAIN_COLORS.Other

  return (
    <div className={`char-row${isSelected ? ' selected' : ''}${isMaxed ? ' maxed' : ''}`}>
      <button
        className="char-row-main"
        onClick={() => (!isMaxed || isSelected) && onToggle(char)}
        title={isMaxed && !isSelected ? `Maximum ${MAX_CHARS} characters` : undefined}
      >
        <div className="char-row-avatar" style={{ background: char.color }}>
          {char.initial}
        </div>
        <div className="char-row-info">
          <div className="char-row-name">{char.name}</div>
          <div className="char-row-subtitle">{char.title}</div>
          <div className="char-row-meta">
            {char.isCanonical && <span className="char-badge char-badge-canonical" style={{ fontSize: 8, padding: '1px 4px' }}>🔵</span>}
            {char.isVariant   && <span className="char-badge char-badge-variant"   style={{ fontSize: 8, padding: '1px 4px' }}>🟣</span>}
            {char.isExpert    && <span className="char-badge char-badge-expert"    style={{ fontSize: 8, padding: '1px 4px' }}>🟢</span>}
            <span
              className="char-domain-tag"
              style={{ background: `${dc}18`, color: dc, borderColor: `${dc}35` }}
            >
              {domain}
            </span>
          </div>
        </div>
        <div className="char-row-select-indicator">
          {isSelected && <span className="char-row-check">✓</span>}
        </div>
      </button>
      <button
        className="char-row-detail-btn"
        onClick={() => onShowDetail(char)}
        title="View character details"
        tabIndex={-1}
      >
        ›
      </button>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CharacterSelection({ onStartChat, onBack, selectedMode, branchContext, onSignIn }) {
  const { isAuthenticated } = useAuth()

  const [selected, setSelected]           = useState([])
  const [search, setSearch]               = useState('')
  const [tierFilter, setTierFilter]       = useState('all')
  const [domainFilter, setDomainFilter]   = useState('all')
  const [allCharacters, setAllCharacters] = useState([])
  const [charsLoading, setCharsLoading]   = useState(true)
  const [detailChar, setDetailChar]       = useState(null)
  const [createModal, setCreateModal]     = useState(null)
  const [visibility, setVisibility]       = useState('private')
  const [showVisibility, setShowVisibility] = useState(false)

  useEffect(() => {
    loadAllCharacters()
      .then(chars => setAllCharacters(chars))
      .catch(() => setAllCharacters([]))
      .finally(() => setCharsLoading(false))
  }, [])

  // ── Filtering ──────────────────────────────────────────────────────────────
  const tierFiltered = allCharacters.filter(c => {
    if (tierFilter === 'canonical') return c.isCanonical
    if (tierFilter === 'variants')  return c.isVariant
    if (tierFilter === 'experts')   return c.isExpert
    if (tierFilter === 'custom')    return c.isCustom
    return true
  })

  const domainFiltered = domainFilter === 'all'
    ? tierFiltered
    : tierFiltered.filter(c => inferDomain(c) === domainFilter)

  const filtered = !search
    ? domainFiltered
    : domainFiltered.filter(c => {
        const q = search.toLowerCase()
        return c.name.toLowerCase().includes(q) ||
               c.title.toLowerCase().includes(q) ||
               (c.description || '').toLowerCase().includes(q)
      })

  // Domain chips: only domains present in current tier slice, sorted canonically
  const presentDomains = [...new Set(tierFiltered.map(c => inferDomain(c)))]
    .filter(d => ALL_DOMAINS.includes(d))
    .sort((a, b) => ALL_DOMAINS.indexOf(a) - ALL_DOMAINS.indexOf(b))

  // ── Actions ────────────────────────────────────────────────────────────────
  const toggleCharacter = (char) => {
    setSelected(prev => {
      const already = prev.some(c => c.id === char.id)
      if (already) return prev.filter(c => c.id !== char.id)
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
    } catch (err) { console.error('Failed to save character:', err) }
    setCreateModal(null)
  }, [])

  const handleDeleteCharacter = useCallback(async (id) => {
    try {
      await deleteCustomCharacter(id)
      const updated = await loadAllCharacters()
      setAllCharacters(updated)
      setSelected(prev => prev.filter(c => c.id !== id))
    } catch (err) { console.error('Failed to delete character:', err) }
    setCreateModal(null)
  }, [])

  const counts = {
    all:       allCharacters.length,
    canonical: allCharacters.filter(c => c.isCanonical).length,
    variants:  allCharacters.filter(c => c.isVariant).length,
    experts:   allCharacters.filter(c => c.isExpert).length,
    custom:    allCharacters.filter(c => c.isCustom).length,
  }

  const TIER_TABS = [
    { key: 'all',       label: 'All',          count: counts.all },
    { key: 'canonical', label: '🔵 Canonical',  count: counts.canonical },
    { key: 'variants',  label: '🟣 Variants',   count: counts.variants },
    ...(counts.experts > 0 ? [{ key: 'experts', label: '🟢 Experts', count: counts.experts }] : []),
    ...(counts.custom > 0  ? [{ key: 'custom',  label: '✎ Custom',  count: counts.custom  }] : []),
  ]

  const canStart = selected.length >= MIN_CHARS

  return (
    <div className="char-screen-v2">

      {/* ── Sticky top: nav + selected bar ── */}
      <div className="char-v2-sticky-top">
        <div className="char-v2-nav">
          <button className="screen-back-btn" onClick={onBack}>← Back</button>
          <span className="char-v2-mode-label">{selectedMode?.name} Room</span>
        </div>

        <div className="char-v2-selected-bar">
          <div className="char-v2-chips">
            {selected.length === 0 ? (
              <span className="char-v2-empty-hint">Pick 1–{MAX_CHARS} characters</span>
            ) : (
              selected.map(char => (
                <button
                  key={char.id}
                  className="char-selected-chip"
                  onClick={() => toggleCharacter(char)}
                  style={{ '--chip-color': char.color }}
                  title={`Remove ${char.name}`}
                >
                  <span className="chip-avatar" style={{ background: char.color }}>{char.initial}</span>
                  <span className="chip-name">{char.name.split(' ')[0]}</span>
                  <span className="chip-x">×</span>
                </button>
              ))
            )}
          </div>
          <div className="char-start-row">
            {/* Visibility selector */}
            <div className="vis-selector-wrap">
              <button
                className="vis-selector-btn"
                type="button"
                onClick={() => setShowVisibility(v => !v)}
                title="Room visibility"
              >
                {VISIBILITY_OPTS.find(o => o.value === visibility)?.icon || '🔒'}
              </button>
              {showVisibility && (
                <div className="vis-dropdown">
                  {VISIBILITY_OPTS.map(opt => {
                    const needsAuth = opt.requiresAuth && !isAuthenticated
                    const disabled  = opt.disabled || false
                    return (
                      <button
                        key={opt.value}
                        className={`vis-opt${visibility === opt.value ? ' active' : ''}${disabled ? ' disabled' : ''}`}
                        type="button"
                        onClick={() => {
                          if (disabled) return
                          if (needsAuth) { onSignIn?.('Creating a read-only public room requires an account.'); return }
                          setVisibility(opt.value)
                          setShowVisibility(false)
                        }}
                        title={needsAuth ? 'Sign in required' : opt.desc}
                      >
                        <span className="vis-opt-icon">{opt.icon}</span>
                        <span className="vis-opt-text">
                          <span className="vis-opt-label">{opt.label}</span>
                          <span className="vis-opt-desc">{needsAuth ? 'Sign in required' : opt.desc}</span>
                        </span>
                        {visibility === opt.value && <span className="vis-opt-check">✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <button
              className="char-start-btn"
              onClick={() => canStart && onStartChat(selected, visibility)}
              disabled={!canStart}
            >
              {branchContext
                ? (canStart ? `Branch (${selected.length})` : 'Branch')
                : (canStart ? `Start (${selected.length})` : 'Start Chat')}
            </button>
          </div>
        </div>
        {/* Branch context banner */}
        {branchContext && (
          <div className="branch-context-banner">
            ⎇ Branching from <strong>{branchContext.parentRoomId}</strong>
            {branchContext.branchedAt?.contentSnippet && (
              <span className="branch-context-snippet"> · "{branchContext.branchedAt.contentSnippet}"</span>
            )}
          </div>
        )}
      </div>

      {/* ── Search ── */}
      <div className="char-v2-search-row">
        <input
          className="character-search"
          type="text"
          placeholder="Search by name, title, or description…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* ── Tier filter chips ── */}
      {counts.canonical > 0 && (
        <div className="char-filter-tabs">
          {TIER_TABS.map(tab => (
            <button
              key={tab.key}
              className={`char-filter-tab${tierFilter === tab.key ? ' active' : ''}`}
              onClick={() => { setTierFilter(tab.key); setDomainFilter('all') }}
            >
              {tab.label}
              <span className="char-filter-count">{tab.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Domain filter chips ── */}
      {presentDomains.length > 1 && (
        <div className="char-domain-chips-row">
          <button
            className={`char-domain-chip${domainFilter === 'all' ? ' active' : ''}`}
            onClick={() => setDomainFilter('all')}
          >
            All
          </button>
          {presentDomains.map(domain => {
            const dc = DOMAIN_COLORS[domain] || '#4d5f80'
            const isActive = domainFilter === domain
            return (
              <button
                key={domain}
                className={`char-domain-chip${isActive ? ' active' : ''}`}
                onClick={() => setDomainFilter(d => d === domain ? 'all' : domain)}
                style={isActive ? {
                  background: `${dc}28`,
                  color: dc,
                  borderColor: `${dc}60`,
                } : {}}
              >
                {domain}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Character list ── */}
      <div className="char-v2-list">
        {charsLoading && (
          <div className="character-card-loading">
            <div className="char-loading-spinner" />
            <span>Loading character library…</span>
          </div>
        )}

        {!charsLoading && filtered.length === 0 && (
          <div className="character-no-results">
            {search ? `No characters match "${search}"` : 'No characters in this category'}
          </div>
        )}

        {filtered.map(char => {
          const isSelected = selected.some(c => c.id === char.id)
          const isMaxed    = selected.length >= MAX_CHARS && !isSelected
          return (
            <CharacterRow
              key={char.id}
              char={char}
              isSelected={isSelected}
              isMaxed={isMaxed}
              onToggle={toggleCharacter}
              onShowDetail={setDetailChar}
            />
          )
        })}

        {/* Create custom character row */}
        {(tierFilter === 'all' || tierFilter === 'custom') && !search && (
          <button
            className="char-row char-row-create"
            onClick={() => setCreateModal({ mode: 'create' })}
          >
            <div className="char-row-avatar char-row-avatar-create">+</div>
            <div className="char-row-info">
              <div className="char-row-name">Create Character</div>
              <div className="char-row-subtitle">Define a custom AI persona</div>
            </div>
            <span className="char-row-detail-btn" style={{ pointerEvents: 'none' }}>›</span>
          </button>
        )}
      </div>

      {/* ── Detail drawer ── */}
      {detailChar && (
        <CharacterDetailDrawer
          char={detailChar}
          isSelected={selected.some(c => c.id === detailChar.id)}
          isMaxed={selected.length >= MAX_CHARS && !selected.some(c => c.id === detailChar.id)}
          onToggle={toggleCharacter}
          onClose={() => setDetailChar(null)}
          onEdit={detailChar.isCustom ? (char) => { setDetailChar(null); setCreateModal({ mode: 'edit', character: char }) } : null}
        />
      )}

      {/* ── Create / edit modal ── */}
      {createModal && (
        <CreateCharacterModal
          character={createModal.character || null}
          onSave={handleSaveCharacter}
          onDelete={handleDeleteCharacter}
          onClose={() => setCreateModal(null)}
        />
      )}
    </div>
  )
}
