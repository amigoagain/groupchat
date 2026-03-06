import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  loadAllCharacters,
} from '../utils/customCharacters.js'
import { inferDomain, DOMAIN_COLORS } from '../utils/domainUtils.js'

// ── Max characters per mode ───────────────────────────────────────────────────
const MAX_BY_MODE = { research: 3, professional: 2 }

// ── Mode config ────────────────────────────────────────────────────────────────
const MODES_CONFIG = [
  { id: 'stroll',       label: 'Stroll',   placeholder: 'What are you curious about?',       charSelect: false },
  { id: 'thinking',     label: 'Thinking', placeholder: 'What are you working through?',      charSelect: false },
  { id: 'research',     label: 'Research', placeholder: 'What are you trying to understand?', charSelect: true  },
  { id: 'professional', label: 'Work',     placeholder: 'What do you need to think through?', charSelect: true  },
]

const DOMAINS = Object.keys(DOMAIN_COLORS)

// ── Mode icon SVGs ─────────────────────────────────────────────────────────────

const ICON_PROPS = {
  width:          '18',
  height:         '20',
  viewBox:        '0 0 14 16',
  fill:           'none',
  stroke:         'currentColor',
  strokeWidth:    '1.5',
  strokeLinecap:  'round',
  strokeLinejoin: 'round',
}

function ModeIcon({ id }) {
  switch (id) {
    case 'stroll': return (
      <svg {...ICON_PROPS}>
        <circle cx="9" cy="2" r="1.5" />
        <line x1="8.5" y1="3.5"  x2="7.5" y2="8"   />
        <line x1="8"   y1="5.5"  x2="11"  y2="7.5"  />
        <line x1="8"   y1="5.5"  x2="5.5" y2="6.5"  />
        <line x1="7.5" y1="8"    x2="10"  y2="13"   />
        <line x1="7.5" y1="8"    x2="5"   y2="12"   />
      </svg>
    )
    case 'thinking': return (
      <svg {...ICON_PROPS}>
        <circle cx="6.5" cy="12" r="3" />
        <circle cx="7.5" cy="7.5" r="1.5" />
        <circle cx="9" cy="4.5" r="1" strokeWidth="1" />
        <circle cx="10.5" cy="2.5" r="0.7" fill="currentColor" stroke="none" />
      </svg>
    )
    case 'research': return (
      <svg {...ICON_PROPS}>
        <circle cx="5.5" cy="5.5" r="4.5" />
        <line x1="8.7" y1="9" x2="13" y2="14" />
      </svg>
    )
    case 'professional': return (
      <svg {...ICON_PROPS}>
        <rect x="1" y="5.5" width="12" height="8.5" rx="1.5" />
        <path d="M5 5.5 V4 Q5 2.5 7 2.5 Q9 2.5 9 4 V5.5" />
        <line x1="1" y1="9.5" x2="13" y2="9.5" />
      </svg>
    )
    default: return null
  }
}

// ── Founding context preview ──────────────────────────────────────────────────

function FoundingContextPreview({ messages }) {
  if (!messages || messages.length === 0) return null
  return (
    <div className="branch-context-preview">
      <div className="branch-context-label">
        ⎇ {messages.length} message{messages.length !== 1 ? 's' : ''} selected
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
                {msg.content.slice(0, 100)}{msg.content.length > 100 ? '…' : ''}
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

// ── Character row (step 2) ────────────────────────────────────────────────────

function BranchCharRow({ char, isSelected, isMaxed, onToggle }) {
  const domain = inferDomain(char)
  const dc     = DOMAIN_COLORS[domain] || DOMAIN_COLORS.Other
  const tier   = char.is_canonical ? 'Canonical' : 'Community'
  return (
    <button
      className={`branch-char-row2${isSelected ? ' selected' : ''}${isMaxed ? ' maxed' : ''}`}
      onClick={() => (!isMaxed || isSelected) && onToggle(char)}
      type="button"
    >
      <div className="branch-char-row2-avatar" style={{ background: char.color }}>
        {char.initial}
      </div>
      <div className="branch-char-row2-info">
        <div className="branch-char-row2-name">{char.name}</div>
        <div className="branch-char-row2-title">{char.title}</div>
      </div>
      <div className="branch-char-row2-badges">
        <span
          className="branch-char-tier-badge"
          style={{
            background:  char.is_canonical ? 'rgba(74,90,36,0.12)' : 'rgba(0,0,0,0.06)',
            color:       char.is_canonical ? '#4a5a24' : '#6b7280',
          }}
        >
          {tier}
        </span>
        <span
          className="branch-char-domain-badge"
          style={{ background: `${dc}18`, color: dc, borderColor: `${dc}35` }}
        >
          {domain}
        </span>
      </div>
      {isSelected && <span className="branch-char-row2-check">✓</span>}
    </button>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

/**
 * BranchConfig — two-step branch room configuration.
 *
 * Step 1: Four mode icons + founding context.
 *   – Stroll / Thinking: expansion textarea → create room immediately.
 *   – Research / Professional: advance to step 2 (character selection).
 *
 * Step 2: Character selection for research / professional.
 *   – All characters, search + domain filter, tier badge.
 *   – Max 3 for research, 2 for professional.
 *
 * Props:
 *   foundingMessages     — selected messages from parent room
 *   parentRoomId         — UUID of the parent room
 *   branchedAtSequence   — sequence number of the last selected message
 *   branchDepth          — parent room's branch_depth + 1
 *   isProfessionalUnlocked — whether Work mode is accessible
 *   onConfirm(config)    — called with { mode, branchText, selectedChars, branchData }
 *   onCancel             — close without branching
 */
export default function BranchConfig({
  foundingMessages = [],
  parentRoomId,
  branchedAtSequence,
  branchDepth = 0,
  isProfessionalUnlocked,
  onConfirm,
  onCancel,
}) {
  // ── Step 1 state ──────────────────────────────────────────────────────────
  const [step,         setStep]         = useState(1)
  const [activeMode,   setActiveMode]   = useState(null)   // mode icon expanded in step 1
  const [branchText,   setBranchText]   = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [labelVisible, setLabelVisible] = useState(null)

  // ── Step 2 state ──────────────────────────────────────────────────────────
  const [pendingMode,  setPendingMode]  = useState(null)   // mode advancing to step 2
  const [allChars,     setAllChars]     = useState([])
  const [selected,     setSelected]     = useState([])
  const [charSearch,   setCharSearch]   = useState('')
  const [domainFilter, setDomainFilter] = useState('All')
  const [creating,     setCreating]     = useState(false)

  const textareaRef    = useRef(null)
  const longPressTimer = useRef(null)

  // Load all characters on mount (needed for step 2)
  useEffect(() => {
    loadAllCharacters().then(setAllChars).catch(() => setAllChars([]))
  }, [])

  // Auto-focus textarea when stroll/thinking icon becomes active
  useEffect(() => {
    if (activeMode && textareaRef.current) {
      const t = setTimeout(() => textareaRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [activeMode])

  // Build the branch data payload (shared between step 1 and step 2 confirms)
  const makeBranchData = () => ({
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
  })

  // ── Icon click handler (step 1) ───────────────────────────────────────────
  const handleIconClick = (modeId) => {
    if (modeId === 'professional' && !isProfessionalUnlocked) return

    const modeConf = MODES_CONFIG.find(m => m.id === modeId)

    if (modeConf?.charSelect) {
      // Research / Professional → go to step 2
      setPendingMode(modeId)
      setSelected([])
      setStep(2)
    } else {
      // Stroll / Thinking → toggle expansion
      if (activeMode === modeId) {
        setActiveMode(null)
        setBranchText('')
      } else {
        setActiveMode(modeId)
        setBranchText('')
      }
    }
  }

  // ── Step 1 submit (stroll / thinking) ────────────────────────────────────
  const handleStep1Submit = async () => {
    if (isSubmitting || !activeMode) return
    setIsSubmitting(true)
    try {
      await onConfirm({
        mode:          activeMode,
        branchText:    branchText.trim(),
        selectedChars: [],
        branchData:    makeBranchData(),
      })
    } finally {
      setIsSubmitting(false)
      setBranchText('')
      setActiveMode(null)
    }
  }

  const handleStep1KeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleStep1Submit() }
    if (e.key === 'Escape') { setActiveMode(null); setBranchText('') }
  }

  const handleStep1TextChange = (e) => {
    setBranchText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  // Long-press for mobile label reveal
  const handleIconTouchStart = (modeId) => {
    longPressTimer.current = setTimeout(() => setLabelVisible(modeId), 400)
  }
  const handleIconTouchEnd = () => {
    clearTimeout(longPressTimer.current)
    setTimeout(() => setLabelVisible(null), 1000)
  }

  // ── Step 2 character toggle ───────────────────────────────────────────────
  const maxChars = MAX_BY_MODE[pendingMode] || 3

  const toggleChar = useCallback((char) => {
    setSelected(prev => {
      if (prev.some(c => c.id === char.id)) return prev.filter(c => c.id !== char.id)
      if (prev.length >= maxChars) return prev
      return [...prev, char]
    })
  }, [maxChars])

  // ── Step 2 submit (research / professional) ───────────────────────────────
  const handleStep2Confirm = async () => {
    if (creating || selected.length === 0) return
    setCreating(true)
    try {
      await onConfirm({
        mode:          pendingMode,
        branchText:    '',
        selectedChars: selected,
        branchData:    makeBranchData(),
      })
    } finally {
      setCreating(false)
    }
  }

  // ── Filtered character list ───────────────────────────────────────────────
  const filteredChars = useMemo(() => {
    let list = allChars
    if (charSearch.trim()) {
      const q = charSearch.toLowerCase()
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q)
      )
    }
    if (domainFilter !== 'All') {
      list = list.filter(c => inferDomain(c) === domainFilter)
    }
    return list
  }, [allChars, charSearch, domainFilter])

  // ─────────────────────────────────────────────────────────────────────────
  // ── RENDER ───────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────

  // ── Step 2: Character selection ──────────────────────────────────────────
  if (step === 2) {
    const modeConf = MODES_CONFIG.find(m => m.id === pendingMode)
    return (
      <div className="branch-config-screen">
        {/* Header */}
        <div className="branch-config-header">
          <button
            className="screen-back-btn"
            onClick={() => { setStep(1); setActiveMode(null) }}
            type="button"
          >
            ← Back
          </button>
          <span className="branch-mode-label-header">
            {modeConf?.label} branch
          </span>
          <button className="screen-back-btn branch-cancel-btn" onClick={onCancel} type="button">
            ✕
          </button>
        </div>

        <div className="branch-config-body">
          {/* Founding context compact */}
          <FoundingContextPreview messages={foundingMessages} />

          {/* Selected chips */}
          {selected.length > 0 && (
            <div className="char-v2-chips branch-chips">
              {selected.map(c => (
                <CharChip key={c.id} char={c} onRemove={toggleChar} />
              ))}
            </div>
          )}

          {/* Limit hint */}
          <div className="branch-char-limit-hint">
            {selected.length < maxChars
              ? `Select up to ${maxChars} character${maxChars !== 1 ? 's' : ''}`
              : `${maxChars} selected — remove one to swap`}
          </div>

          {/* Search */}
          <input
            className="branch-char-search2"
            type="text"
            placeholder="Search characters…"
            value={charSearch}
            onChange={e => setCharSearch(e.target.value)}
          />

          {/* Domain filter chips */}
          <div className="branch-domain-filters">
            {['All', ...DOMAINS].map(d => (
              <button
                key={d}
                type="button"
                className={`branch-domain-chip${domainFilter === d ? ' active' : ''}`}
                onClick={() => setDomainFilter(d)}
                style={domainFilter === d && d !== 'All' ? {
                  background:  `${DOMAIN_COLORS[d]}20`,
                  color:       DOMAIN_COLORS[d],
                  borderColor: `${DOMAIN_COLORS[d]}50`,
                } : {}}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Character list */}
          <div className="branch-char-list2">
            {filteredChars.length === 0 ? (
              <div className="branch-char-empty">No characters found</div>
            ) : (
              filteredChars.map(char => (
                <BranchCharRow
                  key={char.id}
                  char={char}
                  isSelected={selected.some(c => c.id === char.id)}
                  isMaxed={selected.length >= maxChars && !selected.some(c => c.id === char.id)}
                  onToggle={toggleChar}
                />
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="branch-config-footer">
          <button
            className="branch-confirm-btn"
            type="button"
            onClick={handleStep2Confirm}
            disabled={selected.length === 0 || creating}
          >
            {creating ? (
              <><span className="auth-spinner" /> Creating…</>
            ) : (
              `⎇ Start branch${selected.length > 0 ? ` with ${selected.length}` : ''}`
            )}
          </button>
        </div>
      </div>
    )
  }

  // ── Step 1: Mode selection ───────────────────────────────────────────────
  const activeModeConf = MODES_CONFIG.find(m => m.id === activeMode)

  return (
    <div className="branch-config-screen">
      {/* Header */}
      <div className="branch-config-header">
        <button className="screen-back-btn" onClick={onCancel} type="button">✕ Cancel</button>
      </div>

      <div className="branch-config-body branch-step1-body">
        {/* Founding context */}
        <FoundingContextPreview messages={foundingMessages} />

        {/* Mode prompt */}
        <div className="branch-mode-question">
          What would you like to do with this?
        </div>

        {/* Expansion panel for stroll / thinking */}
        <div style={{
          overflow:    'hidden',
          maxHeight:   activeMode ? '160px' : '0px',
          opacity:     activeMode ? 1 : 0,
          paddingTop:  activeMode ? '4px' : '0',
          paddingBottom: activeMode ? '4px' : '0',
          transition:  'max-height 0.26s ease, opacity 0.20s ease, padding 0.26s ease',
        }}>
          {/* Frosted textarea pill */}
          <div style={{
            display:              'flex',
            alignItems:           'flex-end',
            gap:                  '10px',
            background:           'rgba(245, 241, 234, 0.82)',
            WebkitBackdropFilter: 'blur(12px)',
            backdropFilter:       'blur(12px)',
            border:               '1px solid rgba(107, 124, 71, 0.18)',
            borderRadius:         '14px',
            padding:              '10px 12px',
            boxShadow:            '0 2px 16px rgba(0,0,0,0.08)',
          }}>
            <textarea
              ref={textareaRef}
              className="entry-textarea"
              value={branchText}
              onChange={handleStep1TextChange}
              onKeyDown={handleStep1KeyDown}
              placeholder={activeModeConf?.placeholder ?? ''}
              disabled={isSubmitting}
              rows={1}
              style={{
                flex:       1,
                background: 'transparent',
                border:     'none',
                outline:    'none',
                resize:     'none',
                color:      '#4a5830',
                fontFamily: 'Georgia, serif',
                fontSize:   '16px',
                lineHeight: '1.5',
                padding:    '2px 0',
                minHeight:  '24px',
                maxHeight:  '120px',
                overflow:   'auto',
                caretColor: '#4a5a24',
              }}
            />
            <button
              onClick={handleStep1Submit}
              disabled={isSubmitting}
              aria-label="Begin branch"
              type="button"
              style={{
                flexShrink:     0,
                width:          '32px',
                height:         '32px',
                background:     !isSubmitting ? '#4a5a24' : 'rgba(74, 90, 36, 0.12)',
                border:         'none',
                borderRadius:   '8px',
                cursor:         !isSubmitting ? 'pointer' : 'default',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                transition:     'background 0.2s',
                color:          !isSubmitting ? '#f5f2ec' : '#8a9a70',
              }}
            >
              {isSubmitting ? (
                <span style={{ opacity: 0.5, fontSize: '12px' }}>·</span>
              ) : (
                <svg width="14" height="16" viewBox="0 0 14 16" fill="none"
                  stroke="currentColor" strokeWidth="1.5"
                  strokeLinecap="round" strokeLinejoin="round"
                >
                  <circle cx="9" cy="2" r="1.5" />
                  <line x1="8.5" y1="3.5" x2="7.5" y2="8" />
                  <line x1="8"   y1="5.5" x2="11"  y2="7.5" />
                  <line x1="8"   y1="5.5" x2="5.5" y2="6.5" />
                  <line x1="7.5" y1="8"   x2="10"  y2="13" />
                  <line x1="7.5" y1="8"   x2="5"   y2="12" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mode icons row */}
        <div className="branch-mode-icons-row">
          {MODES_CONFIG.map(mode => {
            const isGated   = mode.id === 'professional' && !isProfessionalUnlocked
            const isActive  = activeMode === mode.id
            const isReceded = activeMode !== null && !isActive

            return (
              <button
                key={mode.id}
                onClick={() => handleIconClick(mode.id)}
                onMouseEnter={() => !isGated && setLabelVisible(mode.id)}
                onMouseLeave={() => setLabelVisible(null)}
                onTouchStart={() => handleIconTouchStart(mode.id)}
                onTouchEnd={handleIconTouchEnd}
                disabled={isGated}
                aria-label={mode.label}
                type="button"
                style={{
                  width:                '60px',
                  height:               '66px',
                  display:              'flex',
                  flexDirection:        'column',
                  alignItems:           'center',
                  justifyContent:       'center',
                  gap:                  '4px',
                  background:           isActive
                                          ? 'rgba(74, 90, 36, 0.15)'
                                          : 'rgba(245, 241, 234, 0.72)',
                  WebkitBackdropFilter: 'blur(10px)',
                  backdropFilter:       'blur(10px)',
                  border:               isActive
                                          ? '1px solid rgba(107, 124, 71, 0.38)'
                                          : '1px solid rgba(107, 124, 71, 0.16)',
                  borderRadius:         '14px',
                  cursor:               isGated ? 'not-allowed' : 'pointer',
                  transition:           'background 0.18s, border 0.18s, opacity 0.20s, transform 0.20s, filter 0.18s',
                  opacity:              isGated ? 0.25 : isReceded ? 0.32 : 1,
                  transform:            isReceded ? 'scale(0.87)' : 'scale(1)',
                  filter:               isGated ? 'grayscale(1)' : 'none',
                  color:                '#4a5830',
                  padding:              0,
                }}
              >
                <ModeIcon id={mode.id} />
                <span style={{
                  fontSize:      '10px',
                  fontFamily:    'Georgia, serif',
                  color:         '#4a5830',
                  opacity:       labelVisible === mode.id ? 0.75 : 0,
                  transition:    'opacity 0.15s',
                  letterSpacing: '0.02em',
                  lineHeight:    1,
                  userSelect:    'none',
                }}>
                  {mode.label}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
