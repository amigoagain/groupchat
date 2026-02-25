/**
 * graphUtils.js
 * ─────────────────────────────────────────────────────────────
 * Helpers for building the force-directed graph data model from room arrays,
 * computing node visual properties, and deriving the GPS breadcrumb label.
 *
 * PERFORMANCE ARCHITECTURE NOTES (for future builds):
 *   50+ nodes:  Introduce cluster grouping (d3-force-cluster or hull rendering).
 *               Nodes in the same branch-tree should form visually labelled clusters.
 *               Add a `clusterId` property to each node computed from the root
 *               ancestor of its branch chain. Render convex hulls per cluster.
 *
 *   200+ nodes: Switch to regional / level-of-detail rendering. Only materialise
 *               (simulate + draw) nodes within the current viewport frustum.
 *               Distant clusters collapse into a single aggregate "cloud" node
 *               with a count badge. Implement using quadtree spatial indexing
 *               on the node positions (d3-quadtree) and re-materialise on pan.
 * ─────────────────────────────────────────────────────────────
 */

import { generateRoomName } from './inboxUtils.js'

// ── Color helpers ─────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex ?? '').trim())
  return m
    ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
    : null
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b]
    .map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Linear blend between two hex colours.
 * t = 0 → pure hexA, t = 1 → pure hexB.
 */
export function blendHex(hexA, hexB, t) {
  const a = hexToRgb(hexA)
  const b = hexToRgb(hexB)
  if (!a || !b) return hexA
  return rgbToHex(
    a.r * (1 - t) + b.r * t,
    a.g * (1 - t) + b.g * t,
    a.b * (1 - t) + b.b * t,
  )
}

/**
 * Lighten a hex colour by adding `amount` (0–255) to each channel.
 */
export function lightenHex(hex, amount) {
  const c = hexToRgb(hex)
  if (!c) return hex
  return rgbToHex(c.r + amount, c.g + amount, c.b + amount)
}

// ── Node sizing ───────────────────────────────────────────────────────────────

// Tint targets: public rooms blend toward cool sky-blue; own rooms toward warm amber.
const COOL_TINT = '#00b4d8'
const WARM_TINT = '#ff8a00'

const NODE_BASE     = 6   // minimum radius (px)
const NODE_MAX_GROW = 12  // maximum additional radius from density

/**
 * Compute node radius from room data.
 * Scales with participant count; capped so the graph doesn't become unreadable.
 */
function computeNodeSize(room) {
  const density =
    Math.min((room.participantCount ?? 0) * 1.5 + (room.characters?.length ?? 0) * 0.5,
             NODE_MAX_GROW)
  return NODE_BASE + density
}

/**
 * Derive the primary display colour for a node.
 * Public nodes blend toward a cool palette; the user's own nodes toward warm.
 */
function computeNodeColor(room, isOwn) {
  const chars     = room.characters ?? []
  const baseColor = chars[0]?.color ?? (isOwn ? '#ff9a4f' : '#4f7cff')
  return isOwn
    ? blendHex(baseColor, WARM_TINT, 0.45)
    : blendHex(baseColor, COOL_TINT, 0.35)
}

// ── Graph data builder ────────────────────────────────────────────────────────

/**
 * Build the { nodes, links } object consumed by <ForceGraph2D>.
 *
 * Merges public rooms and the user's own rooms, deduplicating by room id.
 * Edges are derived from parent_room_id relationships — only created when
 * both the child and the parent are present in the node set.
 *
 * @param {Room[]} publicRooms   — result of fetchAllRooms()
 * @param {Room[]} myRooms       — result of fetchMyRooms()
 * @returns {{ nodes: GraphNode[], links: GraphLink[] }}
 */
export function buildGraphData(publicRooms, myRooms) {
  // Map: id → { room, isOwn }
  const map = new Map()

  for (const room of publicRooms) {
    const key = room.id ?? room.code
    if (key) map.set(key, { room, isOwn: false })
  }

  // User's rooms overlay — mark isOwn; may overlap with publicRooms
  for (const room of myRooms) {
    const key = room.id ?? room.code
    if (!key) continue
    const existing = map.get(key)
    // Prefer the richer room object but always mark as isOwn
    map.set(key, { room: existing?.room ?? room, isOwn: true })
  }

  const nodes    = []
  const nodeIds  = new Set()

  for (const [id, { room, isOwn }] of map) {
    const color = computeNodeColor(room, isOwn)
    const size  = computeNodeSize(room)
    nodes.push({
      id,
      room,
      isOwn,
      size,
      val:        size,            // ForceGraph2D uses `val` for built-in charge strength
      color,
      colorLight: lightenHex(color, 45),
      label:      generateRoomName(room.characters ?? []) || room.code || '',
    })
    nodeIds.add(id)
  }

  // Edges from branch relationships
  const links = []
  for (const node of nodes) {
    const parentId = node.room.parentRoomId
    if (parentId && nodeIds.has(parentId)) {
      links.push({ source: parentId, target: node.id })
    }
  }

  return { nodes, links }
}

// ── GPS breadcrumb ────────────────────────────────────────────────────────────

/**
 * V1 breadcrumb — simple zoom-context label shown at the bottom of the graph.
 *
 * Rules:
 *   zoom < 0.7            → "All Rooms"
 *   zoom 0.7–∞, nodes nearby → most common character name near viewport centre
 *   fallback              → nearby node count string
 *
 * Full territory / cluster / thread hierarchy is planned for a later build.
 * When cluster grouping is introduced (50+ nodes), this function should
 * instead surface the cluster label of the dominant nearby cluster.
 *
 * @param {number}       zoom       — current d3-zoom scale (k)
 * @param {number}       centerX    — graph-space x of viewport centre
 * @param {number}       centerY    — graph-space y of viewport centre
 * @param {GraphNode[]}  nodes      — all nodes (with .x / .y from simulation)
 * @returns {string}
 */
export function computeBreadcrumb(zoom, centerX, centerY, nodes) {
  if (zoom < 0.7 || nodes.length === 0) return 'All Rooms'

  const radius = 180 / zoom  // world-space search radius, shrinks as we zoom in
  const nearby = nodes.filter(n => {
    const dx = (n.x ?? 0) - centerX
    const dy = (n.y ?? 0) - centerY
    return dx * dx + dy * dy < radius * radius
  })

  if (nearby.length === 0) return 'All Rooms'

  // Tally character occurrences across nearby nodes
  const tally = {}
  for (const n of nearby) {
    for (const c of (n.room?.characters ?? [])) {
      tally[c.name] = (tally[c.name] ?? 0) + 1
    }
  }

  const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]
  if (top) return top[0]

  return `${nearby.length} room${nearby.length !== 1 ? 's' : ''}`
}
