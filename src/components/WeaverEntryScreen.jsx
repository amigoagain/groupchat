/**
 * WeaverEntryScreen.jsx
 * ─────────────────────────────────────────────────────────────
 * Three-layer entry screen:
 *
 *   Layer 1 — Procedural Three.js net
 *     Atmospheric gossamer web. ~120 nodes, ~250 edges.
 *     Five invisible gravitational anchors (Philosophy, Science,
 *     History, Culture, Psychology) give the net spatial structure.
 *     Slow undulating breathing animation per node.
 *     Touch ripple: disturbance propagates from point of contact.
 *     User's existing rooms appear as warmer nodes in approximate
 *     domain positions.
 *
 *   Layer 2 — Weaver conversation interface
 *     Minimal input bar. Short chat thread above it.
 *     Weaver system prompt drives room creation in ≤3 exchanges.
 *     Detects ROOM_CREATE:{...} signal, creates the room via
 *     existing createRoom logic, triggers node crystallisation.
 *
 *   Layer 3 — Persistent navigation
 *     My Chats (bottom-left) and Browse All (bottom-right).
 *     Always visible. Opens InboxScreen as slide-up panel.
 *
 * V2 note: The live-data graph (real rooms as real nodes with
 * real edges) is the natural evolution of this screen. The
 * procedural net is its foundation.
 * ─────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { callDirectAPI } from '../services/claudeApi.js'
import { loadAllCharacters } from '../utils/customCharacters.js'
import { createRoom } from '../utils/roomUtils.js'
import { getVisitedRoomCodes, generateRoomName } from '../utils/inboxUtils.js'
import { inferDomain, DOMAIN_COLORS } from '../utils/domainUtils.js'
import { modes } from '../data/modes.js'
import { useAuth } from '../contexts/AuthContext.jsx'
import InboxScreen from './InboxScreen.jsx'

// ── Constants ─────────────────────────────────────────────────────────────────

const NODE_COUNT   = 120
const MAX_EDGES_PP = 3      // max edges per node
const EDGE_DIST    = 7.5    // max world-space distance to form an edge
const BREATHE_AMP  = 0.35   // base undulation amplitude
const BREATHE_FREQ = 0.22   // base undulation frequency

// Five anchor regions (world-space x/y, z kept shallow)
const ANCHORS = [
  { domain: 'Philosophy', x: -13, y:  9 },
  { domain: 'Science',    x:  13, y:  9 },
  { domain: 'History',    x: -13, y: -9 },
  { domain: 'Culture',    x:  13, y: -9 },
  { domain: 'Psychology', x:   0, y:  0 },
]

// Domain → nearest anchor (for topic stirring + user-room positioning)
const DOMAIN_TO_ANCHOR = {
  Philosophy: 'Philosophy',
  Science:    'Science',
  Tech:       'Science',
  History:    'History',
  Politics:   'History',
  Arts:       'Culture',
  Culture:    'Culture',
  Psychology: 'Psychology',
  Health:     'Psychology',
  Business:   'Culture',
  Law:        'History',
  Other:      'Psychology',
}

// Simple keyword → domain mapping for live text stirring
const TOPIC_KEYWORDS = {
  Philosophy: [
    'philosophy','conscious','exist','meaning','truth','moral','ethic','logic',
    'metaphysic','ontolog','epistem','virtue','soul','mind','free will',
    'sartre','nietzsche','plato','aristotle','kant','hegel','descartes',
    'camus','heidegger','beauvoir','stoic','socrates','epicurus','spinoza',
    'wittgenstein','rousseau','voltaire','locke','hume','russell','mill',
  ],
  Science: [
    'science','physics','biology','chemistry','quantum','relativity','atom',
    'evolution','genetics','astronomy','cosmology','experiment','hypothesis',
    'darwin','einstein','feynman','sagan','curie','newton','hawking',
    'turing','tesla','bohr','galileo','climate','ecology','medicine',
  ],
  History: [
    'history','war','empire','revolution','ancient','medieval','renaissance',
    'napoleon','caesar','lincoln','churchill','cleopatra','alexander',
    'colonial','feudal','dynasty','republic','conquest','civilization',
    'wwi','wwii','cold war','ottoman','roman','greek','medieval',
  ],
  Culture: [
    'art','music','literature','film','culture','society','creative',
    'shakespeare','mozart','beethoven','kafka','woolf','twain','kahlo',
    'jazz','classical','poetry','novel','theatre','cinema','design',
    'architecture','fashion','food','sports','media','celebrity',
  ],
  Psychology: [
    'psychology','mind','behav','cognitive','emotion','therapy','anxiety',
    'depression','trauma','memory','perception','personality','motivation',
    'freud','jung','maslow','skinner','james','erikson','piaget','pavlov',
    'unconscious','dream','archetype','habit','identity','attachment',
  ],
}

// Weaver system prompt
const WEAVER_SYSTEM_PROMPT = `You are the Weaver, the guide of GroupChat — a platform where users have conversations with multiple AI characters simultaneously. Your job is to help users create a room in as few exchanges as possible. You are warm, curious, and brief. You never use jargon. You sound like a knowledgeable friend, not a form.

When a user describes what they want — topics, figures, questions — do the following:
1. Identify which characters from the GroupChat library best match their interest. The library includes historical figures, philosophers, scientists, and expert personas.
2. Suggest 2–4 characters by name with a single sentence explaining why they fit. If the user named specific characters, confirm them.
3. Infer the appropriate mode: Chat for casual or exploratory, Discuss for analytical or debate-style, Plan for goal-oriented, Advise for professional guidance.
4. Ask one clarifying question only if genuinely needed — public or private, or a significant character mismatch. If everything is clear, skip clarification entirely.
5. Confirm the room configuration in one sentence and ask if they are ready to begin.
6. On confirmation, emit a JSON object in this exact format and nothing else:
ROOM_CREATE:{"characters":["Name1","Name2"],"mode":"discuss","visibility":"private","topic":"brief topic"}

The app detects the ROOM_CREATE signal, creates the room automatically, and navigates the user in.

Rules:
- Never require more than three exchanges. If intent is clear after one, create the room after one.
- Speed and warmth over thoroughness.
- Keep responses under 60 words except for the ROOM_CREATE signal.
- When emitting ROOM_CREATE, output ONLY that line — nothing before or after.`

// ── Three.js net builder ───────────────────────────────────────────────────────

function buildNet(w, h) {
  // Normalise anchor positions to world coords based on camera FOV ~50°, z=28
  const aspect = w / h
  const scaleX = 18 * aspect
  const scaleY = 18

  const nodes = []
  for (let i = 0; i < NODE_COUNT; i++) {
    const anchor = ANCHORS[Math.floor(Math.random() * ANCHORS.length)]
    const spread = 0.55
    const x = anchor.x * (scaleX / 18) + (Math.random() - 0.5) * scaleX * spread
    const y = anchor.y * (scaleY / 18) + (Math.random() - 0.5) * scaleY * spread
    const z = (Math.random() - 0.5) * 6
    nodes.push({
      bx: x, by: y, bz: z,     // base positions
      cx: x, cy: y, cz: z,     // current positions (updated in loop)
      phase:  Math.random() * Math.PI * 2,
      phase2: Math.random() * Math.PI * 2,
      domain: anchor.domain,
      isUserRoom: false,
    })
  }

  // Build edges: k-nearest within EDGE_DIST, cap at MAX_EDGES_PP
  const edgeCount = new Array(NODE_COUNT).fill(0)
  const edges = []
  for (let i = 0; i < NODE_COUNT; i++) {
    if (edgeCount[i] >= MAX_EDGES_PP) continue
    const ni = nodes[i]
    // candidates sorted by distance
    const nearby = []
    for (let j = i + 1; j < NODE_COUNT; j++) {
      const nj = nodes[j]
      const dx = ni.bx - nj.bx, dy = ni.by - nj.by, dz = ni.bz - nj.bz
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (d < EDGE_DIST) nearby.push({ j, d })
    }
    nearby.sort((a, b) => a.d - b.d)
    for (const { j } of nearby) {
      if (edgeCount[i] >= MAX_EDGES_PP) break
      if (edgeCount[j] >= MAX_EDGES_PP) continue
      edges.push([i, j])
      edgeCount[i]++
      edgeCount[j]++
    }
  }

  return { nodes, edges }
}

// ── Detect active domains from typed text ─────────────────────────────────────

function detectDomains(text) {
  const lower = text.toLowerCase()
  const active = new Set()
  for (const [domain, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) active.add(domain)
  }
  return active
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function WeaverEntryScreen({ onOpenRoom, onRoomCreated, onSignIn }) {
  const { isAuthenticated, userId, username, authLoading } = useAuth()

  // ── Weaver chat state ────────────────────────────────────────────────────────
  const [messages,      setMessages]      = useState([])
  const [inputText,     setInputText]     = useState('')
  const [weaverLoading, setWeaverLoading] = useState(false)
  const [activeDomains, setActiveDomains] = useState(new Set())
  const [crystallising, setCrystallising] = useState(null) // { domain, color }
  const [weaverError,   setWeaverError]   = useState('')

  // ── Inbox panel state ────────────────────────────────────────────────────────
  const [showInbox, setShowInbox] = useState(false)
  const [inboxTab,  setInboxTab]  = useState('my')

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const canvasRef       = useRef(null)
  const threeRef        = useRef(null)   // { scene, camera, renderer, nodes, edges, … }
  const animFrameRef    = useRef(null)
  const rippleRef       = useRef([])     // [{ x, y, z, t }]
  const inputRef        = useRef(null)
  const chatEndRef      = useRef(null)
  const abortRef        = useRef(null)
  const allCharsRef     = useRef([])
  const activeDomRef    = useRef(new Set())
  const crystalNodeRef  = useRef(null)   // THREE.Mesh for crystallisation

  // ── Load characters once ──────────────────────────────────────────────────
  useEffect(() => {
    loadAllCharacters().then(chars => { allCharsRef.current = chars }).catch(() => {})
  }, [])

  // ── Scroll chat to bottom on new message ─────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Keep activeDomRef in sync ─────────────────────────────────────────────
  useEffect(() => { activeDomRef.current = activeDomains }, [activeDomains])

  // ── Three.js setup ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const w = window.innerWidth
    const h = window.innerHeight

    // Scene + camera
    const scene    = new THREE.Scene()
    const camera   = new THREE.PerspectiveCamera(50, w / h, 0.1, 200)
    camera.position.z = 28

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false })
    renderer.setSize(w, h)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setClearColor(0x000000, 0)

    // Build net data
    const { nodes, edges } = buildNet(w, h)

    // ── Node Points ──────────────────────────────────────────────────────────
    const nodePosArr = new Float32Array(NODE_COUNT * 3)
    const nodeColArr = new Float32Array(NODE_COUNT * 3)
    for (let i = 0; i < NODE_COUNT; i++) {
      const n = nodes[i]
      nodePosArr[i * 3]     = n.bx
      nodePosArr[i * 3 + 1] = n.by
      nodePosArr[i * 3 + 2] = n.bz
      // Cool blue-white base colour
      nodeColArr[i * 3]     = 0.35
      nodeColArr[i * 3 + 1] = 0.45
      nodeColArr[i * 3 + 2] = 0.75
    }

    const nodeGeo = new THREE.BufferGeometry()
    nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePosArr, 3))
    nodeGeo.setAttribute('color',    new THREE.BufferAttribute(nodeColArr, 3))
    const nodeMat = new THREE.PointsMaterial({
      size:            3.2,
      vertexColors:    true,
      sizeAttenuation: false,
      transparent:     true,
      opacity:         0.65,
    })
    const nodesMesh = new THREE.Points(nodeGeo, nodeMat)
    scene.add(nodesMesh)

    // ── Edge LineSegments ─────────────────────────────────────────────────────
    const edgePosArr = new Float32Array(edges.length * 2 * 3)
    const edgeGeo    = new THREE.BufferGeometry()
    edgeGeo.setAttribute('position', new THREE.BufferAttribute(edgePosArr, 3))
    const edgeMat = new THREE.LineBasicMaterial({
      color:       0x1e3050,
      transparent: true,
      opacity:     0.45,
    })
    const edgesMesh = new THREE.LineSegments(edgeGeo, edgeMat)
    scene.add(edgesMesh)

    // Store on ref
    threeRef.current = {
      scene, camera, renderer,
      nodes, edges,
      nodeGeo, nodeColArr, nodePosArr,
      edgeGeo, edgePosArr,
    }

    // ── User rooms overlay ────────────────────────────────────────────────────
    _addUserRoomNodes(threeRef.current, w, h, allCharsRef.current)

    // ── Animation loop ────────────────────────────────────────────────────────
    const clock = new THREE.Clock()

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()
      const r = threeRef.current
      if (!r) return

      const pos  = r.nodeGeo.attributes.position.array
      const col  = r.nodeGeo.attributes.color.array
      const now  = performance.now() / 1000

      for (let i = 0; i < NODE_COUNT; i++) {
        const n  = r.nodes[i]
        const ad = activeDomRef.current

        // Stirring boost: active domains breathe wider
        const dominated = ad.size > 0 && ad.has(n.domain)
        const amp  = dominated ? BREATHE_AMP * 3.5 : BREATHE_AMP
        const freq = dominated ? BREATHE_FREQ * 1.6 : BREATHE_FREQ

        // Base undulation
        let x = n.bx + Math.sin(t * freq       + n.phase)  * amp
        let y = n.by + Math.cos(t * freq * 0.9 + n.phase)  * amp
        let z = n.bz + Math.sin(t * freq * 0.7 + n.phase2) * amp * 0.8

        // Ripple displacements
        for (const rip of rippleRef.current) {
          const age = now - rip.t
          if (age > 3) continue
          const dx = x - rip.x, dy = y - rip.y
          const d2 = dx * dx + dy * dy
          const wave = Math.exp(-age * 1.8) * Math.sin(age * 6 - Math.sqrt(d2) * 0.7)
          x += (dx / (Math.sqrt(d2) + 0.01)) * wave * 1.2
          y += (dy / (Math.sqrt(d2) + 0.01)) * wave * 1.2
        }

        pos[i * 3]     = x
        pos[i * 3 + 1] = y
        pos[i * 3 + 2] = z
        n.cx = x; n.cy = y; n.cz = z

        // Colour: warm tint for active domains
        if (dominated) {
          col[i * 3]     = 0.55 + Math.sin(t * 2 + n.phase) * 0.08
          col[i * 3 + 1] = 0.42
          col[i * 3 + 2] = 0.85
        } else {
          col[i * 3]     = 0.35
          col[i * 3 + 1] = 0.45
          col[i * 3 + 2] = 0.75
        }
      }
      r.nodeGeo.attributes.position.needsUpdate = true
      r.nodeGeo.attributes.color.needsUpdate    = true

      // Update edges
      const ep = r.edgeGeo.attributes.position.array
      for (let e = 0; e < r.edges.length; e++) {
        const [a, b] = r.edges[e]
        ep[e * 6]     = pos[a * 3];     ep[e * 6 + 1] = pos[a * 3 + 1]; ep[e * 6 + 2] = pos[a * 3 + 2]
        ep[e * 6 + 3] = pos[b * 3];     ep[e * 6 + 4] = pos[b * 3 + 1]; ep[e * 6 + 5] = pos[b * 3 + 2]
      }
      r.edgeGeo.attributes.position.needsUpdate = true

      // Crystallisation animation
      if (crystalNodeRef.current) {
        const cn = crystalNodeRef.current
        cn.userData.age = (cn.userData.age || 0) + 0.016
        const age = cn.userData.age
        const scale = Math.min(age * 2.5, 1) * (1 + Math.sin(age * 8) * 0.08)
        cn.scale.setScalar(scale)
        cn.material.opacity = Math.min(age * 2, 1)
        cn.rotation.z = age * 0.8
      }

      // Clean old ripples
      const cutoff = now - 3.5
      rippleRef.current = rippleRef.current.filter(rp => rp.t > cutoff)

      r.renderer.render(r.scene, r.camera)
    }

    animate()

    // ── Resize handler ────────────────────────────────────────────────────────
    function onResize() {
      const nw = window.innerWidth, nh = window.innerHeight
      if (!threeRef.current) return
      threeRef.current.camera.aspect = nw / nh
      threeRef.current.camera.updateProjectionMatrix()
      threeRef.current.renderer.setSize(nw, nh)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('resize', onResize)
      renderer.dispose()
      nodeGeo.dispose(); nodeMat.dispose()
      edgeGeo.dispose(); edgeMat.dispose()
      threeRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Add user room nodes to scene ──────────────────────────────────────────
  function _addUserRoomNodes(r, w, h) {
    const visitedCodes = getVisitedRoomCodes()
    if (visitedCodes.length === 0) return

    const aspect = w / h
    const scaleX = 18 * aspect
    const scaleY = 18

    const warmPositions = []
    const warmColors    = []

    for (const code of visitedCodes.slice(0, 20)) {
      try {
        const raw = localStorage.getItem('groupchat_room_' + code)
        if (!raw) continue
        const room = JSON.parse(raw)
        const chars = room.characters || []
        if (chars.length === 0) continue

        // Determine dominant domain from first character
        const dom = inferDomain(chars[0])
        const anchorName = DOMAIN_TO_ANCHOR[dom] || 'Psychology'
        const anchor = ANCHORS.find(a => a.domain === anchorName) || ANCHORS[4]

        const x = anchor.x * (scaleX / 18) + (Math.random() - 0.5) * 5
        const y = anchor.y * (scaleY / 18) + (Math.random() - 0.5) * 5
        const z = (Math.random() - 0.5) * 3

        warmPositions.push(x, y, z)
        // Warm amber-ish tint
        warmColors.push(0.85, 0.55, 0.25)
      } catch {}
    }

    if (warmPositions.length === 0) return

    const wGeo = new THREE.BufferGeometry()
    wGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(warmPositions), 3))
    wGeo.setAttribute('color',    new THREE.BufferAttribute(new Float32Array(warmColors), 3))
    const wMat = new THREE.PointsMaterial({
      size:            5,
      vertexColors:    true,
      sizeAttenuation: false,
      transparent:     true,
      opacity:         0.8,
    })
    r.scene.add(new THREE.Points(wGeo, wMat))
  }

  // ── Touch / click ripple ──────────────────────────────────────────────────
  const handleCanvasTouch = useCallback((e) => {
    const r = threeRef.current
    if (!r) return
    const touch = e.touches ? e.touches[0] : e
    const rect  = canvasRef.current.getBoundingClientRect()
    const nx    = ((touch.clientX - rect.left) / rect.width)  * 2 - 1
    const ny    = -((touch.clientY - rect.top)  / rect.height) * 2 + 1

    // Unproject to world plane z=0
    const vec = new THREE.Vector3(nx, ny, 0.5).unproject(r.camera)
    const dir = vec.sub(r.camera.position).normalize()
    const dist = -r.camera.position.z / dir.z
    const pos = r.camera.position.clone().addScaledVector(dir, dist)

    rippleRef.current.push({ x: pos.x, y: pos.y, z: 0, t: performance.now() / 1000 })
  }, [])

  // ── Input text change → detect domains ───────────────────────────────────
  const handleInputChange = (e) => {
    const val = e.target.value
    setInputText(val)
    setActiveDomains(val.trim() ? detectDomains(val) : new Set())
  }

  // ── Crystallisation effect ────────────────────────────────────────────────
  function triggerCrystallisation(domain, color) {
    const r = threeRef.current
    if (!r) return

    const anchorName = DOMAIN_TO_ANCHOR[domain] || 'Psychology'
    const anchor = ANCHORS.find(a => a.domain === anchorName) || ANCHORS[4]
    const w = window.innerWidth, h = window.innerHeight
    const aspect = w / h
    const x = anchor.x * (18 * aspect / 18)
    const y = anchor.y

    // Remove previous if any
    if (crystalNodeRef.current) r.scene.remove(crystalNodeRef.current)

    const hexColor = color ? parseInt(color.replace('#', ''), 16) : 0xffaa44
    const geo = new THREE.RingGeometry(0.3, 0.7, 6)
    const mat = new THREE.MeshBasicMaterial({
      color: hexColor, transparent: true, opacity: 0, side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.position.set(x, y, 1)
    mesh.userData.age = 0
    r.scene.add(mesh)
    crystalNodeRef.current = mesh

    // Add a bright point at the same location
    const ptGeo = new THREE.BufferGeometry()
    ptGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([x, y, 1]), 3))
    const ptMat = new THREE.PointsMaterial({ color: hexColor, size: 8, sizeAttenuation: false, transparent: true, opacity: 0.9 })
    const pt = new THREE.Points(ptGeo, ptMat)
    r.scene.add(pt)
    // Auto-remove after 3s
    setTimeout(() => { r.scene.remove(pt); r.scene.remove(mesh); crystalNodeRef.current = null }, 3000)
  }

  // ── Parse ROOM_CREATE and create the room ─────────────────────────────────
  async function handleRoomCreate(signal) {
    try {
      const json    = JSON.parse(signal.slice('ROOM_CREATE:'.length))
      const names   = (json.characters || [])
      const modeId  = json.mode || 'chat'
      const vis     = json.visibility || 'private'
      const topic   = json.topic || ''

      // Resolve character objects by name
      const allChars = allCharsRef.current
      const matched  = names.map(name => {
        const lower = name.toLowerCase()
        return allChars.find(c => c.name.toLowerCase() === lower
          || c.name.toLowerCase().includes(lower.split(' ').slice(-1)[0])
        ) || {
          id:          `custom-${name}`,
          name,
          title:       'Expert',
          initial:     name.charAt(0).toUpperCase(),
          color:       '#4f7cff',
          personality: `You are ${name}. Respond in character based on your known views and expertise.`,
          tags:        [],
        }
      }).filter(Boolean)

      if (matched.length === 0) {
        setWeaverError('Couldn\'t find those characters — try again.')
        return
      }

      const modeObj = modes.find(m => m.id === modeId) || modes[0]

      // Determine dominant domain for crystallisation
      const dom    = inferDomain(matched[0])
      const dc     = DOMAIN_COLORS[dom] || '#4f7cff'
      setCrystallising({ domain: dom, color: dc })
      triggerCrystallisation(dom, dc)

      // Display name
      const displayName = isAuthenticated
        ? (username || localStorage.getItem('groupchat_username') || 'User')
        : (localStorage.getItem('groupchat_username') || 'Guest')

      const room = await createRoom(
        modeObj,
        matched,
        displayName,
        isAuthenticated ? userId : null,
        vis,
        null,
      )

      // Brief pause to let crystallisation play
      await new Promise(res => setTimeout(res, 900))
      setCrystallising(null)
      setActiveDomains(new Set())
      onRoomCreated(room)

    } catch (err) {
      console.error('[WeaverEntry] room create error', err)
      setWeaverError('Something went wrong creating the room. Please try again.')
      setCrystallising(null)
    }
  }

  // ── Send a message to the Weaver ──────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const text = inputText.trim()
    if (!text || weaverLoading || crystallising) return

    setWeaverError('')
    const userMsg = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInputText('')
    setActiveDomains(new Set())
    setWeaverLoading(true)

    abortRef.current?.abort()
    abortRef.current = new AbortController()

    try {
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }))
      const response = await callDirectAPI(WEAVER_SYSTEM_PROMPT, apiMessages, 400, abortRef.current.signal)

      // Check for ROOM_CREATE signal
      if (response.trim().startsWith('ROOM_CREATE:')) {
        setMessages(prev => [...prev, { role: 'assistant', content: response.trim() }])
        setWeaverLoading(false)
        await handleRoomCreate(response.trim())
        return
      }

      setMessages(prev => [...prev, { role: 'assistant', content: response }])
    } catch (err) {
      if (err.name !== 'AbortError') {
        setWeaverError('The Weaver couldn\'t respond — check your API key and try again.')
      }
    } finally {
      setWeaverLoading(false)
    }
  }, [inputText, messages, weaverLoading, crystallising, isAuthenticated, userId, username]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  // ── Inbox panel ───────────────────────────────────────────────────────────
  const openMyChats   = () => { setInboxTab('my');  setShowInbox(true) }
  const openBrowseAll = () => { setInboxTab('all'); setShowInbox(true) }
  const closeInbox    = () => setShowInbox(false)

  // ── Derived helpers ───────────────────────────────────────────────────────
  const hasReturningRooms = getVisitedRoomCodes().length > 0
  const isCreating        = !!crystallising

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="weaver-entry">

      {/* ── Layer 1: Three.js net ── */}
      <canvas
        ref={canvasRef}
        className="weaver-canvas"
        onTouchStart={handleCanvasTouch}
        onClick={handleCanvasTouch}
      />

      {/* ── Wordmark ── */}
      <div className="weaver-wordmark">groupchat</div>

      {/* ── Crystallising overlay ── */}
      {isCreating && (
        <div className="weaver-creating">
          <div className="weaver-creating-ring" style={{ borderColor: crystallising.color }} />
          <div className="weaver-creating-text">Weaving your room…</div>
        </div>
      )}

      {/* ── Layer 2: Weaver conversation thread ── */}
      <div className="weaver-thread-area">

        {/* Welcome hint — only when no messages yet */}
        {messages.length === 0 && !isCreating && (
          <div className="weaver-hint">
            {hasReturningRooms
              ? <span>Welcome back. Start a new conversation, or tap <strong>My Chats</strong> below.</span>
              : <span>Tell the Weaver what you want to explore and it will build your room.</span>
            }
          </div>
        )}

        {/* Message thread */}
        {messages.length > 0 && (
          <div className="weaver-thread">
            {messages.map((m, i) => {
              // Hide raw ROOM_CREATE lines
              if (m.role === 'assistant' && m.content.startsWith('ROOM_CREATE:')) return null
              return (
                <div key={i} className={`weaver-msg weaver-msg-${m.role}`}>
                  {m.content}
                </div>
              )
            })}

            {weaverLoading && (
              <div className="weaver-msg weaver-msg-assistant weaver-typing">
                <span /><span /><span />
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Error */}
        {weaverError && (
          <div className="weaver-error">{weaverError}</div>
        )}
      </div>

      {/* ── Input bar ── */}
      <div className="weaver-input-bar">
        <textarea
          ref={inputRef}
          className="weaver-input"
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="What are you curious about?"
          rows={1}
          disabled={weaverLoading || isCreating}
        />
        <button
          className="weaver-send-btn"
          onClick={handleSend}
          disabled={!inputText.trim() || weaverLoading || isCreating}
          aria-label="Send"
        >
          {weaverLoading ? <span className="weaver-send-spinner" /> : '↑'}
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
