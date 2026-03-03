/**
 * LibraryScreen.jsx
 *
 * The Library — central repository for governance reports, character constitutions,
 * journal entries, and user private notebooks.
 *
 * Accessible via /library command in any conversation.
 * Public sections: Architecture, Founding Document, Character Constitutions,
 *   Bugs Journal, Weather Journal, Gardener Journal, Governance Reports, Public Conversations
 * Private sections: My Conversations, My Notebook
 */
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../contexts/AuthContext.jsx'

// ── Styles ────────────────────────────────────────────────────────────────────

const S = {
  screen: {
    position:    'fixed',
    inset:       0,
    background:  '#111',
    color:       '#e0dbd0',
    fontFamily:  'Georgia, serif',
    overflowY:   'auto',
    zIndex:      1000,
    display:     'flex',
    flexDirection: 'column',
  },
  header: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        '16px 24px',
    borderBottom:   '1px solid #2a2a2a',
    flexShrink:     0,
  },
  title: {
    fontSize:      '14px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color:         '#6b7c47',
    fontFamily:    'monospace',
    fontWeight:    600,
  },
  closeBtn: {
    background:   'none',
    border:       'none',
    color:        '#5a5a5a',
    fontSize:     '20px',
    cursor:       'pointer',
    padding:      '4px 8px',
    lineHeight:   1,
  },
  body: {
    display:   'flex',
    flex:      1,
    minHeight: 0,
  },
  sidebar: {
    width:        '200px',
    borderRight:  '1px solid #2a2a2a',
    padding:      '20px 0',
    flexShrink:   0,
    overflowY:    'auto',
  },
  sidebarSection: {
    padding:      '8px 16px 4px',
    fontSize:     '10px',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color:        '#444',
    fontFamily:   'monospace',
  },
  sidebarItem: (active) => ({
    display:    'block',
    width:      '100%',
    textAlign:  'left',
    padding:    '7px 16px',
    background: active ? '#1e2a10' : 'none',
    border:     'none',
    color:      active ? '#8faf52' : '#8a8478',
    fontSize:   '13px',
    fontFamily: 'Georgia, serif',
    cursor:     'pointer',
    borderLeft: active ? '2px solid #6b7c47' : '2px solid transparent',
  }),
  content: {
    flex:     1,
    padding:  '24px 32px',
    overflowY: 'auto',
  },
  sectionTitle: {
    fontSize:     '18px',
    color:        '#d4cfc5',
    marginBottom: '20px',
    fontWeight:   'normal',
  },
  card: {
    background:   '#1a1a1a',
    border:       '1px solid #2a2a2a',
    borderRadius: '4px',
    padding:      '16px',
    marginBottom: '12px',
  },
  cardMeta: {
    fontSize:   '11px',
    color:      '#4a4a4a',
    fontFamily: 'monospace',
    marginTop:  '8px',
  },
  loading: {
    color:    '#4a4a4a',
    fontFamily: 'monospace',
    fontSize:  '13px',
  },
  empty: {
    color:    '#3a3a3a',
    fontFamily: 'monospace',
    fontSize:  '13px',
    fontStyle: 'italic',
  },
  notebookInput: {
    width:        '100%',
    minHeight:    '100px',
    background:   '#181818',
    border:       '1px solid #2a2a2a',
    borderRadius: '4px',
    color:        '#e0dbd0',
    fontFamily:   'Georgia, serif',
    fontSize:     '14px',
    padding:      '12px',
    resize:       'vertical',
    outline:      'none',
    boxSizing:    'border-box',
    marginBottom: '10px',
  },
  btn: (variant) => ({
    padding:      '8px 16px',
    background:   variant === 'primary' ? '#4a5a24' : 'transparent',
    border:       `1px solid ${variant === 'primary' ? '#5a6b2e' : '#3a3a3a'}`,
    borderRadius: '4px',
    color:        variant === 'primary' ? '#e8e4dc' : '#6a6a6a',
    fontFamily:   'monospace',
    fontSize:     '12px',
    cursor:       'pointer',
    marginRight:  '8px',
  }),
}

// ── Static architecture text ───────────────────────────────────────────────────

const ARCHITECTURE_TEXT = `Kepos is a multi-character conversation platform with an active governance layer.

The Gardener routes character responses and tends conversation quality. The Weaver detects relevance and manages character weight. Memory persists conversation state across turns.

New agents added in the March 2026 expansion:

GOOSE — Stateless governance signal agent. Honk 1 fires on stroll initiation, writing turn count to agent_signals. Honk 2 fires on /farmer command or governance collapse, collecting state and writing to library_reports.

WEATHER — Stateless atmospheric assessment agent. Reads each turn fresh. Detects wind (productive friction), rain (steady accumulation), frost (premature convergence), drought (energy leaving), tornado watch (apparatus spinning on itself). Writes to weather_state only.

BUGS — Stateless constitutional assessment agent. Reads character responses against the constitutional layer. Detects character drift and false convergence. Releases ladybug signals to the Gardener when aphids are found.

HUX — Border collie. Watches for framework amplification and generic response patterns. Barks go to gardener_memory only. He is always present.

STROLL — A distinct room mode. The Gardener is the only voice. Based on Annie Dillard. Eight seasons across two cycles. Substrate building, not seed planting.

THE LIBRARY — Central repository for all agent reports and human-written journal entries. This screen.`

// ── Main component ────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'architecture',      label: 'Architecture',          group: 'public' },
  { id: 'constitutions',     label: 'Character Constitutions', group: 'public' },
  { id: 'bugs_journal',      label: 'Bugs Journal',          group: 'public' },
  { id: 'weather_journal',   label: 'Weather Journal',       group: 'public' },
  { id: 'gardener_journal',  label: 'Gardener Journal',      group: 'public' },
  { id: 'governance',        label: 'Governance Reports',    group: 'public' },
  { id: 'notebook',          label: 'My Notebook',           group: 'private' },
]

export default function LibraryScreen({ onClose }) {
  const { isAuthenticated, userId } = useAuth()
  const [activeSection, setActiveSection] = useState('architecture')
  const [data, setData]                   = useState({})
  const [loading, setLoading]             = useState(false)

  useEffect(() => {
    loadSection(activeSection)
  }, [activeSection, userId])

  async function loadSection(section) {
    if (!supabase) return
    setLoading(true)
    try {
      if (section === 'architecture') {
        setData(d => ({ ...d, architecture: ARCHITECTURE_TEXT }))
      } else if (section === 'constitutions') {
        const { data: rows } = await supabase
          .from('constitutional_layer')
          .select('*')
          .order('character_name')
        setData(d => ({ ...d, constitutions: rows || [] }))
      } else if (section === 'bugs_journal') {
        const { data: rows } = await supabase
          .from('library_reports')
          .select('*')
          .eq('report_type', 'bugs_data')
          .order('created_at', { ascending: false })
          .limit(50)
        setData(d => ({ ...d, bugs_journal: rows || [] }))
      } else if (section === 'weather_journal') {
        const { data: rows } = await supabase
          .from('library_reports')
          .select('*')
          .eq('report_type', 'weather_report')
          .order('created_at', { ascending: false })
          .limit(50)
        setData(d => ({ ...d, weather_journal: rows || [] }))
      } else if (section === 'gardener_journal') {
        const { data: rows } = await supabase
          .from('library_reports')
          .select('*')
          .eq('report_type', 'gardener_journal')
          .order('created_at', { ascending: false })
          .limit(50)
        setData(d => ({ ...d, gardener_journal: rows || [] }))
      } else if (section === 'governance') {
        const { data: rows } = await supabase
          .from('library_reports')
          .select('*')
          .eq('report_type', 'governance_failure')
          .order('created_at', { ascending: false })
          .limit(50)
        setData(d => ({ ...d, governance: rows || [] }))
      } else if (section === 'notebook' && userId) {
        const { data: rows } = await supabase
          .from('notebook_entries')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
        setData(d => ({ ...d, notebook: rows || [] }))
      }
    } catch (err) {
      console.warn('[Library] loadSection error:', err.message)
    }
    setLoading(false)
  }

  const visibleSections = isAuthenticated
    ? SECTIONS
    : SECTIONS.filter(s => s.group === 'public')

  return (
    <div style={S.screen}>
      <div style={S.header}>
        <span style={S.title}>Library</span>
        <button style={S.closeBtn} onClick={onClose} title="Close Library">✕</button>
      </div>

      <div style={S.body}>
        {/* Sidebar */}
        <div style={S.sidebar}>
          <div style={S.sidebarSection}>Public</div>
          {visibleSections.filter(s => s.group === 'public').map(s => (
            <button
              key={s.id}
              style={S.sidebarItem(activeSection === s.id)}
              onClick={() => setActiveSection(s.id)}
            >
              {s.label}
            </button>
          ))}

          {isAuthenticated && (
            <>
              <div style={{ ...S.sidebarSection, marginTop: 16 }}>Private</div>
              {visibleSections.filter(s => s.group === 'private').map(s => (
                <button
                  key={s.id}
                  style={S.sidebarItem(activeSection === s.id)}
                  onClick={() => setActiveSection(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </>
          )}
        </div>

        {/* Main content */}
        <div style={S.content}>
          {loading && <div style={S.loading}>loading…</div>}

          {!loading && activeSection === 'architecture' && (
            <ArchitectureSection text={data.architecture} />
          )}
          {!loading && activeSection === 'constitutions' && (
            <ConstitutionsSection items={data.constitutions} />
          )}
          {!loading && activeSection === 'bugs_journal' && (
            <ReportSection items={data.bugs_journal} title="Bugs Journal" />
          )}
          {!loading && activeSection === 'weather_journal' && (
            <ReportSection items={data.weather_journal} title="Weather Journal" />
          )}
          {!loading && activeSection === 'gardener_journal' && (
            <ReportSection items={data.gardener_journal} title="Gardener Journal" />
          )}
          {!loading && activeSection === 'governance' && (
            <ReportSection items={data.governance} title="Governance Reports" />
          )}
          {!loading && activeSection === 'notebook' && (
            <NotebookSection
              items={data.notebook}
              userId={userId}
              onRefresh={() => loadSection('notebook')}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Section components ────────────────────────────────────────────────────────

function ArchitectureSection({ text }) {
  return (
    <div>
      <h2 style={S.sectionTitle}>Architecture</h2>
      <div style={{
        whiteSpace:  'pre-wrap',
        lineHeight:  1.7,
        fontSize:    '14px',
        color:       '#c0bab0',
        maxWidth:    '640px',
      }}>
        {text || 'Loading…'}
      </div>
    </div>
  )
}

function ConstitutionsSection({ items }) {
  const { data: allCharacters } = { data: [] } // placeholder — constitutions come from DB

  // Known characters from the system (for placeholder display)
  const KNOWN_CHARACTERS = [
    'Socrates', 'Elon Musk', 'Oprah Winfrey', 'Sun Tzu', 'Marie Curie',
    'Sigmund Freud', 'Warren Buffett', 'Maya Angelou', 'Steve Jobs',
    'Angela Merkel', 'Nikola Tesla', 'Malala Yousafzai',
  ]

  const constitutionMap = {}
  ;(items || []).forEach(c => { constitutionMap[c.character_name] = c })

  return (
    <div>
      <h2 style={S.sectionTitle}>Character Constitutions</h2>
      {KNOWN_CHARACTERS.map(name => {
        const constitution = constitutionMap[name]
        return (
          <div key={name} style={S.card}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#d4cfc5' }}>{name}</div>
            {constitution ? (
              <div>
                {[1,2,3,4,5,6,7].map(i => constitution[`commitment_${i}`] && (
                  <div key={i} style={{ fontSize: '13px', color: '#a0a090', marginBottom: '4px', lineHeight: 1.5 }}>
                    {i}. {constitution[`commitment_${i}`]}
                  </div>
                ))}
                {constitution.endorsed_by && (
                  <div style={S.cardMeta}>
                    Endorsed by {constitution.endorsed_by}
                    {constitution.endorsement_date ? ` · ${constitution.endorsement_date}` : ''}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: '12px', color: '#3a3a3a', fontFamily: 'monospace', fontStyle: 'italic' }}>
                constitution not yet written
              </div>
            )}
          </div>
        )
      })}

      {/* Show any additional constitutions not in the known list */}
      {(items || [])
        .filter(c => !KNOWN_CHARACTERS.includes(c.character_name))
        .map(c => (
          <div key={c.id} style={S.card}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px', color: '#d4cfc5' }}>{c.character_name}</div>
            {[1,2,3,4,5,6,7].map(i => c[`commitment_${i}`] && (
              <div key={i} style={{ fontSize: '13px', color: '#a0a090', marginBottom: '4px' }}>
                {i}. {c[`commitment_${i}`]}
              </div>
            ))}
          </div>
        ))
      }
    </div>
  )
}

function ReportSection({ items, title }) {
  return (
    <div>
      <h2 style={S.sectionTitle}>{title}</h2>
      {(!items || items.length === 0) ? (
        <div style={S.empty}>No entries yet.</div>
      ) : (
        items.map(item => (
          <div key={item.id} style={S.card}>
            <div style={{ fontSize: '13px', color: '#c0bab0', lineHeight: 1.6 }}>
              {typeof item.content === 'object'
                ? <pre style={{ margin: 0, fontFamily: 'monospace', fontSize: '11px', color: '#8a8478', whiteSpace: 'pre-wrap' }}>
                    {JSON.stringify(item.content, null, 2)}
                  </pre>
                : String(item.content)
              }
            </div>
            <div style={S.cardMeta}>
              {item.generated_by} · {item.room_id ? `room ${item.room_id.slice(0, 8)}` : 'no room'} · {new Date(item.created_at).toLocaleString()}
            </div>
          </div>
        ))
      )}
    </div>
  )
}

function NotebookSection({ items, userId, onRefresh }) {
  const [newEntry,    setNewEntry]    = useState('')
  const [editingId,   setEditingId]   = useState(null)
  const [editContent, setEditContent] = useState('')
  const [saving,      setSaving]      = useState(false)

  async function handleAdd() {
    if (!newEntry.trim() || !supabase || !userId) return
    setSaving(true)
    const { error } = await supabase.from('notebook_entries').insert({
      user_id: userId,
      content: newEntry.trim(),
    })
    if (!error) { setNewEntry(''); onRefresh() }
    setSaving(false)
  }

  async function handleUpdate(id) {
    if (!editContent.trim() || !supabase) return
    await supabase.from('notebook_entries').update({
      content:    editContent.trim(),
      updated_at: new Date().toISOString(),
    }).eq('id', id)
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
      <h2 style={S.sectionTitle}>My Notebook</h2>

      <div style={{ marginBottom: '24px' }}>
        <textarea
          value={newEntry}
          onChange={e => setNewEntry(e.target.value)}
          placeholder="New entry…"
          style={S.notebookInput}
        />
        <button
          style={S.btn('primary')}
          onClick={handleAdd}
          disabled={saving}
        >
          {saving ? 'saving…' : 'add entry'}
        </button>
      </div>

      {(!items || items.length === 0) ? (
        <div style={S.empty}>No notebook entries yet.</div>
      ) : (
        items.map(item => (
          <div key={item.id} style={S.card}>
            {editingId === item.id ? (
              <>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  style={{ ...S.notebookInput, minHeight: '80px' }}
                />
                <button style={S.btn('primary')} onClick={() => handleUpdate(item.id)}>save</button>
                <button style={S.btn()} onClick={() => setEditingId(null)}>cancel</button>
              </>
            ) : (
              <>
                <div style={{ fontSize: '14px', color: '#c0bab0', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                  {item.content}
                </div>
                <div style={{ ...S.cardMeta, display: 'flex', gap: '12px', marginTop: '10px' }}>
                  <span>{new Date(item.created_at).toLocaleString()}</span>
                  <button
                    style={{ background: 'none', border: 'none', color: '#5a5a5a', cursor: 'pointer', fontFamily: 'monospace', fontSize: '11px', padding: 0 }}
                    onClick={() => { setEditingId(item.id); setEditContent(item.content) }}
                  >
                    edit
                  </button>
                  <button
                    style={{ background: 'none', border: 'none', color: '#7a2a2a', cursor: 'pointer', fontFamily: 'monospace', fontSize: '11px', padding: 0 }}
                    onClick={() => handleDelete(item.id)}
                  >
                    delete
                  </button>
                </div>
              </>
            )}
          </div>
        ))
      )}
    </div>
  )
}
