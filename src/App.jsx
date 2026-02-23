import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import SetupScreen from './components/SetupScreen.jsx'
import StartScreen from './components/StartScreen.jsx'
import ModeSelection from './components/ModeSelection.jsx'
import CharacterSelection from './components/CharacterSelection.jsx'
import ChatInterface from './components/ChatInterface.jsx'
import { hasApiKey } from './services/claudeApi.js'
import { loadRoom, createRoom } from './utils/roomUtils.js'

export default function App() {
  const { code: urlCode } = useParams()          // populated on /room/:code
  const navigate = useNavigate()

  const [screen, setScreen] = useState('loading')
  const [isPremium, setIsPremium] = useState(false)
  const [selectedMode, setSelectedMode] = useState(null)
  const [selectedCharacters, setSelectedCharacters] = useState([])
  const [currentRoom, setCurrentRoom] = useState(null)
  const [joinError, setJoinError] = useState('')
  // Stash the URL code so we can load it after API key setup if needed
  const [pendingCode, setPendingCode] = useState(urlCode || null)

  // ── Initial load ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      if (!hasApiKey()) {
        // Keep pendingCode in state so handleApiKeySet can redirect after setup
        if (urlCode) setPendingCode(urlCode)
        setScreen('setup')
        return
      }

      if (urlCode) {
        // Direct link: load the room immediately
        await loadAndEnterRoom(urlCode)
      } else {
        setScreen('start')
      }
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount only

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

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleApiKeySet = async () => {
    if (pendingCode) {
      setPendingCode(null)
      await loadAndEnterRoom(pendingCode)
    } else {
      setScreen('start')
    }
  }

  const handleStartRoom = () => setScreen('mode')

  const handleJoinRoom = async (code) => {
    await loadAndEnterRoom(code)
    // If successful, also push the URL so it's shareable/bookmarkable
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
    // Push /room/:code into the browser history
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
  if (screen === 'loading') {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    )
  }

  return (
    <div className="app">
      {screen !== 'setup' && (
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
