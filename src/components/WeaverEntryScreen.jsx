/**
 * WeaverEntryScreen.jsx  — Kepos primary entry screen
 * ─────────────────────────────────────────────────────────────
 * Three-layer flex column filling 100dvh:
 *   1. Header (52px): wordmark centred, hamburger absolute right
 *   2. Canvas (flex 1): rhizome animation fills remaining space
 *   3. Input bar (auto): frosted-glass pill at bottom
 *
 * Keyboard handling: CSS only. The flex column responds to
 * viewport height changes (iOS viewport-fit=cover). No JS
 * keyboard listeners needed.
 *
 * Drawer: position fixed, overlays all three layers.
 * ─────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext.jsx'

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

  // Resize reads canvas element dimensions — the flex layout determines the
  // canvas wrapper size, which the canvas fills via width/height:100% CSS.
  // Equality guard prevents unnecessary rebuilds on non-size events.
  function resize() {
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
  }
  window.addEventListener('resize', resize)

  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resize)
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
  const [drawerOpen,   setDrawerOpen]   = useState(false)

  const canvasRef        = useRef(null)
  const inputRef         = useRef(null)
  const canvasWrapperRef = useRef(null)

  // Lock html/body scroll while entry screen is mounted.
  // overflow:hidden stops rubber-band scroll. position:fixed is omitted —
  // it causes layout shift on iOS when the keyboard opens.
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const prevHtmlOverflow = html.style.overflow
    const prevBodyOverflow = body.style.overflow
    html.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prevHtmlOverflow
      body.style.overflow = prevBodyOverflow
    }
  }, [])

  // Canvas rhizome — init after layout so canvas.offsetWidth/Height are valid
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const cleanup = initRhizome(canvas)
    return cleanup
  }, [])

  // Block touchmove on canvas wrapper only.
  // The textarea lives in the input bar layer outside this wrapper —
  // no exemption logic needed.
  useEffect(() => {
    const wrapper = canvasWrapperRef.current
    if (!wrapper) return
    const preventScroll = (e) => { e.preventDefault() }
    wrapper.addEventListener('touchmove', preventScroll, { passive: false })
    return () => {
      wrapper.removeEventListener('touchmove', preventScroll)
    }
  }, [])

  // Close drawer on outside click / tap
  useEffect(() => {
    if (!drawerOpen) return
    const handler = (e) => {
      if (!e.target.closest('.kepos-drawer') && !e.target.closest('.kepos-hamburger')) {
        setDrawerOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [drawerOpen])

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
    // Auto-resize
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  const drawerItems = [
    {
      label: 'My Strolls',
      icon:  '🌿',
      action: () => { setDrawerOpen(false); onOpenLibrary?.() },
    },
    {
      label: 'My Conversations',
      icon:  '💬',
      action: () => { setDrawerOpen(false); onOpenLibrary?.() },
    },
    {
      label: 'Library',
      icon:  '📚',
      action: () => { setDrawerOpen(false); onOpenLibrary?.() },
    },
    {
      label: 'Settings',
      icon:  '⚙',
      action: () => { setDrawerOpen(false) }, // placeholder
    },
    {
      label: isAuthenticated ? (username || 'Account') : 'Sign In',
      icon:  '○',
      action: () => { setDrawerOpen(false); onSignIn?.() },
    },
  ]

  return (
    <div style={{
      display:           'flex',
      flexDirection:     'column',
      height:            '100dvh',
      position:          'fixed',
      top:               0,
      left:              0,
      right:             0,
      bottom:            0,
      overflow:          'hidden',
      background:        '#f5f2ec',
      overscrollBehavior: 'none',
    }}>

      {/* ── Header ── */}
      <div style={{
        height:         '52px',
        flexShrink:     0,
        position:       'relative',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        paddingTop:     'env(safe-area-inset-top, 0px)',
      }}>
        {/* Wordmark */}
        <span style={{
          fontFamily:    'Georgia, serif',
          fontSize:      '13px',
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color:         '#4a5830',
          opacity:       0.7,
          userSelect:    'none',
          pointerEvents: 'none',
        }}>
          kepos
        </span>

        {/* Hamburger — absolute within header */}
        <button
          className="kepos-hamburger"
          onClick={() => setDrawerOpen(o => !o)}
          aria-label="Menu"
          style={{
            position:      'absolute',
            right:         '16px',
            top:           '50%',
            transform:     'translateY(-50%)',
            background:    'transparent',
            border:        'none',
            cursor:        'pointer',
            padding:       '8px',
            display:       'flex',
            flexDirection: 'column',
            gap:           '5px',
            opacity:       drawerOpen ? 0 : 0.6,
            transition:    'opacity 0.2s',
          }}
        >
          <span style={{ display: 'block', width: '22px', height: '1.5px', background: '#3a4a20', borderRadius: '1px' }} />
          <span style={{ display: 'block', width: '22px', height: '1.5px', background: '#3a4a20', borderRadius: '1px' }} />
          <span style={{ display: 'block', width: '14px', height: '1.5px', background: '#3a4a20', borderRadius: '1px' }} />
        </button>
      </div>

      {/* ── Canvas layer ── */}
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
      </div>

      {/* ── Input bar layer ── */}
      <div style={{
        flexShrink:    0,
        paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        paddingTop:    '8px',
      }}>
        {/* Inner wrapper: max-width + horizontal padding, centred via margin */}
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
                // 16px: iOS Safari auto-zoom threshold — below this it zooms on focus
                color:      '#2e3420',
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

      {/* ── Drawer overlay (position fixed — covers all layers) ── */}
      {drawerOpen && (
        <div
          style={{
            position:   'fixed',
            inset:      0,
            background: 'rgba(0,0,0,0.18)',
            zIndex:     300,
          }}
        />
      )}

      {/* ── Drawer panel (position fixed — slides in from left) ── */}
      <div
        className="kepos-drawer"
        style={{
          position:      'fixed',
          top:           0,
          left:          0,
          bottom:        0,
          width:         '260px',
          background:    '#1a1a18',
          zIndex:        400,
          transform:     drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition:    'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)',
          display:       'flex',
          flexDirection: 'column',
          paddingTop:    'max(28px, env(safe-area-inset-top))',
          paddingBottom: 'max(28px, env(safe-area-inset-bottom))',
        }}
      >
        {/* Drawer header */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '0 20px 32px',
        }}>
          <span style={{
            fontFamily:    'Georgia, serif',
            fontSize:      '12px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color:         '#6b7c47',
            opacity:       0.8,
          }}>kepos</span>
          <button
            onClick={() => setDrawerOpen(false)}
            style={{
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              color:      '#5a5a5a',
              fontSize:   '18px',
              lineHeight: 1,
              padding:    '4px',
            }}
          >✕</button>
        </div>

        {/* Drawer items */}
        <nav style={{ flex: 1, overflow: 'auto' }}>
          {drawerItems.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                display:    'flex',
                alignItems: 'center',
                gap:        '14px',
                width:      '100%',
                padding:    '14px 24px',
                background: 'none',
                border:     'none',
                cursor:     'pointer',
                textAlign:  'left',
                color:      '#b8b0a0',
                fontFamily: 'Georgia, serif',
                fontSize:   '15px',
                transition: 'color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#e8e4dc'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              onMouseLeave={e => { e.currentTarget.style.color = '#b8b0a0'; e.currentTarget.style.background = 'none' }}
            >
              <span style={{ fontSize: '14px', opacity: 0.7, minWidth: '20px' }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
      </div>

    </div>
  )
}
