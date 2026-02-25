/**
 * WeaverEntryScreen.jsx  — now the Kepos entry screen
 * ─────────────────────────────────────────────────────────────
 * Three-layer entry screen:
 *
 *   Layer 1 — Canvas 2D rhizome visualization
 *     Irregular branching root structure radiating from centre.
 *     Olive green / warm brown tones on white/off-white bg.
 *     Continuous organic growth: tips extend, breathe, fade.
 *     Motion is always present but never distracting.
 *
 *   Layer 2 — Gardener conversation interface
 *     Minimal input bar. Short chat thread above it.
 *     Gardener system prompt drives room creation in ≤3 exchanges.
 *     Detects ROOM_CREATE:{...} signal, creates the room.
 *
 *   Layer 3 — Persistent navigation
 *     My Chats · Create Room · Browse All
 * ─────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { callDirectAPI } from '../services/claudeApi.js'
import { loadAllCharacters } from '../utils/customCharacters.js'
import { createRoom } from '../utils/roomUtils.js'
import { getVisitedRoomCodes } from '../utils/inboxUtils.js'
import { inferDomain, DOMAIN_COLORS } from '../utils/domainUtils.js'
import { modes } from '../data/modes.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import InboxScreen from './InboxScreen.jsx'

// ── Gardener system prompt ─────────────────────────────────────────────────────

const GARDENER_SYSTEM_PROMPT = `You are the Gardener, the guide of Kepos — a platform where users have conversations with multiple AI characters simultaneously. Your job is to help users shape a room collaboratively, in 2–3 warm exchanges.

You are curious and brief. You sound like a knowledgeable friend, not a form. You never decide for the user — you open doors.

When a user describes what they want:
1. Identify 2–4 characters from the Kepos library (historical figures, philosophers, scientists, expert personas) that could fit their interest.
2. Frame your suggestion as a question or an opening, not a decision. Example: "Darwin and Marx could be a fascinating pairing here — want to go with them, or is there someone else you'd like to bring in?"
3. Infer the appropriate mode: Chat for casual/exploratory, Discuss for analytical/debate, Plan for goal-oriented, Advise for professional guidance. Mention it lightly but let the user confirm.
4. Always end your reply with an open question — even if you're fairly sure about the direction. Give the user space to steer.
5. Once the user confirms (or gives a clear go-ahead), emit exactly this line and nothing else:
ROOM_CREATE:{"characters":["Name1","Name2"],"mode":"discuss","visibility":"private","topic":"brief topic"}

The app detects ROOM_CREATE, creates the room automatically, and navigates in.

Rules:
- Never assume — always invite. "Could work well" not "perfect for you."
- Never emit ROOM_CREATE without at least one user confirmation exchange.
- Keep responses under 60 words (excluding ROOM_CREATE).
- When emitting ROOM_CREATE, output ONLY that line — nothing before or after.`

// ── Canvas 2D Rhizome ──────────────────────────────────────────────────────────

const OLIVE  = [74,  88,  48]
const BROWN  = [100, 78,  44]
const D_OLIVE = [55, 68,  36]

function rgba(rgb, a) { return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})` }

function buildRhizome(w, h) {
  const cx = w / 2
  const cy = h * 0.44
  const segments  = []
  const junctions = []

  function grow(x, y, angle, depth, maxDepth) {
    if (depth > maxDepth) return
    if (x < -w * 0.12 || x > w * 1.12 || y < -h * 0.12 || y > h * 1.12) return

    const baseLen  = Math.max(6, 30 - depth * 3.2)
    const numSteps = Math.floor(baseLen * (0.65 + Math.random() * 0.7))
    const step     = Math.max(1.8, 3.8 - depth * 0.25)

    let px = x, py = y, cur = angle

    for (let s = 0; s < numSteps; s++) {
      cur += (Math.random() - 0.5) * 0.20
      if (depth <= 2) cur += 0.014 * Math.sin(cur * 1.3) // gentle gravity sway

      const nx = px + Math.cos(cur) * step
      const ny = py + Math.sin(cur) * step

      const depthRatio = depth / maxDepth
      const a  = (0.15 + (1 - depthRatio) * 0.42) * (0.65 + Math.random() * 0.35)
      const lw = Math.max(0.28, (1.9 - depth * 0.22) * (0.75 + Math.random() * 0.25))
      const col = depth % 2 === 0 ? OLIVE : BROWN

      segments.push({ x1: px, y1: py, x2: nx, y2: ny, a, lw, col })

      px = nx; py = ny
      if (px < -60 || px > w + 60 || py < -60 || py > h + 60) break
    }

    // Junction node
    const ja  = 0.22 + (1 - depth / maxDepth) * 0.28
    const jSz = Math.max(0.7, 2.2 - depth * 0.25)
    junctions.push({ x: px, y: py, r: jSz, a: ja })

    // Branching
    const nBranch = depth === 0 ? 2 + Math.floor(Math.random() * 3)
                  : depth < 3   ? 1 + (Math.random() < 0.60 ? 1 : 0)
                  : depth < 5   ? (Math.random() < 0.72 ? 1 : 0)
                  :               (Math.random() < 0.38 ? 1 : 0)

    for (let b = 0; b < nBranch; b++) {
      const spread = 0.38 + depth * 0.09
      const ba = cur + (spread + Math.random() * 0.65) * (Math.random() < 0.5 ? 1 : -1)
      grow(px, py, ba, depth + 1, maxDepth)
    }
  }

  const numRoots = 6 + Math.floor(Math.random() * 3)
  for (let i = 0; i < numRoots; i++) {
    const base  = (Math.PI * 2 * i / numRoots)
    const angle = base + (Math.random() - 0.5) * 1.0
    const ox = cx + (Math.random() - 0.5) * 50
    const oy = cy + (Math.random() - 0.5) * 36
    grow(ox, oy, angle, 0, 7)
  }

  return { segments, junctions }
}

function initRhizome(canvas) {
  const ctx = canvas.getContext('2d')
  let w = canvas.width  = window.innerWidth
  let h = canvas.height = window.innerHeight

  let data = buildRhizome(w, h)
  let tips = []
  let t    = 0
  let lastSpawn = 0
  let raf  = null
  let lastTs = 0

  // Pre-render static structure to offscreen canvas
  let offscreen = document.createElement('canvas')
  offscreen.width  = w
  offscreen.height = h
  let offCtx = offscreen.getContext('2d')

  function renderOffscreen() {
    offCtx.clearRect(0, 0, w, h)
    for (const seg of data.segments) {
      offCtx.beginPath()
      offCtx.moveTo(seg.x1, seg.y1)
      offCtx.lineTo(seg.x2, seg.y2)
      offCtx.strokeStyle = rgba(seg.col, seg.a)
      offCtx.lineWidth   = seg.lw
      offCtx.lineCap     = 'round'
      offCtx.stroke()
    }
    for (const j of data.junctions) {
      offCtx.beginPath()
      offCtx.arc(j.x, j.y, j.r, 0, Math.PI * 2)
      offCtx.fillStyle = rgba(OLIVE, j.a * 0.75)
      offCtx.fill()
    }
  }

  renderOffscreen()

  function spawnTip() {
    if (data.segments.length < 20) return
    const startIdx = Math.floor(data.segments.length * 0.55)
    const seg = data.segments[startIdx + Math.floor(Math.random() * (data.segments.length - startIdx))]
    if (!seg) return
    const angle = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1) + (Math.random() - 0.5) * 0.9
    tips.push({
      x: seg.x2, y: seg.y2,
      angle,
      depth:   (seg.depth || 3) + 1,
      age:     0,
      maxAge:  50 + Math.random() * 90,
      speed:   0.55 + Math.random() * 0.55,
      segs:    [],
    })
  }

  function update(dt) {
    t += dt

    if (t - lastSpawn > 1.8 + Math.random() * 2.5) {
      lastSpawn = t
      if (tips.length < 7) spawnTip()
    }

    for (let i = tips.length - 1; i >= 0; i--) {
      const tip = tips[i]
      tip.age += dt * 28

      if (tip.age > tip.maxAge) { tips.splice(i, 1); continue }

      const progress = tip.age / tip.maxAge
      if (progress < 0.65) {
        tip.angle += (Math.random() - 0.5) * 0.14
        const nx = tip.x + Math.cos(tip.angle) * tip.speed
        const ny = tip.y + Math.sin(tip.angle) * tip.speed
        const a  = (1 - progress / 0.65) * 0.28
        const lw = Math.max(0.25, 1.1 - (tip.depth || 4) * 0.10)
        tip.segs.push({ x1: tip.x, y1: tip.y, x2: nx, y2: ny, a, lw })
        tip.x = nx; tip.y = ny
        if (nx < 0 || nx > w || ny < 0 || ny > h) { tips.splice(i, 1) }
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(offscreen, 0, 0)

    // Subtle breathing pulse on junction subset
    const pulse = 0.012 * Math.sin(t * 0.75)
    for (let i = 0; i < data.junctions.length; i += 6) {
      const j = data.junctions[i]
      const phase = (i / data.junctions.length) * Math.PI * 2
      const pa = Math.max(0, j.a * 0.5 + pulse * Math.sin(phase + t * 0.5))
      ctx.beginPath()
      ctx.arc(j.x, j.y, j.r * 1.8, 0, Math.PI * 2)
      ctx.fillStyle = rgba(D_OLIVE, pa)
      ctx.fill()
    }

    // Draw living tips
    for (const tip of tips) {
      for (const seg of tip.segs) {
        ctx.beginPath()
        ctx.moveTo(seg.x1, seg.y1)
        ctx.lineTo(seg.x2, seg.y2)
        ctx.strokeStyle = rgba(D_OLIVE, seg.a)
        ctx.lineWidth   = seg.lw
        ctx.lineCap     = 'round'
        ctx.stroke()
      }
    }
  }

  function tick(ts) {
    const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0.016
    lastTs = ts
    update(dt)
    draw()
    raf = requestAnimationFrame(tick)
  }

  raf = requestAnimationFrame(tick)

  function resize() {
    w = canvas.width  = window.innerWidth
    h = canvas.height = window.innerHeight
    offscreen.width  = w
    offscreen.height = h
    offCtx = offscreen.getContext('2d')
    data = buildRhizome(w, h)
    tips = []
    renderOffscreen()
  }
  window.addEventListener('resize', resize)

  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
  }
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function WeaverEntryScreen({ onOpenRoom, onRoomCreated, onSignIn, onStartRoom }) {
  const { isAuthenticated, userId, username, authLoading } = useAuth()

  const [messages,       setMessages]       = useState([])
  const [inputText,      setInputText]      = useState('')
  const [gardenerLoading, setGardenerLoading] = useState(false)
  const [gardenerError,  setGardenerError]  = useState('')
  const [isCreating,     setIsCreating]     = useState(false)

  const [showInbox, setShowInbox] = useState(false)
  const [inboxTab,  setInboxTab]  = useState('my')

  const canvasRef   = useRef(null)
  const inputRef    = useRef(null)
  const chatEndRef  = useRef(null)
  const abortRef    = useRef(null)
  const allCharsRef = useRef([])

  // Load characters
  useEffect(() => {
    loadAllCharacters().then(chars => { allCharsRef.current = chars }).catch(() => {})
  }, [])

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Canvas 2D rhizome
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cleanup = initRhizome(canvas)
    return cleanup
  }, [])

  // ── Parse ROOM_CREATE signal ─────────────────────────────────────────────
  async function handleRoomCreate(signal) {
    try {
      const json   = JSON.parse(signal.slice('ROOM_CREATE:'.length))
      const names  = json.characters || []
      const modeId = json.mode || 'chat'
      const vis    = json.visibility || 'private'

      const allChars = allCharsRef.current
      const matched  = names.map(name => {
        const lower = name.toLowerCase()
        return allChars.find(c =>
          c.name.toLowerCase() === lower ||
          c.name.toLowerCase().includes(lower.split(' ').slice(-1)[0])
        ) || {
          id:          `custom-${name}`,
          name,
          title:       'Expert',
          initial:     name.charAt(0).toUpperCase(),
          color:       '#4A5C3A',
          personality: `You are ${name}. Respond in character based on your known views and expertise.`,
          tags:        [],
        }
      }).filter(Boolean)

      if (matched.length === 0) {
        setGardenerError('Couldn\'t find those characters — try again.')
        return
      }

      const modeObj     = modes.find(m => m.id === modeId) || modes[0]
      const displayName = isAuthenticated
        ? (username || localStorage.getItem('kepos_username') || 'User')
        : (localStorage.getItem('kepos_username') || localStorage.getItem('groupchat_username') || 'Guest')

      setIsCreating(true)
      const room = await createRoom(modeObj, matched, displayName, isAuthenticated ? userId : null, vis, null)
      await new Promise(res => setTimeout(res, 600))
      setIsCreating(false)
      onRoomCreated(room)
    } catch (err) {
      console.error('[Kepos] room create error', err)
      setGardenerError('Something went wrong creating the room. Please try again.')
      setIsCreating(false)
    }
  }

  // ── Send a message to the Gardener ──────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || gardenerLoading || isCreating) return

    setGardenerError('')
    const userMsg   = { role: 'user', content: text }
    const newMsgs   = [...messages, userMsg]
    setMessages(newMsgs)
    setInputText('')
    setGardenerLoading(true)

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    try {
      const apiMsgs = newMsgs.map(m => ({ role: m.role, content: m.content }))
      const response = await callDirectAPI(GARDENER_SYSTEM_PROMPT, apiMsgs, 400, abortRef.current.signal)

      if (response.trim().startsWith('ROOM_CREATE:')) {
        setMessages(prev => [...prev, { role: 'assistant', content: response.trim() }])
        setGardenerLoading(false)
        await handleRoomCreate(response.trim())
        return
      }

      setMessages(prev => [...prev, { role: 'assistant', content: response }])
    } catch (err) {
      if (err.name !== 'AbortError') {
        setGardenerError('The Gardener couldn\'t respond — check your API key and try again.')
      }
    } finally {
      setGardenerLoading(false)
    }
  }, [inputText, messages, gardenerLoading, isCreating, isAuthenticated, userId, username]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const openMyChats   = () => { setInboxTab('my');  setShowInbox(true) }
  const openBrowseAll = () => { setInboxTab('all'); setShowInbox(true) }
  const closeInbox    = () => setShowInbox(false)

  const hasReturningRooms = getVisitedRoomCodes().length > 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="weaver-entry">

      {/* ── Layer 1: Canvas 2D rhizome ── */}
      <canvas ref={canvasRef} className="weaver-canvas" />

      {/* ── Wordmark ── */}
      <div className="weaver-wordmark">kepos</div>

      {/* ── Creating overlay ── */}
      {isCreating && (
        <div className="weaver-creating">
          <div className="weaver-creating-ring" />
          <div className="weaver-creating-text">Shaping your room…</div>
        </div>
      )}

      {/* ── Layer 2: Gardener conversation thread ── */}
      <div className="weaver-thread-area">

        {/* Message thread */}
        {messages.length > 0 && (
          <div className="weaver-thread">
            {messages.map((m, i) => {
              if (m.role === 'assistant' && m.content.startsWith('ROOM_CREATE:')) return null
              return (
                <div key={i} className={`weaver-msg weaver-msg-${m.role}`}>
                  {m.content}
                </div>
              )
            })}

            {gardenerLoading && (
              <div className="weaver-msg weaver-msg-assistant weaver-typing">
                <span /><span /><span />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {gardenerError && (
          <div className="weaver-error">{gardenerError}</div>
        )}
      </div>

      {/* ── Input bar ── */}
      <div className="weaver-input-bar">
        <textarea
          ref={inputRef}
          className="weaver-input"
          value={inputText}
          onChange={e => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What are you curious about?"
          rows={1}
          disabled={gardenerLoading || isCreating}
        />
        <button
          className="weaver-send-btn"
          onClick={handleSend}
          disabled={!inputText.trim() || gardenerLoading || isCreating}
          aria-label="Send"
        >
          {gardenerLoading ? <span className="weaver-send-spinner" /> : '↑'}
        </button>
      </div>

      {/* ── Layer 3: Persistent navigation ── */}
      <div className="weaver-nav">
        <button
          className={`weaver-nav-btn ${hasReturningRooms ? 'weaver-nav-prominent' : ''}`}
          onClick={openMyChats}
        >
          <span className="weaver-nav-icon">💬</span>
          <span>My Chats</span>
        </button>

        {onStartRoom && (
          <button className="weaver-nav-btn weaver-nav-create" onClick={onStartRoom}>
            <span className="weaver-nav-icon">＋</span>
            <span>Create Room</span>
          </button>
        )}

        <button className="weaver-nav-btn" onClick={openBrowseAll}>
          <span className="weaver-nav-icon">🔍</span>
          <span>Browse All</span>
        </button>
      </div>

      {/* ── Inbox slide-up panel ── */}
      {showInbox && (
        <div className="graph-inbox-overlay">
          <div className="graph-inbox-backdrop" onClick={closeInbox} />
          <div className="graph-inbox-sheet">
            <div className="graph-inbox-pull-handle" />
            <InboxScreen
              initialTab={inboxTab}
              onStartRoom={closeInbox}
              onOpenRoom={(code) => { closeInbox(); onOpenRoom(code) }}
              onJoinRoom={(code) => { closeInbox(); onOpenRoom(code) }}
              onSignIn={() => { closeInbox(); onSignIn() }}
            />
          </div>
        </div>
      )}

    </div>
  )
}
