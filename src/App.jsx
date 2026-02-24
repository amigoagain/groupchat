import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import SetupScreen from './components/SetupScreen.jsx'
import StartScreen from './components/StartScreen.jsx'
import ModeSelection from './components/ModeSelection.jsx'
import CharacterSelection from './components/CharacterSelection.jsx'
import ChatInterface from './components/ChatInterface.jsx'
import UsernameModal from './components/UsernameModal.jsx'
import { hasApiKey } from './services/claudeApi.js'
import { loadRoom, createRoom, diagnoseSupabase } from './utils/roomUtils.js'
import { hasUsername, setUsername } from './utils/username.js'

export default function App() {
  const { code: urlCode } = useParams()
  const navigate = useNavigate()

  const [screen, setScreen] = useState('loading')
  const [isPremium, setIsPremium] = useState(false)
  const [selectedMode, setSelectedMode] = useState(null)
  const [selectedCharacters, setSelectedCharacters] = useState([])
  const [currentRoom, setCurrentRoom] = useState(null)
  const [joinError, setJoinError] = useState('')
  const [pendingCode, setPendingCode] = useState(urlCode || null)

  // Username gate: true means we need to collect the name first
  const [needsUsername, setNeedsUsername] = useState(!hasUsername())

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const loadAndEnterRoom = async (code) => {
    setScreen('loading')
    try {
      const room = await loadRoom(code.trim().toUpperCase())
      if (room) {
        setCurrentRoom(room)
        setJoinError('')
        setScreen('chat')
      } else {
        setJoinError(`Room "${code.toUpperCase()}" not found. Check the code and try again.`)
        navigate('/', { replace: true })
        setScreen('start')
      }
    } catch {
      setJoinError(`Could not load room "${code.toUpperCase()}". Please try again.`)
      navigate('/', { replace: true })
      setScreen('start')
    }
  }

  // ── Initial load — only runs once username is ready ──────────────────────────
  useEffect(() => {
    if (needsUsername) {
      setScreen('loading')
      return
    }

    const init = async () => {
      // Run Supabase diagnostic on startup — logs to browser console
      diagnoseSupabase()

      if (!hasApiKey()) {
        if (urlCode) setPendingCode(urlCode)
        setScreen('setup')
        return
      }

      if (urlCode || pendingCode) {
        const code = urlCode || pendingCode
        setPendingCode(null)
        await loadAndEnterRoom(code)
      } else {
        setScreen('start')
      }
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsUsername]) // re-runs when username modal is dismissed

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleUsernameSave = (name) => {
    setUsername(name)
    setNeedsUsername(false)
    // init() will fire via the needsUsername effect above
  }

  const handleApiKeySet = async () => {
    if (pendingCode) {
      const code = pendingCode
      setPendingCode(null)
      await loadAndEnterRoom(code)
    } else {
      setScreen('start')
    }
  }

  const handleStartRoom = () => setScreen('mode')

  const handleJoinRoom = async (code) => {
    await loadAndEnterRoom(code)
    if (currentRoom) navigate(`/room/${code.toUpperCase()}`, { replace: true })
  }

  const handleSelectMode = (mode) => {
    setSelectedMode(mode)
    setScreen('characters')
  }

  const handleStartChat = async (characters) => {
    setSelectedCharacters(characters)
    const room = await createRoom(selectedMode, characters)
    setCurrentRoom(room)
    navigate(`/room/${room.code}`, { replace: true })
    setScreen('chat')
  }

  const handleUpdateRoom = (updatedRoom) => setCurrentRoom(updatedRoom)

  const handleBackToStart = () => {
    setCurrentRoom(null)
    setSelectedMode(null)
    setSelectedCharacters([])
    navigate('/', { replace: true })
    setScreen('start')
  }

  const handleBackToMode = () => {
    setSelectedCharacters([])
    setScreen('mode')
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      {/* Username modal — shown as an overlay before anything else on first visit */}
      {needsUsername && (
        <UsernameModal onSave={handleUsernameSave} isRename={false} />
      )}

      {screen === 'loading' && !needsUsername && (
        <div className="loading-screen">
          <div className="loading-spinner" />
        </div>
      )}

      {screen !== 'setup' && screen !== 'loading' && (
        <div className="premium-toggle-bar">
          <span className={`premium-toggle-label ${isPremium ? 'active' : ''}`}>
            {isPremium ? '✦ Premium Mode' : 'Free Mode'}
          </span>
          <button
            className={`premium-toggle-btn ${isPremium ? 'active' : ''}`}
            onClick={() => setIsPremium(p => !p)}
            title="Toggle premium mode (for testing)"
          >
            {isPremium ? 'Disable Premium' : 'Enable Premium'}
          </button>
        </div>
      )}

      {screen === 'setup' && (
        <SetupScreen onApiKeySet={handleApiKeySet} />
      )}

      {screen === 'start' && (
        <StartScreen
          onStartRoom={handleStartRoom}
          onJoinRoom={handleJoinRoom}
          joinError={joinError}
          onClearJoinError={() => setJoinError('')}
        />
      )}

      {screen === 'mode' && (
        <ModeSelection
          onSelectMode={handleSelectMode}
          onBack={handleBackToStart}
          isPremium={isPremium}
        />
      )}

      {screen === 'characters' && (
        <CharacterSelection
          onStartChat={handleStartChat}
          onBack={handleBackToMode}
          selectedMode={selectedMode}
        />
      )}

      {screen === 'chat' && currentRoom && (
        <ChatInterface
          room={currentRoom}
          onUpdateRoom={handleUpdateRoom}
          onBack={handleBackToStart}
          isPremium={isPremium}
        />
      )}
    </div>
  )
}
