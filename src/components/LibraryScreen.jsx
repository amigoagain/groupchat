/**
 * LibraryScreen.jsx
 *
 * The Library — central repository for public and private Kepos knowledge.
 *
 * Two top-level tabs: Public | Private
 *
 * Public:
 *   Architecture — operative terms glossary + garden diagram card
 *   Founding Document — placeholder
 *   Reference Cases — case001.md and case002.md
 *   Journals — Gardener's, Weatherman's, Entomologist's
 *   Governance Reports — governance_failure library_reports
 *   Public Conversations — read-only / moderated-public rooms
 *
 * Private (auth-gated):
 *   My Conversations — user's private rooms; dormant strolls show Branch / Continue
 *   Notes — CRUD for notebook_entries
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import { fetchMyRooms, fetchAllRooms } from '../utils/roomUtils.js'
import { getVisitedRoomCodes } from '../utils/inboxUtils.js'
import { relativeTime } from '../utils/inboxUtils.js'

// ── Raw markdown imports ───────────────────────────────────────────────────────
import case001Raw from '../data/case001.md?raw'
import case002Raw from '../data/case002.md?raw'

// ── Inline styles ─────────────────────────────────────────────────────────────
const S = {
  screen: {
    position:    'fixed',
    inset:       0,
    background:  '#111',
    color:       '#e0dbd0',
    fontFamily:  'Georgia, serif',
    overflowY:   'hidden',
    zIndex:      900,
    display:     'flex',
    flexDirection: 'column',
  },
  header: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '14px 20px',
    borderBottom:   '1px solid #2a2a2a',
    flexShrink:     0,
    gap:            '12px',
  },
  headerLeft: {
    display:    'flex',
    alignItems: 'center',
    gap:        '12px',
  },
  backBtn: {
    background:   'none',
    border:       'none',
    color:        '#6b7c47',
    fontSize:     '18px',
    cursor:       'pointer',
    padding:      '4px 8px 4px 0',
    lineHeight:   1,
    display:      'flex',
    alignItems:   'center',
  },
  title: {
    fontSize:      '13px',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color:         '#6b7c47',
    fontFamily:    'monospace',
    fontWeight:    600,
  },
  tabs: {
    display:        'flex',
    borderBottom:   '1px solid #2a2a2a',
    flexShrink:     0,
  },
  tab: (active) => ({
    flex:            1,
    padding:         '10px 0',
    background:      'none',
    border:          'none',
    borderBottom:    active ? '2px solid #6b7c47' : '2px solid transparent',
    color:           active ? '#8faf52' : '#5a5a5a',
    fontSize:        '12px',
    letterSpacing:   '0.08em',
    textTransform:   'uppercase',
    fontFamily:      'monospace',
    cursor:          'pointer',
    transition:      'color 0.15s',
  }),
  body: {
    display:   'flex',
    flex:      1,
    minHeight: 0,
    overflow:  'hidden',
  },
  sidebar: {
    width:        '180px',
    borderRight:  '1px solid #2a2a2a',
    padding:      '16px 0',
    flexShrink:   0,
    overflowY:    'auto',
  },
  sidebarItem: (active) => ({
    display:    'block',
    width:      '100%',
    textAlign:  'left',
    padding:    '8px 16px',
    background: active ? '#1a2610' : 'none',
    border:     'none',
    color:      active ? '#8faf52' : '#6a6a6a',
    fontSize:   '13px',
    fontFamily: 'Georgia, serif',
    cursor:     'pointer',
    borderLeft: active ? '2px solid #6b7c47' : '2px solid transparent',
    lineHeight: 1.3,
  }),
  content: {
    flex:     1,
    padding:  '24px 28px 40px',
    overflowY: 'auto',
    maxWidth:  '760px',
  },
  sectionTitle: {
    fontSize:     '17px',
    color:        '#d4cfc5',
    marginBottom: '20px',
    fontWeight:   'normal',
    letterSpacing: '0.01em',
  },
  card: {
    background:   '#181818',
    border:       '1px solid #2a2a2a',
    borderRadius: '4px',
    padding:      '18px 20px',
    marginBottom: '14px',
  },
  cardTitle: {
    fontSize:     '14px',
    fontWeight:   'bold',
    color:        '#c8c3b8',
    marginBottom: '10px',
  },
  cardMeta: {
    fontSize:   '11px',
    color:      '#3a3a3a',
    fontFamily: 'monospace',
    marginTop:  '10px',
  },
  termWord: {
    fontSize:      '12px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color:         '#6b7c47',
    fontFamily:    'monospace',
    fontWeight:    600,
    marginBottom:  '4px',
    marginTop:     '20px',
  },
  termDef: {
    fontSize:   '13px',
    color:      '#a8a39a',
    lineHeight: 1.7,
  },
  placeholderItalic: {
    fontSize:   '13px',
    color:      '#3a3a3a',
    fontFamily: 'monospace',
    fontStyle:  'italic',
    lineHeight: 1.6,
  },
  caseSection: {
    fontSize:      '11px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color:         '#4a4a4a',
    fontFamily:    'monospace',
    marginTop:     '16px',
    marginBottom:  '6px',
  },
  caseBody: {
    fontSize:   '13px',
    color:      '#9a9590',
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap',
  },
  loading: {
    color:    '#3a3a3a',
    fontFamily: 'monospace',
    fontSize:  '12px',
    padding:   '20px 0',
  },
  empty: {
    color:    '#3a3a3a',
    fontFamily: 'monospace',
    fontSize:  '12px',
    fontStyle: 'italic',
    padding:   '12px 0',
  },
  notebookInput: {
    width:        '100%',
    minHeight:    '90px',
    background:   '#141414',
    border:       '1px solid #2a2a2a',
    borderRadius: '4px',
    color:        '#e0dbd0',
    fontFamily:   'Georgia, serif',
    fontSize:     '16px',
    padding:      '12px',
    resize:       'vertical',
    outline:      'none',
    boxSizing:    'border-box',
    marginBottom: '10px',
  },
  btn: (variant) => ({
    padding:      '7px 14px',
    background:   variant === 'primary' ? '#3a4a1e' : 'transparent',
    border:       `1px solid ${variant === 'primary' ? '#5a6b2e' : '#3a3a3a'}`,
    borderRadius: '3px',
    color:        variant === 'primary' ? '#c8e4a0' : '#5a5a5a',
    fontFamily:   'monospace',
    fontSize:     '11px',
    cursor:       'pointer',
    marginRight:  '6px',
  }),
  strollActionRow: {
    display:    'flex',
    gap:        '8px',
    marginTop:  '12px',
    flexWrap:   'wrap',
  },
  strollBtn: (variant) => ({
    padding:      '6px 12px',
    background:   'transparent',
    border:       `1px solid ${variant === 'branch' ? '#3a5a8a' : '#4a5a24'}`,
    borderRadius: '3px',
    color:        variant === 'branch' ? '#6a9aca' : '#8faf52',
    fontFamily:   'monospace',
    fontSize:     '11px',
    cursor:       'pointer',
  }),
}

// ── Operative Terms ───────────────────────────────────────────────────────────

const OPERATIVE_TERMS = [
  { term: 'KEPOS', definition: 'The platform. Ancient Greek for garden. The name reflects the organizing metaphor at every level of the system.' },
  { term: 'THE GARDENER', definition: 'The routing and cultivation layer. Routes who responds, in what order, at what weight. Tends substrate. Does not direct what grows. Based on Annie Dillard\'s constitution: attends before speaking, honest about what she doesn\'t know, does not resolve what should remain open, earns the right to speak.' },
  { term: 'THE GOOSE', definition: 'Stateless governance signal. Listens always. Holds nothing. Honks twice — once to start a stroll (broadcasting turn count to all agents), once in response to /farmer or governance collapse. Does not interpret. Does not intervene.' },
  { term: 'BUGS', definition: 'Immune system. Reads character responses against the constitutional layer. Character drift and false convergence are aphids. Releases ladybug signal to the Gardener when found. No voice in the conversation. Sends bugs data to the Library.' },
  { term: 'HUX', definition: 'Border collie. Monitors for framework amplification and generic response patterns only. Barks when he sees them. Bark goes to the Gardener\'s memory. Always present. Chases the wind.' },
  { term: 'WEATHER', definition: 'Stateless atmospheric reader. Reads each turn fresh against weather models. Wind, rain, frost, drought. Tornado watch condition only — not fully instrumented. Reports to the Weatherman at the Library. The Gardener feels conditions from lived experience, not from Weather\'s data.' },
  { term: 'THE WEATHERMAN', definition: 'Human-led weather analysis at the Library. Analyzes Weather reports. Records in the Weatherman\'s journal. Builds understanding of atmospheric patterns across conversations over time.' },
  { term: 'THE ENTOMOLOGIST', definition: 'Human-led character fidelity analysis at the Library. Analyzes bugs data. Reads character fidelity flags against the constitutional layer. Records in the Entomologist\'s journal.' },
  { term: 'CONSTITUTIONAL LAYER', definition: 'Five to seven inviolable commitments per canonical character. Written and endorsed by domain experts. Bugs reads against this layer. The Entomologist analyzes against it.' },
  { term: 'THE STROLL', definition: 'A user-metered pacing and discovery conversation with the Gardener only. Eight seasons across two cycles. Ends in dormancy. Builds substrate — not seeds. What travels forward is what the user chooses to carry into a branch.' },
  { term: 'MIDDLE NODE', definition: 'The place where genuine emergence occurs. Produced between people with the Gardener as witness and substrate. Not synthesis. Not resolution. Arrival at a shared limit.' },
  { term: 'WIND', definition: 'Logos. Brings pollen and tornados. Productive friction. Users and characters both generate wind. Nothing grows without it.' },
  { term: 'RAIN', definition: 'Steady accumulation without escalation. Sustained engagement. The Gardener\'s correct response is patience.' },
  { term: 'FROST', definition: 'Premature convergence. Primary winter risk.' },
  { term: 'DROUGHT', definition: 'Energy leaving a conversation that should have momentum. Primary summer risk.' },
  { term: 'TORNADO', definition: 'The loop of logos as weather. The formal apparatus spinning on itself. Watch condition only. Natural events for natural excesses.' },
  { term: '/STROLL', definition: 'Opens a stroll conversation. User sets turn count. Gardener only. Eight seasons. Ends in dormancy.' },
  { term: '/FARMER', definition: 'Steelman and refutation. Applied to character statements and Gardener interventions. Triggers the Goose to collect from all agents. The governance layer\'s own governance.' },
  { term: '/BUTTERFLY', definition: 'Playfulness and curiosity. Lands lightly on what may have been overlooked. Most valuable in fall.' },
  { term: '/LIBRARY', definition: 'Opens the Library. Public and private sections.' },
]

// ── Markdown case parser ──────────────────────────────────────────────────────

function parseCase(raw) {
  if (!raw) return null
  const lines = raw.split('\n')
  let title = ''
  let meta = {}
  let sections = {}
  let currentSection = null
  let currentLines = []

  function flush() {
    if (currentSection) {
      sections[currentSection] = currentLines.join('\n').trim()
    }
  }

  for (const line of lines) {
    if (line.startsWith('# ')) {
      title = line.slice(2).trim()
    } else if (line.startsWith('**Date:**')) {
      meta.date = line.replace('**Date:**', '').trim()
    } else if (line.startsWith('**Room type:**')) {
      meta.roomType = line.replace('**Room type:**', '').trim()
    } else if (line.startsWith('**Gardener protocol:**')) {
      meta.protocol = line.replace('**Gardener protocol:**', '').trim()
    } else if (line.startsWith('**Account:**')) {
      meta.account = line.replace('**Account:**', '').trim()
    } else if (line.startsWith('## ')) {
      flush()
      currentSection = line.slice(3).trim()
      currentLines = []
    } else if (currentSection) {
      currentLines.push(line)
    }
  }
  flush()

  return { title, meta, sections }
}

// ── Public section nav items ───────────────────────────────────────────────────

const PUBLIC_SECTIONS = [
  { id: 'architecture',     label: 'Architecture' },
  { id: 'founding',         label: 'Founding Document' },
  { id: 'cases',            label: 'Reference Cases' },
  { id: 'journals',         label: 'Journals' },
  { id: 'governance',       label: 'Governance Reports' },
  { id: 'public_convos',    label: 'Public Conversations' },
]

const PRIVATE_SECTIONS = [
  { id: 'my_convos',  label: 'My Conversations' },
  { id: 'notebook',   label: 'Notes' },
]

// ── Main component ────────────────────────────────────────────────────────────

export default function LibraryScreen({ onBack, onOpenRoom, onOpenBranchConfig, onContinueStroll, initialTab = 'public', initialSection = null }) {
  const { isAuthenticated, userId } = useAuth()

  const [activeTab,     setActiveTab]     = useState(initialTab)
  const [activeSection, setActiveSection] = useState(
    initialTab === 'public'
      ? 'architecture'
      : (initialSection || 'my_convos')
  )
  const [data,          setData]          = useState({})
  const [loading,       setLoading]       = useState(false)
  const [isMobile,      setIsMobile]      = useState(() => window.innerWidth < 768)
  const [sidebarOpen,   setSidebarOpen]   = useState(() => window.innerWidth >= 768)

  // Section changes also load data
  useEffect(() => {
    loadSection(activeSection)
  }, [activeSection, userId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track viewport width — collapse sidebar on mobile, always open on desktop
  useEffect(() => {
    function onResize() {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) setSidebarOpen(true)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Switch tab → land on first section for that tab
  const handleTabSwitch = (tab) => {
    setActiveTab(tab)
    const firstSection = tab === 'public' ? 'architecture' : 'my_convos'
    setActiveSection(firstSection)
  }

  async function loadSection(section) {
    setLoading(true)
    try {
      if (section === 'architecture' || section === 'founding' || section === 'cases') {
        // Static sections — no DB fetch needed
        setLoading(false)
        return
      }
      if (!supabase) { setLoading(false); return }

      if (section === 'journals') {
        const [g, w, e] = await Promise.all([
          supabase.from('library_reports').select('*').eq('report_type', 'gardener_journal').order('created_at', { ascending: false }).limit(30),
          supabase.from('library_reports').select('*').eq('report_type', 'weatherman_journal').order('created_at', { ascending: false }).limit(30),
          supabase.from('library_reports').select('*').eq('report_type', 'entomologist_journal').order('created_at', { ascending: false }).limit(30),
        ])
        setData(d => ({ ...d, gardener_journal: g.data || [], weatherman_journal: w.data || [], entomologist_journal: e.data || [] }))
      } else if (section === 'governance') {
        const { data: rows } = await supabase.from('library_reports').select('*').eq('report_type', 'governance_failure').order('created_at', { ascending: false }).limit(50)
        setData(d => ({ ...d, governance: rows || [] }))
      } else if (section === 'public_convos') {
        const rooms = await fetchAllRooms()
        setData(d => ({ ...d, public_convos: rooms || [] }))
      } else if (section === 'my_convos' && userId) {
        const rooms = await fetchMyRooms([], userId)

        // For dormant stroll rooms, fetch stroll_state to get turns ratio signal
        const dormantStrollIds = (rooms || [])
          .filter(r => (r.roomMode === 'stroll' || r.mode?.id === 'stroll') && Boolean(r.dormantAt || r.dormant_at))
          .map(r => r.id)
        let strollStateMap = {}
        if (dormantStrollIds.length > 0 && supabase) {
          const { data: strollStates } = await supabase
            .from('stroll_state')
            .select('room_id, turns_elapsed, turn_count_chosen, turn_count_total')
            .in('room_id', dormantStrollIds)
          if (strollStates) {
            strollStateMap = Object.fromEntries(strollStates.map(s => [s.room_id, s]))
          }
        }

        setData(d => ({ ...d, my_convos: rooms || [], strollStateMap }))
      } else if (section === 'notebook' && userId) {
        const { data: rows } = await supabase.from('notebook_entries').select('*').eq('user_id', userId).order('created_at', { ascending: false })
        setData(d => ({ ...d, notebook: rows || [] }))
      }
    } catch (err) {
      console.warn('[Library] loadSection error:', err.message)
    }
    setLoading(false)
  }

  // ── Private library — warm entry-screen palette ───────────────────────────
  // Rendered as an entirely separate tree so the two places feel distinct.
  if (activeTab === 'private') {
    return (
      <div style={{
        position:      'fixed',
        inset:         0,
        background:    '#f5f2ec',
        fontFamily:    'Georgia, serif',
        display:       'flex',
        flexDirection: 'column',
        zIndex:        900,
        overflow:      'hidden',
      }}>
        {/* Warm header */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          padding:        '14px 20px',
          paddingTop:     'max(14px, env(safe-area-inset-top, 14px))',
          borderBottom:   '1px solid rgba(107, 124, 71, 0.14)',
          flexShrink:     0,
          gap:            '10px',
          boxSizing:      'border-box',
        }}>
          <button
            onClick={onBack}
            title="Back"
            style={{
              background: 'none',
              border:     'none',
              color:      '#4a5830',
              opacity:    0.55,
              cursor:     'pointer',
              padding:    '4px 8px 4px 0',
              display:    'flex',
              alignItems: 'center',
              lineHeight: 1,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span style={{
            fontFamily:    'Georgia, serif',
            fontSize:      '13px',
            letterSpacing: '0.14em',
            color:         '#4a5830',
            opacity:       0.60,
            userSelect:    'none',
          }}>
            my library
          </span>
        </div>

        {/* Conversations / Notes inline toggle */}
        <div style={{
          display:      'flex',
          gap:          0,
          paddingLeft:  '24px',
          borderBottom: '1px solid rgba(107, 124, 71, 0.14)',
          flexShrink:   0,
        }}>
          {PRIVATE_SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              style={{
                background:    'none',
                border:        'none',
                borderBottom:  activeSection === s.id
                                 ? '2px solid #6b7c47'
                                 : '2px solid transparent',
                color:         activeSection === s.id ? '#4a5830' : '#a09880',
                fontFamily:    'Georgia, serif',
                fontSize:      '13px',
                padding:       '12px 20px 11px 0',
                cursor:        'pointer',
                marginBottom:  '-1px',
                transition:    'color 0.15s',
                letterSpacing: '0.01em',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Content area */}
        <div style={{
          flex:      1,
          overflowY: 'auto',
          padding:   '24px 24px 48px',
          maxWidth:  '640px',
          width:     '100%',
          boxSizing: 'border-box',
        }}>
          {loading && (
            <div style={{ color: '#a09880', fontSize: '13px', padding: '20px 0', opacity: 0.7 }}>
              loading…
            </div>
          )}

          {!loading && activeSection === 'my_convos' && (
            <MyConvosSection
              rooms={data.my_convos}
              strollStateMap={data.strollStateMap || {}}
              onOpenRoom={onOpenRoom}
              onOpenBranchConfig={onOpenBranchConfig}
              onContinueStroll={onContinueStroll}
              warm={true}
            />
          )}
          {!loading && activeSection === 'notebook' && (
            <NotebookSection
              items={data.notebook}
              userId={userId}
              isAuthenticated={isAuthenticated}
              onRefresh={() => loadSection('notebook')}
              warm={true}
            />
          )}
        </div>
      </div>
    )
  }

  // ── Public library — dark library palette (unchanged) ─────────────────────
  return (
    <div style={S.screen}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <button style={S.backBtn} onClick={onBack} title="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span style={S.title}>Library</span>
        </div>
      </div>

      {/* Body — no tab strip; public and private are separate places reached
          via the entry screen pill buttons, not via a toggle within this view */}
      <div style={{ ...S.body, position: 'relative' }}>

        {/* ── PUBLIC TAB: sidebar + content ── */}
        {activeTab === 'public' && (
          <>
            {/* Sidebar toggle — mobile only, shown when sidebar is collapsed */}
            {isMobile && !sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                aria-label="Open navigation"
                style={{
                  position:   'absolute',
                  left:       0,
                  top:        '20px',
                  zIndex:     6,
                  background: 'none',
                  border:     'none',
                  cursor:     'pointer',
                  padding:    '12px 8px',
                  color:      '#6b7c47',
                  display:    'flex',
                  alignItems: 'center',
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            )}

            {/* Scrim — mobile only */}
            {isMobile && sidebarOpen && (
              <div
                onClick={() => setSidebarOpen(false)}
                style={{
                  position:   'absolute',
                  inset:      0,
                  zIndex:     5,
                  background: 'rgba(0,0,0,0.30)',
                }}
              />
            )}

            {/* Sidebar */}
            <div style={isMobile ? {
              position:    'absolute',
              top:         0,
              left:        0,
              bottom:      0,
              width:       '200px',
              borderRight: '1px solid #2a2a2a',
              padding:     '16px 0',
              overflowY:   'auto',
              zIndex:      10,
              background:  '#111',
              transform:   sidebarOpen ? 'translateX(0)' : 'translateX(-220px)',
              transition:  'transform 0.24s cubic-bezier(0.22, 1, 0.36, 1)',
            } : S.sidebar}>
              {PUBLIC_SECTIONS.map(s => (
                <button
                  key={s.id}
                  style={S.sidebarItem(activeSection === s.id)}
                  onClick={() => { setActiveSection(s.id); if (isMobile) setSidebarOpen(false) }}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Public content */}
            <div style={S.content}>
              {loading && <div style={S.loading}>loading…</div>}
              {!loading && activeSection === 'architecture'  && <ArchitectureSection />}
              {!loading && activeSection === 'founding'      && <FoundingSection />}
              {!loading && activeSection === 'cases'         && <CasesSection />}
              {!loading && activeSection === 'journals'      && <JournalsSection data={data} />}
              {!loading && activeSection === 'governance'    && <GovernanceSection items={data.governance} />}
              {!loading && activeSection === 'public_convos' && (
                <PublicConvosSection rooms={data.public_convos} onOpenRoom={onOpenRoom} />
              )}
            </div>
          </>
        )}

      </div>
    </div>
  )
}

// ── Architecture section ──────────────────────────────────────────────────────

function ArchitectureSection() {
  const [activeView, setActiveView] = useState('terms') // 'terms' | 'garden'

  return (
    <div>
      <h2 style={S.sectionTitle}>Architecture</h2>

      {/* Two view toggles */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        <button
          style={{ ...S.btn(activeView === 'terms' ? 'primary' : undefined) }}
          onClick={() => setActiveView('terms')}
        >
          Operative Terms
        </button>
        <button
          style={{ ...S.btn(activeView === 'garden' ? 'primary' : undefined) }}
          onClick={() => setActiveView('garden')}
        >
          The Garden
        </button>
      </div>

      {activeView === 'terms' && (
        <div>
          {OPERATIVE_TERMS.map(({ term, definition }) => (
            <div key={term}>
              <div style={S.termWord}>{term}</div>
              <div style={S.termDef}>{definition}</div>
            </div>
          ))}
        </div>
      )}

      {activeView === 'garden' && (
        <div style={S.card}>
          <div style={S.cardTitle}>The Garden</div>
          <div style={S.placeholderItalic}>
            System architecture diagram. Coming soon.
          </div>
        </div>
      )}
    </div>
  )
}

// ── Founding Document section ─────────────────────────────────────────────────

function FoundingSection() {
  return (
    <div>
      <h2 style={S.sectionTitle}>Founding Document</h2>
      <div style={S.card}>
        <div style={S.cardTitle}>Founding Document</div>
        <div style={S.placeholderItalic}>
          This document is being distilled. It will appear here when it is ready to be read.
        </div>
      </div>
    </div>
  )
}

// ── Reference Cases section ───────────────────────────────────────────────────

function CasesSection() {
  const case001 = parseCase(case001Raw)
  const case002 = parseCase(case002Raw)

  return (
    <div>
      <h2 style={S.sectionTitle}>Reference Cases</h2>
      {[case001, case002].filter(Boolean).map((c, i) => (
        <CaseCard key={i} caseData={c} />
      ))}
    </div>
  )
}

function CaseCard({ caseData }) {
  const [expanded, setExpanded] = useState(false)
  const { title, meta, sections } = caseData

  const SECTION_ORDER = [
    'Context', 'What held', 'What didn\'t hold', 'Key moment',
    'Key moment — the middle node',
    'Amendments produced', 'Open questions produced', 'Analyst note',
  ]

  return (
    <div style={{ ...S.card, marginBottom: '18px' }}>
      <div style={{ ...S.cardTitle, fontSize: '15px' }}>{title}</div>
      <div style={{ fontSize: '11px', color: '#4a4a4a', fontFamily: 'monospace', marginBottom: '12px' }}>
        {meta.date} · {meta.roomType} · Gardener {meta.protocol}
      </div>

      {/* Always show Context */}
      {sections['Context'] && (
        <div>
          <div style={S.caseSection}>Context</div>
          <div style={S.caseBody}>{sections['Context']}</div>
        </div>
      )}

      {/* Expand for rest */}
      {!expanded ? (
        <button
          style={{ ...S.btn(), marginTop: '12px' }}
          onClick={() => setExpanded(true)}
        >
          read more
        </button>
      ) : (
        <div>
          {SECTION_ORDER.filter(s => s !== 'Context' && sections[s]).map(sectionKey => (
            <div key={sectionKey}>
              <div style={S.caseSection}>{sectionKey}</div>
              <div style={S.caseBody}>{sections[sectionKey]}</div>
            </div>
          ))}
          <button style={{ ...S.btn(), marginTop: '12px' }} onClick={() => setExpanded(false)}>
            collapse
          </button>
        </div>
      )}
    </div>
  )
}

// ── Journals section ──────────────────────────────────────────────────────────

function JournalsSection({ data }) {
  const [activeJournal, setActiveJournal] = useState('gardener')

  const journals = [
    { id: 'gardener',      label: "Gardener's Journal",     key: 'gardener_journal' },
    { id: 'weatherman',    label: "Weatherman's Journal",   key: 'weatherman_journal' },
    { id: 'entomologist',  label: "Entomologist's Journal", key: 'entomologist_journal' },
  ]

  const current = journals.find(j => j.id === activeJournal)
  const items   = current ? (data[current.key] || null) : null

  return (
    <div>
      <h2 style={S.sectionTitle}>Journals</h2>

      <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {journals.map(j => (
          <button
            key={j.id}
            style={S.btn(activeJournal === j.id ? 'primary' : undefined)}
            onClick={() => setActiveJournal(j.id)}
          >
            {j.label}
          </button>
        ))}
      </div>

      {items === null ? (
        <div style={S.loading}>loading…</div>
      ) : items.length === 0 ? (
        <div style={S.empty}>
          No entries yet. Journal entries are written by humans at the Library after strolls and reference cases.
        </div>
      ) : (
        items.map(item => (
          <ReportCard key={item.id} item={item} />
        ))
      )}
    </div>
  )
}

// ── Governance section ────────────────────────────────────────────────────────

function GovernanceSection({ items }) {
  return (
    <div>
      <h2 style={S.sectionTitle}>Governance Reports</h2>
      {(!items || items.length === 0) ? (
        <div style={S.empty}>No governance reports. The garden is well.</div>
      ) : (
        items.map(item => <ReportCard key={item.id} item={item} />)
      )}
    </div>
  )
}

// ── Public Conversations section ──────────────────────────────────────────────

function PublicConvosSection({ rooms, onOpenRoom }) {
  if (!rooms) return <div style={S.loading}>loading…</div>
  if (rooms.length === 0) return (
    <div>
      <h2 style={S.sectionTitle}>Public Conversations</h2>
      <div style={S.empty}>No public conversations yet.</div>
    </div>
  )

  return (
    <div>
      <h2 style={S.sectionTitle}>Public Conversations</h2>
      {rooms.map(room => {
        const chars = (room.characters || []).map(c => c.name).join(', ')
        return (
          <button
            key={room.code}
            style={{ ...S.card, cursor: 'pointer', textAlign: 'left', width: '100%', border: '1px solid #2a2a2a', display: 'block' }}
            onClick={() => onOpenRoom && onOpenRoom(room.code)}
          >
            <div style={{ ...S.cardTitle, marginBottom: '4px' }}>
              {chars || 'Unnamed room'}
            </div>
            <div style={{ fontSize: '12px', color: '#5a5a5a', marginBottom: '6px' }}>
              {room.lastMessagePreview || 'No messages yet'}
            </div>
            <div style={{ fontSize: '11px', color: '#3a3a3a', fontFamily: 'monospace' }}>
              {relativeTime(room.lastActivity || room.createdAt)} · {room.participantCount || 0} participants · {room.code}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── My Conversations section ──────────────────────────────────────────────────

function MyConvosSection({ rooms, strollStateMap = {}, onOpenRoom, onOpenBranchConfig, onContinueStroll, warm = false }) {
  // Palette switches between warm (private library) and dark (public library)
  const divider     = warm ? 'rgba(107, 124, 71, 0.12)' : '#1e1e1e'
  const nameColor   = warm ? '#4a5830'                  : '#8a9a70'
  const tsColor     = warm ? '#a09880'                  : '#4a4a4a'
  const previewColor= warm ? '#8a9a70'                  : '#4a4a4a'
  const hoverBg     = warm ? 'rgba(107, 124, 71, 0.05)' : 'rgba(255,255,255,0.02)'

  if (!rooms) return (
    <div style={{ color: warm ? '#a09880' : '#3a3a3a', fontFamily: warm ? 'Georgia, serif' : 'monospace', fontSize: '13px', padding: '20px 0', opacity: 0.7 }}>
      loading…
    </div>
  )
  if (rooms.length === 0) return (
    <div style={{ color: warm ? '#a09880' : '#3a3a3a', fontFamily: warm ? 'Georgia, serif' : 'monospace', fontSize: '13px', fontStyle: 'italic', padding: '12px 0', opacity: 0.7 }}>
      No conversations yet.
    </div>
  )

  return (
    <div>
      {!warm && <h2 style={S.sectionTitle}>My Conversations</h2>}
      <div style={{ borderTop: `1px solid ${divider}` }}>
        {rooms.map(room => {
          const chars       = (room.characters || []).map(c => c.name).join(', ')
          const displayName = chars || 'Gardener'
          const preview     = room.lastMessagePreview || ''
          const ts          = relativeTime(room.lastActivity || room.createdAt)

          return (
            <button
              key={room.code}
              onClick={() => onOpenRoom && onOpenRoom(room.code)}
              style={{
                display:      'block',
                width:        '100%',
                textAlign:    'left',
                background:   'none',
                border:       'none',
                borderBottom: `1px solid ${divider}`,
                padding:      '14px 2px',
                cursor:       'pointer',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = hoverBg }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
            >
              <div style={{
                display:        'flex',
                justifyContent: 'space-between',
                alignItems:     'baseline',
                gap:            '12px',
                marginBottom:   '3px',
              }}>
                <span style={{
                  fontSize:     warm ? '14px' : '13px',
                  color:        nameColor,
                  fontFamily:   'Georgia, serif',
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                  flexShrink:   1,
                  minWidth:     0,
                }}>
                  {displayName}
                </span>
                <span style={{
                  fontSize:   '11px',
                  color:      tsColor,
                  fontFamily: 'monospace',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}>
                  {ts}
                </span>
              </div>
              {preview && (
                <div style={{
                  fontSize:     '12px',
                  color:        previewColor,
                  overflow:     'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace:   'nowrap',
                  lineHeight:   '1.4',
                  fontFamily:   warm ? 'Georgia, serif' : 'inherit',
                }}>
                  {preview}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Notebook section ──────────────────────────────────────────────────────────

function NotebookSection({ items, userId, isAuthenticated, onRefresh, warm = false }) {
  const [newEntry,    setNewEntry]    = useState('')
  const [editingId,   setEditingId]   = useState(null)
  const [editContent, setEditContent] = useState('')
  const [saving,      setSaving]      = useState(false)

  // Warm-palette overrides for the private library view
  const inputStyle = warm ? {
    width:        '100%',
    minHeight:    '90px',
    background:   'rgba(200, 190, 170, 0.20)',
    border:       '1px solid rgba(107, 124, 71, 0.22)',
    borderRadius: '6px',
    color:        '#4a5830',
    fontFamily:   'Georgia, serif',
    fontSize:     '16px',
    padding:      '12px',
    resize:       'vertical',
    outline:      'none',
    boxSizing:    'border-box',
    marginBottom: '10px',
  } : S.notebookInput

  const cardStyle = warm ? {
    background:   'rgba(200, 190, 170, 0.18)',
    border:       '1px solid rgba(107, 124, 71, 0.14)',
    borderRadius: '6px',
    padding:      '16px 18px',
    marginBottom: '12px',
  } : S.card

  const btnStyle = (variant) => warm ? {
    padding:      '6px 14px',
    background:   variant === 'primary' ? 'rgba(107, 124, 71, 0.12)' : 'transparent',
    border:       `1px solid ${variant === 'primary' ? 'rgba(107, 124, 71, 0.28)' : 'rgba(107, 124, 71, 0.16)'}`,
    borderRadius: '20px',
    color:        variant === 'primary' ? '#4a5830' : '#8a9a70',
    fontFamily:   'Georgia, serif',
    fontSize:     '13px',
    cursor:       'pointer',
    marginRight:  '6px',
  } : S.btn(variant)

  const emptyStyle = warm
    ? { color: '#a09880', fontFamily: 'Georgia, serif', fontSize: '13px', fontStyle: 'italic', padding: '12px 0', opacity: 0.7 }
    : S.empty

  if (!isAuthenticated) {
    return (
      <div style={emptyStyle}>Sign in to see your notes.</div>
    )
  }

  async function handleAdd() {
    if (!newEntry.trim() || !supabase || !userId) return
    setSaving(true)
    const { error } = await supabase.from('notebook_entries').insert({ user_id: userId, content: newEntry.trim() })
    if (!error) { setNewEntry(''); onRefresh() }
    setSaving(false)
  }

  async function handleUpdate(id) {
    if (!editContent.trim() || !supabase) return
    await supabase.from('notebook_entries').update({ content: editContent.trim(), updated_at: new Date().toISOString() }).eq('id', id)
    setEditingId(null)
    onRefresh()
  }

  async function handleDelete(id) {
    if (!supabase) return
    await supabase.from('notebook_entries').delete().eq('id', id)
    onRefresh()
  }

  return (
    <div>
      {!warm && <h2 style={S.sectionTitle}>Notes</h2>}
      <div style={{ marginBottom: '24px' }}>
        <textarea
          value={newEntry}
          onChange={e => setNewEntry(e.target.value)}
          placeholder="New entry…"
          style={inputStyle}
        />
        <button style={btnStyle('primary')} onClick={handleAdd} disabled={saving}>
          {saving ? 'saving…' : 'add entry'}
        </button>
      </div>

      {(!items || items.length === 0) ? (
        <div style={emptyStyle}>No notes yet.</div>
      ) : (
        items.map(item => (
          <div key={item.id} style={cardStyle}>
            {editingId === item.id ? (
              <>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  style={{ ...inputStyle, minHeight: '70px' }}
                />
                <button style={btnStyle('primary')} onClick={() => handleUpdate(item.id)}>save</button>
                <button style={btnStyle()} onClick={() => setEditingId(null)}>cancel</button>
              </>
            ) : (
              <>
                <div style={{
                  fontSize:   '14px',
                  color:      warm ? '#4a5830' : '#b8b3aa',
                  lineHeight: 1.65,
                  whiteSpace: 'pre-wrap',
                  fontFamily: warm ? 'Georgia, serif' : 'inherit',
                }}>
                  {item.content}
                </div>
                <div style={{
                  display:    'flex',
                  gap:        '12px',
                  marginTop:  '10px',
                  fontSize:   '11px',
                  color:      warm ? '#a09880' : '#3a3a3a',
                  fontFamily: 'monospace',
                }}>
                  <span>{new Date(item.created_at).toLocaleString()}</span>
                  <button
                    style={{ background: 'none', border: 'none', color: warm ? '#6b7c47' : '#5a5a5a', cursor: 'pointer', fontFamily: 'monospace', fontSize: '11px', padding: 0 }}
                    onClick={() => { setEditingId(item.id); setEditContent(item.content) }}
                  >edit</button>
                  <button
                    style={{ background: 'none', border: 'none', color: warm ? '#8a4a3a' : '#6a2a2a', cursor: 'pointer', fontFamily: 'monospace', fontSize: '11px', padding: 0 }}
                    onClick={() => handleDelete(item.id)}
                  >delete</button>
                </div>
              </>
            )}
          </div>
        ))
      )}
    </div>
  )
}

// ── Shared report card ────────────────────────────────────────────────────────

function ReportCard({ item }) {
  return (
    <div style={S.card}>
      <div style={{ fontSize: '13px', color: '#b0aaa0', lineHeight: 1.65 }}>
        {typeof item.content === 'object'
          ? <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '11px', color: '#6a6460', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(item.content, null, 2)}
            </pre>
          : String(item.content)}
      </div>
      <div style={S.cardMeta}>
        {item.generated_by && <span>{item.generated_by} · </span>}
        {item.room_id && <span>room {item.room_id.slice(0, 8)} · </span>}
        <span>{new Date(item.created_at).toLocaleString()}</span>
      </div>
    </div>
  )
}
