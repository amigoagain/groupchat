/**
 * ProfessionalScreen.jsx
 * ──────────────────────────────────────────────────────────────
 * Full-screen character selection for professional / expert sessions.
 * User browses all characters, searches and filters by domain,
 * then chooses one of two entry modes:
 *
 *   "Start a Discussion" — direct multi-character room (primary)
 *   "Start with Gardener" — professional Gardener-led entry (secondary)
 *
 * Props:
 *   onDirectStart(selectedChars)           — open a direct character room
 *   onGardenerStart(selectedChars, text)   — open Gardener-led professional room
 *   onClose()                              — dismiss without starting
 */

import { useState, useEffect, useMemo } from 'react'
import { loadAllCharacters } from '../utils/customCharacters.js'
import { inferDomain, DOMAIN_COLORS } from '../utils/domainUtils.js'

const DOMAINS = Object.keys(DOMAIN_COLORS)

// ── Tier badge ────────────────────────────────────────────────────────────────
function TierBadge({ isCanonical }) {
  return (
    <span style={{
      display:       'inline-block',
      padding:       '2px 7px',
      borderRadius:  '10px',
      fontSize:      '10px',
      fontFamily:    'system-ui, sans-serif',
      letterSpacing: '0.04em',
      background:    isCanonical ? 'rgba(74, 90, 36, 0.12)' : 'rgba(140, 110, 60, 0.12)',
      color:         isCanonical ? '#4a5a30' : '#7a6030',
      border:        isCanonical ? '1px solid rgba(74,90,36,0.22)' : '1px solid rgba(140,110,60,0.22)',
    }}>
      {isCanonical ? 'Canonical' : 'Community'}
    </span>
  )
}

// ── Domain badge ──────────────────────────────────────────────────────────────
function DomainBadge({ domain }) {
  const color = DOMAIN_COLORS[domain] || '#8a9a70'
  return (
    <span style={{
      display:       'inline-block',
      padding:       '2px 7px',
      borderRadius:  '10px',
      fontSize:      '10px',
      fontFamily:    'system-ui, sans-serif',
      letterSpacing: '0.04em',
      background:    color + '22',
      color:         color,
      border:        `1px solid ${color}44`,
    }}>
      {domain}
    </span>
  )
}

// ── Character row ─────────────────────────────────────────────────────────────
function CharRow({ char, selected, onToggle }) {
  const domain = inferDomain(char)
  return (
    <div
      onClick={() => onToggle(char)}
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        '12px',
        padding:    '10px 16px',
        cursor:     'pointer',
        background: selected ? 'rgba(74, 90, 36, 0.07)' : 'transparent',
        borderBottom: '1px solid rgba(107, 124, 71, 0.08)',
        transition: 'background 0.14s ease',
      }}
    >
      {/* Avatar */}
      <div style={{
        width:          '40px',
        height:         '40px',
        borderRadius:   '50%',
        background:     char.color || '#5a7a8a',
        flexShrink:     0,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        color:          '#fff',
        fontFamily:     'Georgia, serif',
        fontSize:       '16px',
        fontWeight:     '500',
      }}>
        {(char.name || '?')[0].toUpperCase()}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '14px', color: '#2c3820', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {char.name}
        </div>
        <div style={{ fontSize: '12px', color: '#7a8a6a', marginBottom: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {char.title}
        </div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          <TierBadge isCanonical={char.is_canonical} />
          {domain && domain !== 'General' && <DomainBadge domain={domain} />}
        </div>
      </div>

      {/* Checkmark */}
      <div style={{
        width:          '22px',
        height:         '22px',
        borderRadius:   '50%',
        border:         `1.5px solid ${selected ? '#4a5a24' : 'rgba(107,124,71,0.30)'}`,
        background:     selected ? '#4a5a24' : 'transparent',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        transition:     'background 0.15s ease, border 0.15s ease',
      }}>
        {selected && (
          <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
            <polyline points="1,4.5 4,7.5 10,1.5" stroke="#f5f2ec" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ProfessionalScreen({ onDirectStart, onGardenerStart, onClose }) {
  const [characters,   setCharacters]   = useState([])
  const [loading,      setLoading]      = useState(true)
  const [selected,     setSelected]     = useState([])
  const [charSearch,   setCharSearch]   = useState('')
  const [domainFilter, setDomainFilter] = useState('All')
  const [openingText,  setOpeningText]  = useState('')
  const [showGardener, setShowGardener] = useState(false)

  useEffect(() => {
    loadAllCharacters()
      .then(chars => { setCharacters(chars); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    return characters.filter(c => {
      const q = charSearch.toLowerCase()
      const matchSearch = !q
        || (c.name  || '').toLowerCase().includes(q)
        || (c.title || '').toLowerCase().includes(q)
      const domain      = inferDomain(c)
      const matchDomain = domainFilter === 'All' || domain === domainFilter
      return matchSearch && matchDomain
    })
  }, [characters, charSearch, domainFilter])

  const isSelected  = (char) => selected.some(c => c.id === char.id)
  const toggleSelect = (char) => {
    setSelected(prev =>
      prev.some(c => c.id === char.id)
        ? prev.filter(c => c.id !== char.id)
        : [...prev, char]
    )
  }

  const canDirectStart   = selected.length > 0
  const canGardenerStart = selected.length > 0 && openingText.trim().length > 0

  return (
    <div style={{
      position:      'fixed',
      inset:         0,
      zIndex:        200,
      background:    '#f5f2ec',
      display:       'flex',
      flexDirection: 'column',
      overflowY:     'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{
        flexShrink:    0,
        display:       'flex',
        alignItems:    'center',
        padding:       '14px 16px 12px',
        paddingTop:    'calc(14px + env(safe-area-inset-top, 0px))',
        borderBottom:  '1px solid rgba(107, 124, 71, 0.14)',
        background:    '#f5f2ec',
      }}>
        <button
          onClick={onClose}
          style={{
            background:  'none',
            border:      'none',
            cursor:      'pointer',
            color:       '#4a5830',
            fontFamily:  'Georgia, serif',
            fontSize:    '14px',
            padding:     '4px 0',
            marginRight: '12px',
          }}
        >
          ← Back
        </button>
        <h2 style={{
          margin:     0,
          fontFamily: 'Georgia, serif',
          fontSize:   '18px',
          color:      '#2c3820',
          fontWeight: 'normal',
          flex:       1,
        }}>
          Professional
        </h2>
        {selected.length > 0 && (
          <span style={{
            fontFamily:  'Georgia, serif',
            fontSize:    '13px',
            color:       '#4a5830',
            background:  'rgba(74, 90, 36, 0.10)',
            borderRadius:'10px',
            padding:     '3px 10px',
          }}>
            {selected.length} selected
          </span>
        )}
      </div>

      {/* ── Search ── */}
      <div style={{ flexShrink: 0, padding: '10px 16px 0' }}>
        <input
          type="text"
          placeholder="Search characters…"
          value={charSearch}
          onChange={e => setCharSearch(e.target.value)}
          style={{
            width:        '100%',
            boxSizing:    'border-box',
            background:   'rgba(255,255,255,0.60)',
            border:       '1px solid rgba(107, 124, 71, 0.20)',
            borderRadius: '10px',
            padding:      '9px 14px',
            fontFamily:   'Georgia, serif',
            fontSize:     '14px',
            color:        '#2c3820',
            outline:      'none',
          }}
        />
      </div>

      {/* ── Domain filter chips ── */}
      <div style={{
        flexShrink:  0,
        display:     'flex',
        gap:         '6px',
        overflowX:   'auto',
        padding:     '10px 16px',
        scrollbarWidth: 'none',
      }}>
        {['All', ...DOMAINS].map(d => {
          const active = domainFilter === d
          const color  = d === 'All' ? '#4a5830' : (DOMAIN_COLORS[d] || '#4a5830')
          return (
            <button
              key={d}
              onClick={() => setDomainFilter(d)}
              style={{
                flexShrink:   0,
                padding:      '4px 12px',
                borderRadius: '12px',
                border:       `1px solid ${color}55`,
                background:   active ? color : 'transparent',
                color:        active ? '#fff' : color,
                fontFamily:   'system-ui, sans-serif',
                fontSize:     '11px',
                letterSpacing:'0.03em',
                cursor:       'pointer',
                transition:   'background 0.14s ease, color 0.14s ease',
                whiteSpace:   'nowrap',
              }}
            >
              {d}
            </button>
          )
        })}
      </div>

      {/* ── Character list ── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'Georgia, serif', color: '#8a9a70', fontSize: '14px' }}>
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'Georgia, serif', color: '#8a9a70', fontSize: '14px' }}>
            No characters found.
          </div>
        ) : (
          filtered.map(char => (
            <CharRow
              key={char.id}
              char={char}
              selected={isSelected(char)}
              onToggle={toggleSelect}
            />
          ))
        )}
      </div>

      {/* ── Gardener opening question (slide up when toggled) ── */}
      <div style={{
        flexShrink:  0,
        overflow:    'hidden',
        maxHeight:   showGardener ? '100px' : '0px',
        opacity:     showGardener ? 1 : 0,
        transition:  'max-height 0.26s ease, opacity 0.22s ease',
        borderTop:   showGardener ? '1px solid rgba(107,124,71,0.12)' : 'none',
        padding:     showGardener ? '12px 16px 0' : '0 16px',
        background:  '#f5f2ec',
      }}>
        <textarea
          placeholder="What do you need to work through? (required for Gardener start)"
          value={openingText}
          onChange={e => setOpeningText(e.target.value)}
          rows={2}
          style={{
            width:        '100%',
            boxSizing:    'border-box',
            background:   'rgba(255,255,255,0.60)',
            border:       '1px solid rgba(107,124,71,0.20)',
            borderRadius: '8px',
            padding:      '9px 12px',
            fontFamily:   'Georgia, serif',
            fontSize:     '14px',
            color:        '#2c3820',
            resize:       'none',
            outline:      'none',
          }}
        />
      </div>

      {/* ── Action buttons ── */}
      <div style={{
        flexShrink:   0,
        padding:      '12px 16px',
        paddingBottom:'max(16px, env(safe-area-inset-bottom))',
        borderTop:    '1px solid rgba(107,124,71,0.12)',
        display:      'flex',
        gap:          '10px',
        background:   '#f5f2ec',
      }}>

        {/* Primary: Start a Discussion */}
        <button
          onClick={() => canDirectStart && onDirectStart(selected)}
          disabled={!canDirectStart}
          style={{
            flex:         2,
            padding:      '13px 0',
            background:   canDirectStart ? '#4a5a24' : 'rgba(74,90,36,0.14)',
            color:        canDirectStart ? '#f5f2ec' : '#8a9a70',
            border:       'none',
            borderRadius: '10px',
            fontFamily:   'Georgia, serif',
            fontSize:     '15px',
            cursor:       canDirectStart ? 'pointer' : 'default',
            transition:   'background 0.18s ease, color 0.18s ease',
          }}
        >
          Start a Discussion
        </button>

        {/* Secondary: Start with Gardener */}
        <button
          onClick={() => {
            if (!showGardener) { setShowGardener(true); return }
            if (canGardenerStart) onGardenerStart(selected, openingText)
          }}
          disabled={showGardener && !canGardenerStart}
          style={{
            flex:         1,
            padding:      '13px 0',
            background:   'transparent',
            color:        (showGardener && !canGardenerStart) ? '#b0bea0' : '#4a5830',
            border:       `1.5px solid ${(showGardener && !canGardenerStart) ? 'rgba(107,124,71,0.18)' : 'rgba(107,124,71,0.38)'}`,
            borderRadius: '10px',
            fontFamily:   'Georgia, serif',
            fontSize:     '13px',
            cursor:       (showGardener && !canGardenerStart) ? 'default' : 'pointer',
            transition:   'color 0.15s ease, border 0.15s ease',
          }}
        >
          {showGardener ? 'Begin' : 'With Gardener'}
        </button>

      </div>
    </div>
  )
}
