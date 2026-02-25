/**
 * GraphScreen.jsx
 * ─────────────────────────────────────────────────────────────
 * Force-directed graph entry screen — the first thing users see.
 *
 * Every public room is a node; parent_room_id relationships are edges.
 * The user's own rooms glow warm (amber); public-only rooms are cool (sky-blue).
 * Node size scales with conversational density (participant count + characters).
 *
 * Persistent nav:
 *   Bottom-left  → My Chats   (slide-up InboxScreen panel, 'my' tab)
 *   Bottom-right → Browse All (slide-up InboxScreen panel, 'all' tab)
 *   Bottom-center → GPS breadcrumb; tap to zoomToFit
 *
 * Architecture notes for future builds: see graphUtils.js header.
 * ─────────────────────────────────────────────────────────────
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { ForceGraph2D } from 'react-force-graph'
import { buildGraphData, computeBreadcrumb } from '../utils/graphUtils.js'
import { fetchAllRooms, fetchMyRooms } from '../utils/roomUtils.js'
import { getVisitedRoomCodes, generateRoomName, relativeTime } from '../utils/inboxUtils.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import InboxScreen from './InboxScreen.jsx'

const GRAPH_POS_KEY = 'gc_graph_pos'
const POLL_INTERVAL = 60_000   // ms

const MODE_COLORS = {
  chat:    '#4f7cff',
  discuss: '#a855f7',
  plan:    '#f59e0b',
  advise:  '#22c55e',
}

// ── Position persistence ──────────────────────────────────────────────────────

function saveGraphPos(zoom, cx, cy) {
  try { localStorage.setItem(GRAPH_POS_KEY, JSON.stringify({ zoom, cx, cy })) } catch {}
}

function loadGraphPos() {
  try {
    const raw = localStorage.getItem(GRAPH_POS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

// ── Node preview card ─────────────────────────────────────────────────────────

function NodePreviewCard({ node, screenPos, containerW, containerH, onEnter, onDismiss }) {
  const CARD_W = 260
  const CARD_H = 230
  const PAD    = 12

  // Position above the tap point, clamped to viewport
  let left = Math.round(screenPos.x - CARD_W / 2)
  let top  = Math.round(screenPos.y - CARD_H - 20)
  left = Math.max(PAD, Math.min(containerW - CARD_W - PAD, left))
  top  = Math.max(PAD, Math.min(containerH - CARD_H - PAD, top))

  const room      = node.room
  const roomName  = generateRoomName(room.characters ?? []) || room.code
  const modeName  = room.mode?.name || 'Chat'
  const modeId    = room.mode?.id   || 'chat'
  const modeColor = MODE_COLORS[modeId] || '#4f7cff'
  const activity  = relativeTime(room.lastActivity || room.createdAt)
  const charList  = (room.characters ?? []).slice(0, 3)

  return (
    <div
      className="graph-node-preview"
      style={{ left, top }}
      onClick={e => e.stopPropagation()}
    >
      <button className="graph-preview-dismiss" onClick={onDismiss} aria-label="Dismiss">×</button>

      {charList.length > 0 && (
        <div
          className="graph-preview-avatars"
          style={{ width: 28 + (charList.length - 1) * 18 }}
        >
          {charList.map((c, i) => (
            <div
              key={c.id || i}
              className="graph-preview-avatar"
              style={{ background: c.color, left: i * 18, zIndex: charList.length - i }}
            >
              {c.initial}
            </div>
          ))}
        </div>
      )}

      <div className="graph-preview-name">{roomName}</div>

      <div className="graph-preview-meta">
        <span
          className="graph-preview-mode"
          style={{
            background:  `${modeColor}22`,
            color:       modeColor,
            borderColor: `${modeColor}44`,
          }}
        >
          {modeName}
        </span>
        {room.participantCount > 0 && (
          <span className="graph-preview-participants">👤 {room.participantCount}</span>
        )}
        <span className="graph-preview-time">{activity}</span>
      </div>

      {room.lastMessagePreview && (
        <div className="graph-preview-excerpt">{room.lastMessagePreview}</div>
      )}

      <button className="graph-preview-enter" onClick={onEnter}>
        Enter room →
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function GraphScreen({ onOpenRoom, onStartRoom, onSignIn }) {
  const { isAuthenticated, userId, authLoading } = useAuth()

  const [graphData,    setGraphData]    = useState({ nodes: [], links: [] })
  const [loading,      setLoading]      = useState(true)
  const [selectedNode, setSelectedNode] = useState(null)
  const [previewPos,   setPreviewPos]   = useState({ x: 0, y: 0 })
  const [showInbox,    setShowInbox]    = useState(false)
  const [inboxTab,     setInboxTab]     = useState('my')
  const [breadcrumb,   setBreadcrumb]   = useState('All Rooms')
  const [dimensions,   setDimensions]   = useState({
    w: window.innerWidth,
    h: window.innerHeight,
  })

  // Refs that avoid stale-closure issues in stable callbacks
  const fgRef         = useRef(null)
  const nodesRef      = useRef([])
  const zoomRef       = useRef({ k: 1, x: 0, y: 0 })
  const dimensionsRef = useRef(dimensions)
  const posDebounce   = useRef(null)

  // ── Responsive dimensions ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      const d = { w: window.innerWidth, h: window.innerHeight }
      dimensionsRef.current = d
      setDimensions(d)
    }
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // ── Data loading + polling ───────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (authLoading) return
    try {
      const visitedCodes = isAuthenticated ? [] : getVisitedRoomCodes()
      const [pub, mine]  = await Promise.all([
        fetchAllRooms(),
        fetchMyRooms(visitedCodes, isAuthenticated ? userId : null),
      ])
      const data = buildGraphData(pub, mine)
      nodesRef.current = data.nodes
      setGraphData(data)
    } catch (err) {
      console.warn('[GraphScreen] load error:', err)
    } finally {
      setLoading(false)
    }
  }, [authLoading, isAuthenticated, userId])

  useEffect(() => {
    loadData()
    const poll = setInterval(loadData, POLL_INTERVAL)
    return () => clearInterval(poll)
  }, [loadData])

  // ── D3 force customisation (after mount) ─────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      const fg = fgRef.current
      if (!fg) return
      try {
        fg.d3Force('charge')?.strength(-180)
        fg.d3Force('link')?.distance(80).strength(0.4)
      } catch {}
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  // ── Position restore (500ms after data loads, giving simulation time to settle) ──
  useEffect(() => {
    if (loading) return
    const saved = loadGraphPos()
    const timer = setTimeout(() => {
      const fg = fgRef.current
      if (!fg) return
      if (saved?.zoom) {
        fg.zoom(saved.zoom, 0)
        fg.centerAt(saved.cx, saved.cy, 0)
      } else {
        fg.zoomToFit(400, 60)
      }
    }, 500)
    return () => clearTimeout(timer)
  }, [loading])

  // ── Zoom handler → breadcrumb + debounced position save ──────────────────────
  // Uses refs for dimensions/nodes so this callback is stable (no deps that change).
  const handleZoom = useCallback(({ k, x, y }) => {
    zoomRef.current = { k, x, y }
    const { w, h } = dimensionsRef.current
    const cx = (w / 2 - x) / k
    const cy = (h / 2 - y) / k
    setBreadcrumb(computeBreadcrumb(k, cx, cy, nodesRef.current))
    clearTimeout(posDebounce.current)
    posDebounce.current = setTimeout(() => saveGraphPos(k, cx, cy), 600)
  }, [])

  // ── Node canvas drawing ───────────────────────────────────────────────────────
  const drawNode = useCallback((node, ctx, globalScale) => {
    const { x, y } = node
    if (x === undefined || y === undefined) return

    const r       = node.size ?? 6
    const screenR = r * globalScale

    // Warm outer glow for the user's own rooms
    if (node.isOwn) {
      const grd = ctx.createRadialGradient(x, y, r * 0.5, x, y, r + 7)
      grd.addColorStop(0, node.color + '55')
      grd.addColorStop(1, node.color + '00')
      ctx.beginPath()
      ctx.arc(x, y, r + 7, 0, 2 * Math.PI)
      ctx.fillStyle = grd
      ctx.fill()
    }

    // Main filled circle
    ctx.beginPath()
    ctx.arc(x, y, r, 0, 2 * Math.PI)
    ctx.fillStyle = node.color
    ctx.fill()

    // Border ring
    ctx.lineWidth   = node.isOwn ? 1.5 / globalScale : 0.8 / globalScale
    ctx.strokeStyle = node.isOwn ? '#ff8a0088' : '#ffffff22'
    ctx.stroke()

    // Character initial (visible when node is large enough on screen)
    if (screenR > 10) {
      ctx.fillStyle    = 'rgba(255,255,255,0.88)'
      ctx.font         = `bold ${r * 0.75}px system-ui, sans-serif`
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(node.room?.characters?.[0]?.initial ?? '?', x, y)
    }

    // Room name label below the node (only when zoomed in)
    if (screenR > 18 && node.label) {
      const fs = Math.max(4, 9 / globalScale)
      ctx.font         = `${fs}px system-ui, sans-serif`
      ctx.fillStyle    = node.colorLight
      ctx.textAlign    = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(node.label, x, y + r + 2 / globalScale)
    }
  }, [])

  // ── Enlarged touch pointer area (mobile tap targets) ─────────────────────────
  const paintPointerArea = useCallback((node, color, ctx) => {
    const { x, y } = node
    if (x === undefined || y === undefined) return
    const r = Math.max((node.size ?? 6) + 8, 22)
    ctx.beginPath()
    ctx.arc(x, y, r, 0, 2 * Math.PI)
    ctx.fillStyle = color
    ctx.fill()
  }, [])

  // ── Node click → floating preview card ───────────────────────────────────────
  const handleNodeClick = useCallback((node, event) => {
    setSelectedNode(node)
    setPreviewPos({ x: event.clientX, y: event.clientY })
  }, [])

  const handleBgClick = useCallback(() => setSelectedNode(null), [])

  // ── Inbox panel ───────────────────────────────────────────────────────────────
  const openMyChats   = () => { setInboxTab('my');  setShowInbox(true) }
  const openBrowseAll = () => { setInboxTab('all'); setShowInbox(true) }
  const closeInbox    = () => setShowInbox(false)

  const handleZoomToFit = () => fgRef.current?.zoomToFit(400, 60)

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="graph-screen">

      {/* ── Force-directed graph canvas ── */}
      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        width={dimensions.w}
        height={dimensions.h}
        backgroundColor="#090d18"
        nodeCanvasObject={drawNode}
        nodeCanvasObjectMode={() => 'replace'}
        nodePointerAreaPaint={paintPointerArea}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBgClick}
        onZoom={handleZoom}
        linkColor={() => '#243050'}
        linkWidth={0.8}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.15}
        cooldownTicks={200}
        d3AlphaDecay={0.025}
        d3VelocityDecay={0.35}
        enableNodeDrag
        enableZoomInteraction
        enablePanInteraction
      />

      {/* ── App wordmark ── */}
      <div className="graph-wordmark">groupchat</div>

      {/* ── Loading overlay ── */}
      {loading && (
        <div className="graph-loading">
          <div className="loading-spinner" />
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && graphData.nodes.length === 0 && (
        <div className="graph-empty-state">
          <div className="graph-empty-icon">✦</div>
          <div className="graph-empty-title">No public rooms yet</div>
          <div className="graph-empty-sub">
            Start a room and set it to public to see it appear here
          </div>
          <button className="graph-empty-btn" onClick={onStartRoom}>
            Start a Room
          </button>
        </div>
      )}

      {/* ── Node preview card ── */}
      {selectedNode && (
        <NodePreviewCard
          node={selectedNode}
          screenPos={previewPos}
          containerW={dimensions.w}
          containerH={dimensions.h}
          onEnter={() => {
            const code = selectedNode.room?.code
            setSelectedNode(null)
            if (code) onOpenRoom(code)
          }}
          onDismiss={() => setSelectedNode(null)}
        />
      )}

      {/* ── Persistent bottom bar ── */}
      <div className="graph-bottom-bar">
        <button className="graph-nav-btn" onClick={openMyChats}>
          <span className="graph-nav-icon">💬</span>
          <span>My Chats</span>
        </button>

        <button
          className="graph-breadcrumb"
          onClick={handleZoomToFit}
          title="Zoom to fit"
        >
          {breadcrumb}
        </button>

        <button className="graph-nav-btn" onClick={openBrowseAll}>
          <span className="graph-nav-icon">🔍</span>
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
              onStartRoom={() => { closeInbox(); onStartRoom() }}
              onOpenRoom={(code)  => { closeInbox(); onOpenRoom(code) }}
              onJoinRoom={(code)  => { closeInbox(); onOpenRoom(code) }}
              onSignIn={() => { closeInbox(); onSignIn() }}
            />
          </div>
        </div>
      )}

    </div>
  )
}
