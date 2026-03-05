/**
 * WeaverEntryScreen.jsx  — Kepos primary entry screen
 * ─────────────────────────────────────────────────────────────
 * Two-layer flex column filling the visual viewport:
 *   1. Canvas (flex 1): rhizome animation fills everything above input bar.
 *      Header is a transparent absolute overlay inside this layer so the
 *      canvas runs edge-to-edge and through the top bar area.
 *   2. Input bar (auto): frosted-glass pill at bottom.
 *
 * Keyboard handling: rootH tracks visualViewport.height so layout
 * fills exactly the visible area above the iOS keyboard. rootY tracks
 * vv.offsetTop so the fixed root follows iOS's visual viewport scroll.
 *
 * Menu: top-pill row (my library / public library / account).
 * Opens downward from the header area with a smooth slide+fade.
 * ─────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'

// ── Canvas 2D Rhizome ──────────────────────────────────────────────────────────

const OLIVE   = [74,  88,  48]
const BROWN   = [100, 78,  44]
const D_OLIVE = [55,  68,  36]

function rgba(rgb, a) { return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a.toFixed(3)})` }

function buildRhizome(w, h) {
  // Wandering-thread design: no central source, no branching hierarchy.
  // Paths start in small clusters so they run parallel for a while before
  // diverging or crossing. Smooth angular drift (damped velocity) produces
  // organic curves. Overlapping transparent strokes stack at crossings to
  // mark them without any explicit node drawing.

  const segments  = []
  const junctions = [] // unused; kept so renderOffscreen loop is harmless

  function walkPath(startX, startY, startAngle, opts) {
    let x      = startX
    let y      = startY
    let angle  = startAngle
    let dAngle = (Math.random() - 0.5) * opts.initCurl

    const { col, lw, baseA, step, nSteps } = opts

    for (let s = 0; s < nSteps; s++) {
      // Smooth, damped angular drift — keeps curves gradual and organic
      dAngle += (Math.random() - 0.5) * 0.006
      dAngle *= 0.97
      angle  += dAngle

      const nx = x + Math.cos(angle) * step
      const ny = y + Math.sin(angle) * step

      // Fade in quickly from the start, hold, fade out gently at the end
      const prog  = s / nSteps
      const alpha = baseA
                  * Math.min(1, prog * 7)          // fast fade-in
                  * Math.min(1, (1 - prog) * 5)    // gradual fade-out

      if (s > 0 && alpha > 0.008) {
        segments.push({ x1: x, y1: y, x2: nx, y2: ny, a: alpha, lw, col })
      }

      x = nx; y = ny
      if (x < -w * 0.22 || x > w * 1.22 || y < -h * 0.22 || y > h * 1.22) break
    }
  }

  // ── Grouped paths ──────────────────────────────────────────────────────────
  // Each group is 2–3 paths starting close together with a shared base
  // direction. They naturally run parallel for a while then peel apart,
  // re-cross, or wind around each other as their dAngles diverge.
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

  // ── Solitary wanderers ─────────────────────────────────────────────────────
  // Independent paths that cut across the canvas from unrelated origins,
  // adding extra crossings and keeping the layout from feeling symmetric.
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
  // Use the canvas element's own dimensions — it sits inside a flex child
  // whose size is determined by the layout, not the window.
  let w = canvas.width  = canvas.offsetWidth
  let h = canvas.height = canvas.offsetHeight

  let data = buildRhizome(w, h)
  let tips = []
  let t    = 0
  let lastSpawn = 0
  let raf  = null
  let lastTs = 0
  let resizeTimer = null

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
    // Pick from the middle 80% — avoids the faded-end segments where alpha
    // is near zero, so tips always sprout from a visible part of a path.
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

  // Resize: debounced so keyboard animation doesn't trigger a rebuild on every
  // intermediate frame. window.resize handles orientation/desktop changes;
  // ResizeObserver handles container-driven changes (keyboard open/close).
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

// ── Main component ─────────────────────────────────────────────────────────────

export default function WeaverEntryScreen({
  onEntrySubmit,
  onOpenLibrary,
  onSignIn,
  onStartRoom,
  onOpenRoom,
}) {
  const { isAuthenticated, username } = useAuth()

  const [inputText,    setInputText]    = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [menuOpen,     setMenuOpen]     = useState(false)

  // rootH/rootY track the visual viewport so the layout fills exactly the
  // visible area above the keyboard on iOS Safari.
  const [rootH, setRootH] = useState(() => window.visualViewport?.height ?? window.innerHeight)
  const [rootY, setRootY] = useState(0)

  const canvasRef        = useRef(null)
  const inputRef         = useRef(null)
  const canvasWrapperRef = useRef(null)

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
    const update = () => {
      setRootH(vv.height)
      setRootY(vv.offsetTop)
    }
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [])

  // Canvas rhizome — init after layout so canvas.offsetWidth/Height are valid
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

  const handleSubmit = async () => {
    const text = inputText.trim()
    if (!text || isSubmitting) return
    setIsSubmitting(true)
    setInputText('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    try {
      await onEntrySubmit(text)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleTextareaChange = (e) => {
    setInputText(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  // ── Menu items ─────────────────────────────────────────────────────────────
  const menuItems = [
    {
      label:  'my library',
      action: () => { setMenuOpen(false); onOpenLibrary?.('private', 'my_convos') },
    },
    {
      label:  'public library',
      action: () => { setMenuOpen(false); onOpenLibrary?.('public') },
    },
    {
      label:  'account',
      action: () => { setMenuOpen(false); onSignIn?.() },
    },
  ]

  // ── Styles ─────────────────────────────────────────────────────────────────

  const pillStyle = {
    background:           'rgba(245, 241, 234, 0.88)',
    WebkitBackdropFilter: 'blur(14px)',
    backdropFilter:       'blur(14px)',
    border:               '1px solid rgba(107, 124, 71, 0.22)',
    borderRadius:         '20px',
    padding:              '7px 18px',
    cursor:               'pointer',
    color:                '#4a5830',
    fontFamily:           'Georgia, serif',
    fontSize:             '14px',
    letterSpacing:        '0.01em',
    whiteSpace:           'nowrap',
    boxShadow:            '0 2px 14px rgba(0,0,0,0.10)',
    transition:           'background 0.15s, color 0.15s',
  }

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

      {/* ── Canvas layer — fills all space above input bar ── */}
      <div
        ref={canvasWrapperRef}
        onTouchStart={(e) => e.stopPropagation()}
        style={{
          flex:      1,
          position:  'relative',
          overflow:  'hidden',
          minHeight: 0,
        }}
      >
        {/* Rhizome canvas — full size */}
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset:    0,
            display:  'block',
            width:    '100%',
            height:   '100%',
          }}
        />

        {/* ── Header overlay — transparent, floats above canvas ── */}
        <div style={{
          position:      'absolute',
          top:           0,
          left:          0,
          right:         0,
          paddingTop:    'env(safe-area-inset-top, 0px)',
          height:        'calc(52px + env(safe-area-inset-top, 0px))',
          display:       'flex',
          alignItems:    'flex-end',
          justifyContent:'flex-end',
          paddingRight:  '10px',
          paddingBottom: '8px',
          zIndex:        10,
          boxSizing:     'border-box',
          // No background — canvas shows through
        }}>
          {/* Menu trigger — three thin lines */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label="Menu"
            style={{
              background:    'transparent',
              border:        'none',
              cursor:        'pointer',
              padding:       '8px',
              display:       'flex',
              flexDirection: 'column',
              gap:           '5px',
              opacity:       menuOpen ? 0.3 : 0.55,
              transition:    'opacity 0.2s',
            }}
          >
            <span style={{ display: 'block', width: '22px', height: '1.5px', background: '#3a4a20', borderRadius: '1px' }} />
            <span style={{ display: 'block', width: '22px', height: '1.5px', background: '#3a4a20', borderRadius: '1px' }} />
            <span style={{ display: 'block', width: '14px', height: '1.5px', background: '#3a4a20', borderRadius: '1px' }} />
          </button>
        </div>

        {/* ── Pill menu — slides down from header ── */}
        {/* Always mounted so the transition plays on close */}
        <div style={{
          position:      'absolute',
          top:           'calc(48px + env(safe-area-inset-top, 0px))',
          left:          0,
          right:         0,
          zIndex:        20,
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'center',
          opacity:       menuOpen ? 1 : 0,
          transform:     menuOpen ? 'translateY(0px)' : 'translateY(-10px)',
          pointerEvents: menuOpen ? 'auto' : 'none',
          transition:    'opacity 0.20s ease, transform 0.20s ease',
        }}>
          {/* Invisible backdrop — tap anywhere outside pills to close */}
          <div
            onClick={() => setMenuOpen(false)}
            style={{
              position: 'fixed',
              inset:    0,
              zIndex:   -1,
            }}
          />

          {/* Pill row */}
          <div style={{
            display:    'flex',
            gap:        '8px',
            padding:    '0 16px',
            flexWrap:   'wrap',
            justifyContent: 'center',
          }}>
            {menuItems.map(item => (
              <button
                key={item.label}
                onClick={item.action}
                style={pillStyle}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(245,241,234,0.97)'; e.currentTarget.style.color = '#3a4a1a' }}
                onMouseLeave={e => { e.currentTarget.style.background = pillStyle.background; e.currentTarget.style.color = pillStyle.color }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

      </div>
      {/* end canvas layer */}

      {/* ── Input bar layer ── */}
      <div style={{
        flexShrink:    0,
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        paddingTop:    '8px',
      }}>
        <div style={{
          maxWidth: '520px',
          margin:   '0 auto',
          padding:  '0 20px',
        }}>
          {/* Frosted-glass pill */}
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
            boxShadow:            '0 2px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)',
          }}>
            <textarea
              ref={inputRef}
              className="entry-textarea"
              value={inputText}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              placeholder="what are you curious about?"
              disabled={isSubmitting}
              rows={1}
              style={{
                flex:       1,
                background: 'transparent',
                border:     'none',
                outline:    'none',
                resize:     'none',
                // Green throughout — matches the resting placeholder color
                color:      '#4a5830',
                fontFamily: 'Georgia, serif',
                fontSize:   '16px',  // 16px: prevents iOS auto-zoom on focus
                lineHeight: '1.5',
                padding:    '2px 0',
                minHeight:  '24px',
                maxHeight:  '120px',
                overflow:   'auto',
                caretColor: '#4a5a24',
              }}
            />
            <button
              onClick={handleSubmit}
              disabled={!inputText.trim() || isSubmitting}
              aria-label="Begin"
              style={{
                flexShrink:     0,
                width:          '32px',
                height:         '32px',
                background:     inputText.trim() && !isSubmitting ? '#4a5a24' : 'rgba(74, 90, 36, 0.12)',
                border:         'none',
                borderRadius:   '8px',
                cursor:         inputText.trim() && !isSubmitting ? 'pointer' : 'default',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                transition:     'background 0.2s',
                color:          inputText.trim() && !isSubmitting ? '#f5f2ec' : '#8a9a70',
                fontSize:       '14px',
              }}
            >
              {isSubmitting ? '·' : '↑'}
            </button>
          </div>
        </div>
      </div>

    </div>
  )
}
