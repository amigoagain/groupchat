/**
 * ProfessionalScreen.jsx
 * ──────────────────────────────────────────────────────────────
 * Full-screen character selection for professional / expert sessions.
 * Shows only expert-tier characters (isExpert === true from DB) plus
 * a set of hardcoded new professionals. Each character has up to 3
 * domain categories used for filter chips.
 *
 * Props:
 *   onDirectStart(selectedChars)           — open a direct character room
 *   onGardenerStart(selectedChars, text)   — open Gardener-led professional room
 *   onClose()                              — dismiss without starting
 */

import { useState, useEffect, useMemo } from 'react'
import { loadAllCharacters } from '../utils/customCharacters.js'
import { DOMAIN_COLORS } from '../utils/domainUtils.js'

// ── Persona name + categories overrides for existing expert characters ─────────
// Maps the DB character name → { displayName, categories }
const PERSONA_OVERRIDES = {
  'The Neuroscientist':    { displayName: 'Elena Marsh',    categories: ['Science', 'Health', 'Psychology'] },
  'The Economist':         { displayName: 'Daniel Krug',    categories: ['Business', 'Politics', 'Science'] },
  'The Therapist':         { displayName: 'Camille Ross',   categories: ['Psychology', 'Health'] },
  'The Lawyer':            { displayName: 'Marcus Chen',    categories: ['Law', 'Business', 'Politics'] },
  'The Nutritionist':      { displayName: 'Priya Nair',     categories: ['Health', 'Science'] },
  'The Financial Advisor': { displayName: 'Oliver Wei',     categories: ['Business'] },
  'The Climate Scientist': { displayName: 'Astrid Holm',    categories: ['Science', 'Politics'] },
  'The Strategist':        { displayName: 'Jordan Thayer',  categories: ['Business'] },
  'The Medical Doctor':    { displayName: 'Dr. Samuel Obi', categories: ['Health', 'Science'] },
  'The Research Assistant':{ displayName: 'Maia Kowalski',  categories: ['Science', 'Tech'] },
}

// ── New professional characters (hardcoded, session-only) ─────────────────────
// Note: `name` and `displayName` are kept identical here so that character
// message bubbles (which use char.name) show the persona name correctly.
const NEW_PROFESSIONALS = [
  {
    id: 'prof_investment_analyst',
    dbName: null,
    name: 'Ethan Park',
    displayName: 'Ethan Park',
    title: 'Investment Analyst & Portfolio Manager',
    initial: 'E',
    color: '#f59e0b',
    categories: ['Business'],
    isExpert: true,
    isCanonical: false,
    isCustom: false,
    personality: `You are Ethan Park, an Investment Analyst and Portfolio Manager with over fifteen years of experience across equity research, asset allocation, and quantitative portfolio construction. You have worked at a leading asset management firm and now advise institutional and high-net-worth clients on portfolio strategy, risk management, and market dynamics. Your approach combines rigorous fundamental analysis with a clear-eyed understanding of macro forces and behavioural finance. You speak plainly and without jargon when talking to non-specialists, but can go deep on valuation models, factor investing, and risk-adjusted return frameworks when needed. You do not give personalised investment advice in the legal sense — you explore ideas, frameworks, and scenarios. You help people think more clearly about capital, risk, and time horizon.`,
  },
  {
    id: 'prof_executive_coach',
    dbName: null,
    name: 'Isabel Renard',
    displayName: 'Isabel Renard',
    title: 'Executive Coach & Leadership Advisor',
    initial: 'I',
    color: '#8b5cf6',
    categories: ['Business', 'Psychology'],
    isExpert: true,
    isCanonical: false,
    isCustom: false,
    personality: `You are Isabel Renard, an Executive Coach and Leadership Advisor who has worked with senior leaders across technology, finance, and the public sector. You trained in organisational psychology and spent a decade in management consulting before moving into coaching full-time. Your work sits at the intersection of performance, identity, and relationships at work. You help leaders clarify what they actually want, understand what gets in their way, and make more intentional decisions. You are warm but direct, and you take the person seriously rather than just telling them what they want to hear. You draw on research in adult development, systems thinking, and narrative psychology, but you never let theory crowd out the specific person in front of you.`,
  },
  {
    id: 'prof_policy_analyst',
    dbName: null,
    name: 'Nathan Osei',
    displayName: 'Nathan Osei',
    title: 'Public Policy Analyst & Governance Advisor',
    initial: 'N',
    color: '#6366f1',
    categories: ['Politics', 'Business', 'Law'],
    isExpert: true,
    isCanonical: false,
    isCustom: false,
    personality: `You are Nathan Osei, a Public Policy Analyst and Governance Advisor with expertise in economic development, regulatory design, and institutional reform. You have worked with governments, think tanks, and international organisations across Sub-Saharan Africa, Europe, and the United States. You understand how policy is made in practice — the trade-offs, the political constraints, the implementation gaps — and you help people think rigorously about what interventions are likely to work and why. You are empirically grounded, politically nuanced, and intellectually honest about uncertainty. You are comfortable across a wide range of policy domains including fiscal policy, labour markets, digital governance, and public health systems.`,
  },
  {
    id: 'prof_data_scientist',
    dbName: null,
    name: 'Zara Ahmed',
    displayName: 'Zara Ahmed',
    title: 'Data Scientist & Statistical Analyst',
    initial: 'Z',
    color: '#0ea5e9',
    categories: ['Tech', 'Science'],
    isExpert: true,
    isCanonical: false,
    isCustom: false,
    personality: `You are Zara Ahmed, a Data Scientist and Statistical Analyst with deep expertise in machine learning, causal inference, and applied statistics. You have worked in both academic research and industry, building predictive models and analytical systems for healthcare, fintech, and e-commerce organisations. You are fluent in Python, R, and SQL, and you are as comfortable discussing study design and statistical validity as you are engineering production ML pipelines. You translate complex quantitative concepts into plain language without losing precision. You care deeply about the correct use of data — about what evidence actually supports, where models fail, and how analytical findings should and should not be acted on.`,
  },
  {
    id: 'prof_applied_ethicist',
    dbName: null,
    name: 'Felix Albright',
    displayName: 'Felix Albright',
    title: 'Applied Ethicist & Philosopher',
    initial: 'F',
    color: '#475569',
    categories: ['Philosophy', 'Law', 'Science'],
    isExpert: true,
    isCanonical: false,
    isCustom: false,
    personality: `You are Felix Albright, an Applied Ethicist and Philosopher who works at the boundary of academic philosophy and real-world decision-making. You have advised technology companies, bioethics boards, and government agencies on questions ranging from AI governance and data privacy to end-of-life care and corporate responsibility. Your philosophical background is broadly analytic — trained in moral philosophy, political theory, and philosophy of science — but you are fundamentally interested in what these frameworks actually help people decide and do. You bring rigour without pedantry, and you are as willing to say "this is genuinely hard and reasonable people disagree" as you are to defend a clear position when the argument warrants it.`,
  },
]

// ── Derive all unique categories across the full professional roster ───────────
function buildCategoryList(professionals) {
  const seen = new Set()
  for (const p of professionals) {
    for (const cat of p.categories || []) seen.add(cat)
  }
  // Sort in a sensible order if possible
  const preferred = ['Business', 'Science', 'Health', 'Psychology', 'Law', 'Politics', 'Tech', 'Philosophy']
  const sorted = preferred.filter(c => seen.has(c))
  for (const c of seen) { if (!sorted.includes(c)) sorted.push(c) }
  return sorted
}

// ── Category chip ──────────────────────────────────────────────────────────────
function CategoryChip({ category }) {
  const color = DOMAIN_COLORS[category] || '#8a9a70'
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
      {category}
    </span>
  )
}

// ── Character row ─────────────────────────────────────────────────────────────
function CharRow({ char, selected, onToggle }) {
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
        {(char.displayName || '?')[0].toUpperCase()}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'Georgia, serif', fontSize: '14px', color: '#2c3820', marginBottom: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {char.displayName}
        </div>
        <div style={{ fontSize: '12px', color: '#7a8a6a', marginBottom: '5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {char.title}
        </div>
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
          {(char.categories || []).map(cat => (
            <CategoryChip key={cat} category={cat} />
          ))}
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
  const [professionals,  setProfessionals]  = useState([])
  const [loading,        setLoading]        = useState(true)
  const [selected,       setSelected]       = useState([])
  const [charSearch,     setCharSearch]     = useState('')
  const [activeCategory, setActiveCategory] = useState('All')
  const [openingText,    setOpeningText]    = useState('')
  const [showGardener,   setShowGardener]   = useState(false)

  useEffect(() => {
    loadAllCharacters()
      .then(chars => {
        // Keep only expert-tier characters from the DB
        const experts = chars.filter(c => c.isExpert)

        // Apply persona overrides and assign categories.
        // We also update `name` to the persona display name so that character
        // message bubbles (which use char.name) show the friendly alias.
        const mapped = experts.map(c => {
          const override = PERSONA_OVERRIDES[c.name]
          const displayName = override ? override.displayName : c.name
          return {
            ...c,
            name:        displayName,
            displayName,
            categories:  override ? override.categories  : ['General'],
          }
        })

        // Merge DB experts with hardcoded new professionals
        // Deduplicate by dbName so we don't double-add if they're somehow in DB too
        const existingDbNames = new Set(mapped.map(m => m.name))
        const newOnes = NEW_PROFESSIONALS.filter(p => !p.dbName || !existingDbNames.has(p.dbName))

        setProfessionals([...mapped, ...newOnes])
        setLoading(false)
      })
      .catch(() => {
        // If DB fails, show new professionals only
        setProfessionals(NEW_PROFESSIONALS)
        setLoading(false)
      })
  }, [])

  const allCategories = useMemo(() => buildCategoryList(professionals), [professionals])

  const filtered = useMemo(() => {
    return professionals.filter(p => {
      const q = charSearch.toLowerCase()
      const matchSearch = !q
        || (p.displayName || '').toLowerCase().includes(q)
        || (p.title       || '').toLowerCase().includes(q)
      const matchCat = activeCategory === 'All' || (p.categories || []).includes(activeCategory)
      return matchSearch && matchCat
    })
  }, [professionals, charSearch, activeCategory])

  const isSelected   = (char) => selected.some(c => c.id === char.id)
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
        position:      'relative',
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
          position:   'absolute',
          left:       '50%',
          transform:  'translateX(-50%)',
          margin:     0,
          fontFamily: 'Georgia, serif',
          fontSize:   '18px',
          color:      '#2c3820',
          fontWeight: 'normal',
          whiteSpace: 'nowrap',
        }}>
          Professional
        </h2>
        {selected.length > 0 && (
          <span style={{
            marginLeft:  'auto',
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
          placeholder="Search professionals…"
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

      {/* ── Category filter chips ── */}
      <div style={{
        flexShrink:  0,
        display:     'flex',
        gap:         '6px',
        overflowX:   'auto',
        padding:     '10px 16px',
        scrollbarWidth: 'none',
      }}>
        {['All', ...allCategories].map(cat => {
          const active = activeCategory === cat
          const color  = cat === 'All' ? '#4a5830' : (DOMAIN_COLORS[cat] || '#4a5830')
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
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
              {cat}
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
            No professionals found.
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
