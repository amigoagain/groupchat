/**
 * TranscriptImportModal.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin tool for seeding a room from a copied Kepos transcript.
 *
 * Flow:
 *   1. Paste  — accept raw transcript text, parse it
 *   2. Config — confirm detected room/chars, look up target user by email
 *   3. Import — create room, insert messages
 *   4. Done   — show room code for sharing
 *
 * Only accessible through the DevPanel (isDevUser gate).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { createRoom, ensureParticipant } from '../utils/roomUtils.js'
import { insertMessages } from '../utils/messageUtils.js'
import { loadAllCharacters, saveCustomCharacter } from '../utils/customCharacters.js'
import { generateCharacterFromTranscript } from '../services/claudeApi.js'

// ── Transcript parser ──────────────────────────────────────────────────────────

/**
 * Parse a Kepos transcript string into structured data.
 * Returns null if the text doesn't look like a valid transcript.
 */
function parseTranscript(text) {
  const lines = text.split('\n')

  // Locate the two header delimiter lines
  const firstDash  = lines.findIndex(l => l.trim() === '--- Kepos Room Transcript ---')
  const secondDash = lines.findIndex((l, i) => i > firstDash && l.trim() === '---')

  if (firstDash === -1 || secondDash === -1) return null

  // Extract header fields
  let roomName = '', mode = 'chat', charNames = []
  for (let i = firstDash + 1; i < secondDash; i++) {
    const line = lines[i]
    if (line.startsWith('Room:'))        roomName  = line.slice(5).trim()
    if (line.startsWith('Mode:'))        mode      = line.slice(5).trim().toLowerCase()
    if (line.startsWith('Characters:'))  charNames = line.slice(11).split(',').map(s => s.trim()).filter(Boolean)
  }

  // Parse message lines — format: [HH:MM] SenderName: content
  const msgPattern = /^\[([^\]]+)\]\s+([^:]+):\s*(.*)$/
  const messages = []
  let currentMsg = null

  for (let i = secondDash + 1; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('---')) break      // end-of-transcript marker

    const match = line.match(msgPattern)
    if (match) {
      if (currentMsg) messages.push(currentMsg)
      currentMsg = { senderName: match[2].trim(), content: match[3] }
    } else if (currentMsg) {
      // Continuation line (multi-line message content)
      currentMsg.content += '\n' + line
    }
  }
  if (currentMsg) messages.push(currentMsg)

  // Trim trailing whitespace from all message content
  messages.forEach(m => { m.content = m.content.trimEnd() })

  return { roomName, mode, charNames, messages }
}

// ── Fallback character colors ──────────────────────────────────────────────────

const CHAR_COLORS  = ['#6b7c47', '#7a6247', '#5a6b8a', '#7a5a6b', '#4a6b6a', '#6b6a47']

function makeGenericChar(name, index) {
  return {
    id:              `imported-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    name,
    color:           CHAR_COLORS[index % CHAR_COLORS.length],
    initial:         name[0]?.toUpperCase() || '?',
    isCustom:        false,
    personality:     `${name} — imported character.`,
    personalityText: '',
  }
}

// ── Shared styles ──────────────────────────────────────────────────────────────

const S = {
  overlay: {
    position:             'fixed',
    inset:                0,
    zIndex:               10000,
    background:           'rgba(20, 25, 12, 0.72)',
    display:              'flex',
    alignItems:           'center',
    justifyContent:       'center',
    padding:              '20px',
    backdropFilter:       'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
  },
  card: {
    background:   '#f8f5ee',
    borderRadius: '16px',
    padding:      '28px 28px 24px',
    width:        '100%',
    maxWidth:     '520px',
    maxHeight:    '86vh',
    overflowY:    'auto',
    boxShadow:    '0 8px 40px rgba(0,0,0,0.35)',
    fontFamily:   'Georgia, serif',
    color:        '#2c3820',
    boxSizing:    'border-box',
  },
  label: {
    display:       'block',
    fontSize:      '11px',
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color:         '#7a8a6a',
    fontFamily:    'system-ui, sans-serif',
    marginBottom:  '6px',
  },
  input: {
    width:        '100%',
    background:   'rgba(107,124,71,0.07)',
    border:       '1.5px solid rgba(107,124,71,0.22)',
    borderRadius: '8px',
    padding:      '9px 12px',
    fontSize:     '14px',
    fontFamily:   'Georgia, serif',
    color:        '#2c3820',
    outline:      'none',
    boxSizing:    'border-box',
  },
  primaryBtn: {
    background:   '#4a5a24',
    color:        '#fff',
    border:       'none',
    borderRadius: '8px',
    padding:      '10px 22px',
    fontSize:     '14px',
    fontFamily:   'Georgia, serif',
    cursor:       'pointer',
  },
  secondaryBtn: {
    background:   'transparent',
    color:        '#6b7c47',
    border:       '1.5px solid rgba(107,124,71,0.3)',
    borderRadius: '8px',
    padding:      '9px 18px',
    fontSize:     '14px',
    fontFamily:   'Georgia, serif',
    cursor:       'pointer',
  },
  infoBox: {
    background:   'rgba(107,124,71,0.08)',
    borderRadius: '8px',
    padding:      '12px 14px',
    marginBottom: '20px',
    fontSize:     '13px',
    fontFamily:   'system-ui, sans-serif',
    color:        '#4a5a30',
    lineHeight:   1.7,
  },
  previewBox: {
    background:   'rgba(0,0,0,0.04)',
    borderRadius: '8px',
    padding:      '10px 12px',
    fontSize:     '13px',
    fontFamily:   'system-ui, sans-serif',
    lineHeight:   1.6,
  },
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TranscriptImportModal({ onClose }) {
  const [step,           setStep]           = useState('paste')
  const [rawText,        setRawText]        = useState('')
  const [parsed,         setParsed]         = useState(null)
  const [parseError,     setParseError]     = useState('')

  const [targetEmail,    setTargetEmail]    = useState('')
  const [targetUser,     setTargetUser]     = useState(null)
  const [lookupState,    setLookupState]    = useState('idle') // idle | loading | found | notfound

  const [dbChars,        setDbChars]        = useState([])
  const [charMap,        setCharMap]        = useState({})    // charName → character object
  const [genState,       setGenState]       = useState({})    // charName → 'idle'|'generating'|'done'|'error'
  const [generatedNames, setGeneratedNames] = useState(new Set()) // names generated this session

  const [importStatus,   setImportStatus]   = useState('')
  const [importError,    setImportError]    = useState('')
  const [importedCode,   setImportedCode]   = useState('')

  // ── Step 1: Parse ────────────────────────────────────────────────────────────

  const handleParse = useCallback(async () => {
    setParseError('')
    const result = parseTranscript(rawText.trim())

    if (!result) {
      setParseError('Could not parse. Paste a full Kepos transcript starting with "--- Kepos Room Transcript ---".')
      return
    }
    if (result.messages.length === 0) {
      setParseError('No messages found in transcript.')
      return
    }

    // Load all DB characters and auto-match by name
    const all = await loadAllCharacters()
    setDbChars(all)

    const map = {}
    result.charNames.forEach((name, i) => {
      const hit = all.find(c => c.name.toLowerCase() === name.toLowerCase())
      map[name]  = hit || makeGenericChar(name, i)
    })

    setCharMap(map)
    setParsed(result)
    setStep('configure')
  }, [rawText])

  // ── Step 2: Look up target user ──────────────────────────────────────────────

  const handleLookupUser = useCallback(async () => {
    if (!targetEmail.trim() || !supabase) return
    setLookupState('loading')
    setTargetUser(null)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, username, email, auth_id')
        .ilike('email', targetEmail.trim())
        .limit(1)

      if (error || !data || data.length === 0) { setLookupState('notfound'); return }
      setTargetUser(data[0])
      setLookupState('found')
    } catch { setLookupState('notfound') }
  }, [targetEmail])

  // ── Generate character from transcript ───────────────────────────────────────

  const handleGenerateChar = useCallback(async (charName) => {
    if (!parsed) return
    setGenState(prev => ({ ...prev, [charName]: 'generating' }))
    try {
      // Extract this character's dialogue lines from the transcript
      const lines = parsed.messages
        .filter(m => m.senderName.toLowerCase() === charName.toLowerCase())
        .map(m => m.content)

      // Generate a full profile grounded in their actual voice
      const profile = await generateCharacterFromTranscript(charName, lines)

      // Build character object matching the autoCreateGardenerCharacter pattern
      const id   = `gardener_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
      const char = {
        id,
        name:            charName,
        title:           profile.title,
        initial:         charName.charAt(0).toUpperCase(),
        color:           profile.color,
        description:     profile.personality.split('. ').slice(0, 2).join('. ') + '.',
        personality:     profile.personality,
        personalityText: profile.personality,
        isCustom:        false,
        isCanonical:     false,
        isVariant:       false,
        verified:        false,
        tags:            profile.tags || [],
        createdBy:       'gardener',
        upvotes:         0,
      }

      // Persist to Supabase + localStorage
      await saveCustomCharacter(char)

      // Update charMap + tracking so the room import uses the real char
      setCharMap(prev => ({ ...prev, [charName]: char }))
      setDbChars(prev => [...prev, char])
      setGeneratedNames(prev => new Set([...prev, charName]))
      setGenState(prev => ({ ...prev, [charName]: 'done' }))
    } catch (err) {
      console.error('[TranscriptImport] char generation failed:', err)
      setGenState(prev => ({ ...prev, [charName]: 'error' }))
    }
  }, [parsed])

  // ── Step 3: Import ───────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!parsed || !targetUser) return
    setStep('importing')
    setImportError('')

    try {
      const charNameSet  = new Set(parsed.charNames.map(n => n.toLowerCase()))
      const characters   = parsed.charNames.map(name => charMap[name]).filter(Boolean)

      // Create the room owned by the target user
      setImportStatus('Creating room…')
      const modeObj  = { name: parsed.mode.includes('stroll') ? 'stroll' : 'chat' }
      const dispName = targetUser.username || targetUser.email.split('@')[0]
      const room     = await createRoom(modeObj, characters, dispName, targetUser.id, 'private', null)

      // Register as admin participant
      await ensureParticipant(room.id, String(targetUser.id), dispName, true)

      // Shape messages for batch insert
      setImportStatus(`Inserting ${parsed.messages.length} messages…`)

      const appMessages = parsed.messages.map(m => {
        const nameLower      = m.senderName.toLowerCase()
        const isCharacter    = charNameSet.has(nameLower)
        const matchedCharKey = parsed.charNames.find(n => n.toLowerCase() === nameLower)
        const char           = matchedCharKey ? charMap[matchedCharKey] : null

        return {
          type:             isCharacter ? 'character' : 'user',
          senderName:       m.senderName,
          senderId:         isCharacter ? (char?.id || m.senderName) : String(targetUser.id),
          characterName:    isCharacter ? m.senderName : undefined,
          characterColor:   char?.color || '#6b7c47',
          characterInitial: char?.initial || m.senderName[0]?.toUpperCase() || '?',
          content:          m.content,
          timestamp:        new Date().toISOString(),
          isError:          false,
          metadata:         null,
        }
      })

      await insertMessages(appMessages, room.id)

      setImportedCode(room.code)
      setStep('done')
    } catch (err) {
      console.error('[TranscriptImport]', err)
      setImportError(err.message || 'Import failed. Check the console for details.')
      setStep('error')
    }
  }, [parsed, targetUser, charMap])

  // ── Render ───────────────────────────────────────────────────────────────────

  const stepLabel = {
    paste:      'Paste a Kepos room transcript',
    configure:  parsed ? `${parsed.messages.length} messages · ${parsed.charNames.length} character(s) detected` : '',
    importing:  'Working…',
    done:       'Room created successfully',
    error:      'Import failed',
  }

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={S.card}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '4px' }}>Import Transcript</div>
            <div style={{ fontSize: '13px', color: '#7a8a6a', fontFamily: 'system-ui, sans-serif' }}>
              {stepLabel[step]}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', fontSize: '22px', color: '#9a9a8a', cursor: 'pointer', padding: '0 4px', lineHeight: 1 }}>×</button>
        </div>

        {/* ── PASTE ── */}
        {step === 'paste' && (
          <>
            <span style={S.label}>Paste transcript</span>
            <textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder={'--- Kepos Room Transcript ---\nRoom: …\nCharacters: …\n---\n[10:00] Character: …\n--- End Transcript ---'}
              style={{ ...S.input, minHeight: '200px', resize: 'vertical', lineHeight: 1.5 }}
              autoFocus
            />
            {parseError && (
              <div style={{ marginTop: '10px', color: '#b05a3a', fontSize: '13px', fontFamily: 'system-ui, sans-serif' }}>
                {parseError}
              </div>
            )}
            <div style={{ marginTop: '16px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button style={S.secondaryBtn} onClick={onClose}>Cancel</button>
              <button style={{ ...S.primaryBtn, opacity: rawText.trim() ? 1 : 0.45 }} onClick={handleParse} disabled={!rawText.trim()}>
                Parse →
              </button>
            </div>
          </>
        )}

        {/* ── CONFIGURE ── */}
        {step === 'configure' && parsed && (
          <>
            {/* Detected metadata */}
            <div style={S.infoBox}>
              <strong>Room:</strong> {parsed.roomName || '(unnamed)'}<br />
              <strong>Mode:</strong> {parsed.mode}<br />
              <strong>Characters:</strong> {parsed.charNames.join(', ') || '(none detected)'}<br />
              <strong>Messages:</strong> {parsed.messages.length}
            </div>

            {/* Character matching */}
            {parsed.charNames.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <span style={S.label}>Character matching</span>
                {parsed.charNames.map(name => {
                  const char       = charMap[name]
                  const wasInDb    = dbChars.some(c => c.name.toLowerCase() === name.toLowerCase() && !generatedNames.has(name))
                  const isGenerated = generatedNames.has(name)
                  const gs          = genState[name] || 'idle'

                  return (
                    <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '50%',
                        background: char?.color || '#aaa',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: '12px', fontWeight: 600, flexShrink: 0,
                        transition: 'background 0.3s',
                      }}>
                        {char?.initial || name[0]}
                      </div>
                      <span style={{ fontSize: '14px', flex: 1 }}>{name}</span>

                      {/* Status / action */}
                      {wasInDb ? (
                        <span style={{ fontSize: '12px', fontFamily: 'system-ui, sans-serif', color: '#5a7a3a' }}>
                          ✓ matched
                        </span>
                      ) : isGenerated || gs === 'done' ? (
                        <span style={{ fontSize: '12px', fontFamily: 'system-ui, sans-serif', color: '#5a7a3a' }}>
                          ✓ generated &amp; saved
                        </span>
                      ) : gs === 'generating' ? (
                        <span style={{ fontSize: '12px', fontFamily: 'system-ui, sans-serif', color: '#7a8a6a', fontStyle: 'italic' }}>
                          generating…
                        </span>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px' }}>
                          <button
                            onClick={() => handleGenerateChar(name)}
                            style={{
                              background:   '#4a5a24',
                              color:        '#fff',
                              border:       'none',
                              borderRadius: '6px',
                              padding:      '4px 12px',
                              fontSize:     '12px',
                              fontFamily:   'system-ui, sans-serif',
                              cursor:       'pointer',
                            }}
                          >
                            {gs === 'error' ? 'Retry' : 'Generate'}
                          </button>
                          {gs === 'error' && (
                            <span style={{ fontSize: '11px', color: '#b05a3a', fontFamily: 'system-ui, sans-serif' }}>failed — try again</span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Message preview */}
            <div style={{ marginBottom: '20px' }}>
              <span style={S.label}>Message preview</span>
              <div style={S.previewBox}>
                {parsed.messages.slice(0, 4).map((m, i) => (
                  <div key={i} style={{ marginBottom: i < 3 ? '6px' : 0, color: '#3a4a2a' }}>
                    <strong>{m.senderName}:</strong>{' '}
                    <span style={{ color: '#5a6a4a' }}>
                      {m.content.slice(0, 90)}{m.content.length > 90 ? '…' : ''}
                    </span>
                  </div>
                ))}
                {parsed.messages.length > 4 && (
                  <div style={{ color: '#8a9a7a', marginTop: '6px' }}>
                    …and {parsed.messages.length - 4} more
                  </div>
                )}
              </div>
            </div>

            {/* Target user */}
            <div style={{ marginBottom: '24px' }}>
              <span style={S.label}>Assign to account</span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="email"
                  value={targetEmail}
                  onChange={e => { setTargetEmail(e.target.value); setLookupState('idle'); setTargetUser(null) }}
                  onKeyDown={e => e.key === 'Enter' && handleLookupUser()}
                  placeholder="user@example.com"
                  style={{ ...S.input, flex: 1 }}
                />
                <button
                  style={{ ...S.secondaryBtn, whiteSpace: 'nowrap' }}
                  onClick={handleLookupUser}
                  disabled={!targetEmail.trim() || lookupState === 'loading'}
                >
                  {lookupState === 'loading' ? '…' : 'Look up'}
                </button>
              </div>
              {lookupState === 'found' && targetUser && (
                <div style={{ marginTop: '6px', fontSize: '13px', fontFamily: 'system-ui, sans-serif', color: '#5a7a3a' }}>
                  ✓ Found: <strong>{targetUser.username || '(no username)'}</strong> — {targetUser.email}
                </div>
              )}
              {lookupState === 'notfound' && (
                <div style={{ marginTop: '6px', fontSize: '13px', fontFamily: 'system-ui, sans-serif', color: '#b05a3a' }}>
                  No account found with that email.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button style={S.secondaryBtn} onClick={() => setStep('paste')}>← Back</button>
              <button
                style={{ ...S.primaryBtn, opacity: targetUser ? 1 : 0.4 }}
                onClick={handleImport}
                disabled={!targetUser}
              >
                Import {parsed.messages.length} messages →
              </button>
            </div>
          </>
        )}

        {/* ── IMPORTING ── */}
        {step === 'importing' && (
          <div style={{ textAlign: 'center', padding: '36px 0', fontFamily: 'system-ui, sans-serif', color: '#5a6a4a' }}>
            <div style={{ fontSize: '30px', marginBottom: '14px', letterSpacing: '0.2em' }}>· · ·</div>
            <div style={{ fontSize: '14px' }}>{importStatus || 'Working…'}</div>
          </div>
        )}

        {/* ── DONE ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>✓</div>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '6px' }}>Room created</div>
            <div style={{ fontSize: '13px', fontFamily: 'system-ui, sans-serif', color: '#7a8a6a', marginBottom: '20px' }}>
              The transcript is seeded. The user will see it in their Library and can continue the conversation.
            </div>
            <div style={{
              display: 'inline-block',
              background: 'rgba(107,124,71,0.10)',
              borderRadius: '10px',
              padding: '10px 22px',
              marginBottom: '24px',
            }}>
              <div style={{ fontSize: '11px', color: '#7a8a6a', fontFamily: 'system-ui, sans-serif', marginBottom: '4px', letterSpacing: '0.07em', textTransform: 'uppercase' }}>Room code</div>
              <div style={{ fontSize: '22px', letterSpacing: '0.14em', fontWeight: 700, color: '#2c3820' }}>{importedCode}</div>
            </div>
            <div>
              <button style={S.primaryBtn} onClick={onClose}>Done</button>
            </div>
          </div>
        )}

        {/* ── ERROR ── */}
        {step === 'error' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '28px', marginBottom: '10px' }}>✕</div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: '#b05a3a', marginBottom: '8px' }}>Import failed</div>
            <div style={{ fontSize: '13px', fontFamily: 'system-ui, sans-serif', color: '#7a6a5a', marginBottom: '22px', wordBreak: 'break-word' }}>
              {importError}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button style={S.secondaryBtn} onClick={() => setStep('configure')}>← Back</button>
              <button style={S.primaryBtn} onClick={onClose}>Close</button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
