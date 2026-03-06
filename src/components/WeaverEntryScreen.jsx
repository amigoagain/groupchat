/**
 * WeaverEntryScreen.jsx  — Kepos primary entry screen
 * ─────────────────────────────────────────────────────────────
 * Two-layer flex column filling the visual viewport:
 *   1. Canvas (flex 1): rhizome animation fills everything above the icon bar.
 *      Header: hamburger (top-right → account settings).
 *      Canvas overlay icons (top-left column): My Library, Public Library,
 *      Professional — static frosted-glass circles on the canvas.
 *      Beta context text: fades in at canvas center-bottom when a mode is active.
 *
 *   2. Bottom bar (auto): 3 circle mode icons on one horizontal row.
 *      Tap an icon → it slides to the far right, textarea expands from the left.
 *      The icon at right IS the send button for that mode.
 *      Other icons collapse (width → 0, opacity → 0).
 *      Tap the active icon again (or press Escape) to collapse back.
 *
 * Keyboard handling: rootH/rootY track visualViewport so layout
 * fills exactly the visible area above the iOS keyboard.
 * ─────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react'

// ── Canvas 2D Rhizome ──────────────────────────────────────────────────────────

const OLIVE   = [74,  88,  48]
const BROWN   = [100, 78,  44]
const D_OLIVE = [55,  68,  36]

function rgba(rgb, a) { return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})` }

function buildRhizome(w, h) {
  const segments  = []
  const junctions = []

  function walkPath(startX, startY, startAngle, opts) {
    let x      = startX
    let y      = startY
    let angle  = startAngle
    let dAngle = (Math.random() - 0.5) * opts.initCurl

    const { col, lw, baseA, step, nSteps } = opts

    for (let s = 0; s < nSteps; s++) {
      dAngle += (Math.random() - 0.5) * 0.006
      dAngle *= 0.97
      angle  += dAngle

      const nx = x + Math.cos(angle) * step
      const ny = y + Math.sin(angle) * step

      const prog  = s / nSteps
      const alpha = baseA
                  * Math.min(1, prog * 7)
                  * Math.min(1, (1 - prog) * 5)

      if (s > 0 && alpha > 0.008) {
        segments.push({ x1: x, y1: y, x2: nx, y2: ny, a: alpha, lw, col })
      }

      x = nx; y = ny
      if (x < -w * 0.22 || x > w * 1.22 || y < -h * 0.22 || y > h * 1.22) break
    }
  }

  const numGroups = 2 + Math.floor(Math.random() * 2)

  for (let g = 0; g < numGroups; g++) {
    const gx     = w * (0.08 + Math.random() * 0.84)
    const gy     = h * (0.08 + Math.random() * 0.84)
    const gAngle = Math.random() * Math.PI * 2
    const nPaths = 2 + Math.floor(Math.random() * 2)

    for (let p = 0; p < nPaths; p++) {
      walkPath(
        gx + (Math.random() - 0.5) * w * 0.10,
        gy + (Math.random() - 0.5) * h * 0.08,
        gAngle + (Math.random() - 0.5) * 0.55,
        {
          col:      Math.random() < 0.55 ? OLIVE : BROWN,
          lw:       0.5  + Math.random() * 0.7,
          baseA:    0.20 + Math.random() * 0.22,
          step:     2.4  + Math.random() * 1.2,
          nSteps:   300  + Math.floor(Math.random() * 200),
          initCurl: 0.008,
        }
      )
    }
  }

  const nLone = 1 + Math.floor(Math.random() * 2)
  for (let i = 0; i < nLone; i++) {
    walkPath(
      w * (0.05 + Math.random() * 0.9),
      h * (0.05 + Math.random() * 0.9),
      Math.random() * Math.PI * 2,
      {
        col:      Math.random() < 0.5 ? OLIVE : BROWN,
        lw:       0.4  + Math.random() * 0.5,
        baseA:    0.14 + Math.random() * 0.16,
        step:     2.2  + Math.random() * 1.4,
        nSteps:   240  + Math.floor(Math.random() * 160),
        initCurl: 0.010,
      }
    )
  }

  return { segments, junctions }
}

function initRhizome(canvas) {
  const ctx = canvas.getContext('2d')
  let w = canvas.width  = canvas.offsetWidth
  let h = canvas.height = canvas.offsetHeight

  let data = buildRhizome(w, h)
  let tips = []
  let t    = 0
  let lastSpawn = 0
  let raf  = null
  let lastTs = 0
  let resizeTimer = null

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
    const lo  = Math.floor(data.segments.length * 0.10)
    const hi  = Math.floor(data.segments.length * 0.90)
    const seg = data.segments[lo + Math.floor(Math.random() * (hi - lo))]
    if (!seg) return
    const angle = Math.atan2(seg.y2 - seg.y1, seg.x2 - seg.x1) + (Math.random() - 0.5) * 0.8
    tips.push({
      x: seg.x2, y: seg.y2,
      angle,
      age:    0,
      maxAge: 55 + Math.random() * 85,
      speed:  0.50 + Math.random() * 0.50,
      segs:   [],
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
        tip.angle += (Math.random() - 0.5) * 0.11
        const nx = tip.x + Math.cos(tip.angle) * tip.speed
        const ny = tip.y + Math.sin(tip.angle) * tip.speed
        const a  = (1 - progress / 0.65) * 0.20
        const lw = 0.55
        tip.segs.push({ x1: tip.x, y1: tip.y, x2: nx, y2: ny, a, lw })
        tip.x = nx; tip.y = ny
        if (nx < 0 || nx > w || ny < 0 || ny > h) { tips.splice(i, 1) }
      }
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(offscreen, 0, 0)

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
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      const newW = canvas.offsetWidth
      const newH = canvas.offsetHeight
      if (newW === w && newH === h) return
      w = canvas.width  = newW
      h = canvas.height = newH
      offscreen.width  = w
      offscreen.height = h
      offCtx = offscreen.getContext('2d')
      data = buildRhizome(w, h)
      tips = []
      renderOffscreen()
    }, 150)
  }
  window.addEventListener('resize', resize)

  const ro = new ResizeObserver(resize)
  ro.observe(canvas)

  return () => {
    cancelAnimationFrame(raf)
    clearTimeout(resizeTimer)
    window.removeEventListener('resize', resize)
    ro.disconnect()
  }
}

// ── Mode icon SVGs ─────────────────────────────────────────────────────────────

const ICON_PROPS = {
  width:           '20',
  height:          '23',
  viewBox:         '0 0 14 16',
  fill:            'none',
  stroke:          'currentColor',
  strokeWidth:     '1.5',
  strokeLinecap:   'round',
  strokeLinejoin:  'round',
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
    default: return null
  }
}

// ── Canvas overlay icon SVGs ───────────────────────────────────────────────────

function BookSVG() {
  return (
    <svg width="17" height="19" viewBox="0 0 14 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    >
      <rect x="2" y="1" width="9" height="14" rx="1" />
      <path d="M11 1 Q13 1 13 3 L13 14 Q13 15 11 15" />
      <line x1="4.5" y1="5"   x2="8.5" y2="5"   />
      <line x1="4.5" y1="7.5" x2="8.5" y2="7.5" />
      <line x1="4.5" y1="10"  x2="7"   y2="10"  />
    </svg>
  )
}

function BuildingSVG() {
  return (
    <svg width="17" height="19" viewBox="0 0 14 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    >
      <polygon points="1,7 7,2 13,7" />
      <rect x="1" y="7" width="12" height="8" />
      <rect x="5.5" y="10" width="3" height="5" />
      <line x1="3.5" y1="9.5"  x2="3.5" y2="12" />
      <line x1="10.5" y1="9.5" x2="10.5" y2="12" />
    </svg>
  )
}

function BriefcaseSVG() {
  return (
    <svg width="17" height="19" viewBox="0 0 14 16" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    >
      <rect x="1" y="5.5" width="12" height="8.5" rx="1.5" />
      <path d="M5 5.5 V4 Q5 2.5 7 2.5 Q9 2.5 9 4 V5.5" />
      <line x1="1" y1="9.5" x2="13" y2="9.5" />
    </svg>
  )
}

// ── Mode config ────────────────────────────────────────────────────────────────

const MODES_CONFIG = [
  { id: 'stroll',   placeholder: 'What are you curious about?' },
  { id: 'thinking', placeholder: 'What are you thinking?'      },
  { id: 'research', placeholder: 'What are you researching?'   },
]

// ── Beta context text ──────────────────────────────────────────────────────────

const BETA_CONTEXT = {
  stroll:
    'Gardener-led orientation sequence. 8 turns. Closes with a handoff question. ' +
    'Opens a single character room — topic-matched respondents. Twenty turn limit in character room.',
  thinking:
    'Gardener-led problem-framing sequence. 8 turns. Closes with a handoff question. ' +
    'Opens a character room with 1–2 characters — topic-matched respondents. Thirty turn limit in character room.',
  research:
    'Gardener-led research frame. 6 turns. Closes with character selection — up to 3. ' +
    'Opens a character room with your selection. Twenty turn limit.',
}

// ── Shared style for canvas overlay icon buttons ───────────────────────────────
const canvasIconBtn = {
  width:                '38px',
  height:               '38px',
  borderRadius:         '50%',
  background:           'rgba(245, 241, 234, 0.80)',
  WebkitBackdropFilter: 'blur(14px)',
  backdropFilter:       'blur(14px)',
  border:               '1px solid rgba(107, 124, 71, 0.20)',
  boxShadow:            '0 1px 8px rgba(0,0,0,0.09)',
  display:              'flex',
  alignItems:           'center',
  justifyContent:       'center',
  cursor:               'pointer',
  color:                '#4a5830',
  padding:              0,
  transition:           'background 0.15s ease',
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function WeaverEntryScreen({
  onModeEntry,
  onOpenLibrary,
  onSignIn,            // opens account settings (or sign-in if unauthenticated)
  onOpenProfessional,  // opens the ProfessionalScreen
  isProfessionalUnlocked,
}) {
  const [activeMode,   setActiveMode]   = useState(null)
  const [inputText,    setInputText]    = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const [rootH, setRootH] = useState(() => window.visualViewport?.height ?? window.innerHeight)
  const [rootY, setRootY] = useState(0)

  const canvasRef        = useRef(null)
  const canvasWrapperRef = useRef(null)
  const textareaRef      = useRef(null)

  // Lock html/body scroll while entry screen is mounted.
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    const resetScroll = () => window.scrollTo(0, 0)
    window.addEventListener('scroll', resetScroll)
    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
      window.removeEventListener('scroll', resetScroll)
    }
  }, [])

  // Track visual viewport size and position.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => { setRootH(vv.height); setRootY(vv.offsetTop) }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update) }
  }, [])

  // Canvas rhizome — init after layout so offsetWidth/Height are valid.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    return initRhizome(canvas)
  }, [])

  // Block touchmove on canvas wrapper only.
  useEffect(() => {
    const wrapper = canvasWrapperRef.current
    if (!wrapper) return
    const preventScroll = (e) => { e.preventDefault() }
    wrapper.addEventListener('touchmove', preventScroll, { passive: false })
    return () => { wrapper.removeEventListener('touchmove', preventScroll) }
  }, [])

  // Auto-focus textarea when a mode becomes active.
  useEffect(() => {
    if (activeMode && textareaRef.current) {
      const t = setTimeout(() => textareaRef.current?.focus(), 60)
      return () => clearTimeout(t)
    }
  }, [activeMode])

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleIconClick = (modeId) => {
    if (activeMode === modeId) {
      setActiveMode(null)
      setInputText('')
    } else {
      setActiveMode(modeId)
      setInputText('')
    }
  }

  const handleSubmit = async () => {
    const text = inputText.trim()
    if (!text || isSubmitting || !activeMode) return
    setIsSubmitting(true)
    try {
      await onModeEntry(activeMode, text)
    } finally {
      setIsSubmitting(false)
      setInputText('')
      setActiveMode(null)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
    if (e.key === 'Escape')               { setActiveMode(null); setInputText('') }
  }

  const handleTextareaChange = (e) => {
    setInputText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 110) + 'px'
  }

  const activePlaceholder = MODES_CONFIG.find(m => m.id === activeMode)?.placeholder ?? ''
  const hasText           = Boolean(inputText.trim()) && !isSubmitting

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display:            'flex',
      flexDirection:      'column',
      height:             rootH,
      position:           'fixed',
      top:                rootY,
      left:               0,
      right:              0,
      overflow:           'hidden',
      background:         '#f5f2ec',
      overscrollBehavior: 'none',
    }}>

      {/* ── Canvas layer ── */}
      <div
        ref={canvasWrapperRef}
        onTouchStart={(e) => e.stopPropagation()}
        style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0 }}
      >
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%' }}
        />

        {/* ── Header — hamburger → account settings ── */}
        <div style={{
          position:       'absolute',
          top:            0,
          left:           0,
          right:          0,
          paddingTop:     'env(safe-area-inset-top, 0px)',
          height:         'calc(52px + env(safe-area-inset-top, 0px))',
          display:        'flex',
          alignItems:     'flex-end',
          justifyContent: 'flex-end',
          paddingRight:   '10px',
          paddingBottom:  '8px',
          zIndex:         10,
          boxSizing:      'border-box',
        }}>
          <button
            onClick={() => onSignIn?.()}
            aria-label="Account settings"
            style={{
              background:    'transparent',
              border:        'none',
              cursor:        'pointer',
              padding:       '8px',
              display:       'flex',
              flexDirection: 'column',
              gap:           '5px',
              opacity:       0.55,
              transition:    'opacity 0.2s',
            }}
          >
            <span style={{ display: 'block', width: '22px', height: '1.5px', background: '#3a4a20', borderRadius: '1px' }} />
            <span style={{ display: 'block', width: '22px', height: '1.5px', background: '#3a4a20', borderRadius: '1px' }} />
            <span style={{ display: 'block', width: '14px', height: '1.5px', background: '#3a4a20', borderRadius: '1px' }} />
          </button>
        </div>

        {/* ── Canvas overlay icons — top-left column ── */}
        <div style={{
          position:      'absolute',
          top:           'calc(58px + env(safe-area-inset-top, 0px))',
          left:          '14px',
          display:       'flex',
          flexDirection: 'column',
          gap:           '9px',
          zIndex:        8,
        }}>
          {/* My Library — book */}
          <button
            onClick={() => onOpenLibrary?.('private', 'convos')}
            aria-label="My Library"
            title="My Library"
            style={canvasIconBtn}
          >
            <BookSVG />
          </button>

          {/* Public Library — building */}
          <button
            onClick={() => onOpenLibrary?.('public')}
            aria-label="Public Library"
            title="Public Library"
            style={canvasIconBtn}
          >
            <BuildingSVG />
          </button>

          {/* Professional — briefcase (gated) */}
          {isProfessionalUnlocked && (
            <button
              onClick={() => onOpenProfessional?.()}
              aria-label="Professional"
              title="Professional"
              style={canvasIconBtn}
            >
              <BriefcaseSVG />
            </button>
          )}
        </div>

        {/* ── Canvas tap-to-dismiss — catches taps on canvas when a mode is active ── */}
        {activeMode && (
          <div
            onClick={() => { setActiveMode(null); setInputText('') }}
            style={{
              position: 'absolute',
              inset:    0,
              zIndex:   4,   // above canvas, below overlay icons (8) and header (10)
              cursor:   'default',
            }}
          />
        )}

        {/* ── Beta context text — fades in when mode is active ── */}
        <div style={{
          position:     'absolute',
          bottom:       '22px',
          left:         '64px',   // clear of the canvas icon column
          right:        '20px',
          opacity:      activeMode ? 1 : 0,
          transition:   'opacity 0.30s ease',
          pointerEvents:'none',
          zIndex:       5,
        }}>
          <p style={{
            margin:        0,
            fontFamily:    'Georgia, serif',
            fontSize:      '11px',
            lineHeight:    '1.70',
            color:         '#4a5830',
            opacity:       0.60,
            letterSpacing: '0.01em',
          }}>
            {activeMode && BETA_CONTEXT[activeMode]}
          </p>
        </div>

      </div>
      {/* end canvas layer */}

      {/* ── Bottom bar — 3 circle icons, in-row expansion ── */}
      <div style={{
        flexShrink:    0,
        paddingTop:    '10px',
        paddingBottom: 'max(18px, env(safe-area-inset-bottom))',
      }}>
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: activeMode ? 'flex-start' : 'center',
          padding:        '0 16px',
          gap:            activeMode ? '0' : '14px',
          height:         '54px',
          transition:     'gap 0.22s ease',
        }}>

          {/* ── Textarea — grows from the left when active ── */}
          <div style={{
            flex:        activeMode ? 1 : 0,
            maxWidth:    activeMode ? '9999px' : 0,
            overflow:    'hidden',
            opacity:     activeMode ? 1 : 0,
            minWidth:    0,
            display:     'flex',
            alignItems:  'center',
            paddingRight: activeMode ? '10px' : '0',
            transition:  'flex 0.28s ease, max-width 0.28s ease, opacity 0.22s ease, padding-right 0.22s ease',
            boxSizing:   'border-box',
          }}>
            <textarea
              ref={textareaRef}
              className="entry-textarea"
              value={inputText}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder={activePlaceholder}
              disabled={isSubmitting}
              rows={1}
              style={{
                width:      '100%',
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
                maxHeight:  '110px',
                overflow:   'auto',
                caretColor: '#4a5a24',
              }}
            />
          </div>

          {/* ── 3 circle mode buttons — active one slides right and becomes send ── */}
          {MODES_CONFIG.map(mode => {
            const isActive  = activeMode === mode.id
            const isReceded = activeMode !== null && !isActive

            return (
              // Outer wrapper collapses width when receded (also collapses gap contribution)
              <div
                key={mode.id}
                style={{
                  flexShrink: 0,
                  width:      isReceded ? 0 : '48px',
                  overflow:   'hidden',
                  order:      isActive ? 999 : 0,   // push active icon to the end (rightmost)
                  marginLeft: isActive && activeMode ? 'auto' : '0',
                  transition: 'width 0.26s ease',
                }}
              >
                <button
                  onClick={() => isActive ? handleSubmit() : handleIconClick(mode.id)}
                  aria-label={isActive ? `Send — ${mode.id}` : mode.id}
                  disabled={isActive && isSubmitting}
                  style={{
                    width:                '48px',
                    height:               '48px',
                    borderRadius:         '50%',
                    flexShrink:           0,
                    display:              'flex',
                    alignItems:           'center',
                    justifyContent:       'center',
                    // Active + has text: solid olive fill = clear send affordance
                    background:           isActive
                                            ? (hasText ? '#4a5a24' : 'rgba(74, 90, 36, 0.22)')
                                            : 'rgba(245, 241, 234, 0.85)',
                    WebkitBackdropFilter: 'blur(12px)',
                    backdropFilter:       'blur(12px)',
                    border:               `1px solid rgba(107, 124, 71, ${isActive ? 0.48 : 0.22})`,
                    boxShadow:            '0 1px 8px rgba(0,0,0,0.09)',
                    color:                isActive && hasText ? '#f5f2ec' : '#4a5830',
                    cursor:               isActive && isSubmitting ? 'default' : 'pointer',
                    padding:              0,
                    transition:           'background 0.20s ease, color 0.20s ease, border 0.18s ease, box-shadow 0.18s ease',
                    pointerEvents:        isReceded ? 'none' : 'auto',
                  }}
                >
                  {isSubmitting && isActive ? (
                    <span style={{ opacity: 0.5, fontSize: '14px', fontFamily: 'Georgia, serif' }}>·</span>
                  ) : (
                    <ModeIcon id={mode.id} />
                  )}
                </button>
              </div>
            )
          })}

        </div>
      </div>

    </div>
  )
}
