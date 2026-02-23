import { useState, useEffect } from 'react'
import SetupScreen from './components/SetupScreen.jsx'
import StartScreen from './components/StartScreen.jsx'
import ModeSelection from './components/ModeSelection.jsx'
import CharacterSelection from './components/CharacterSelection.jsx'
import ChatInterface from './components/ChatInterface.jsx'
import { hasApiKey } from './services/claudeApi.js'
import { loadRoom, createRoom } from './utils/roomUtils.js'

export default function App() {
  const [screen, setScreen] = useState('loading') // loading | setup | start | mode | characters | chat
  const [isPremium, setIsPremium] = useState(false)
  const [selectedMode, setSelectedMode] = useState(null)
  const [selectedCharacters, setSelectedCharacters] = useState([])
  const [currentRoom, setCurrentRoom] = useState(null)
  const [joinError, setJoinError] = useState('')

  useEffect(() => {
    if (hasApiKey()) {
      setScreen('start')
    } else {
      setScreen('setup')
    }
  }, [])

  const handleApiKeySet = () => {
    setScreen('start')
  }

  const handleStartRoom = () => {
    setScreen('mode')
  }

  const handleJoinRoom = (code) => {
    const room = loadRoom(code.trim().toUpperCase())
    if (room) {
      setCurrentRoom(room)
      setJoinError('')
      setScreen('chat')
    } else {
      setJoinError(`Room "${code.toUpperCase()}" not found. Check the code and try again.`)
    }
  }

  const handleSelectMode = (mode) => {
    setSelectedMode(mode)
    setScreen('characters')
  }

  const handleStartChat = (characters) => {
    setSelectedCharacters(characters)
    const room = createRoom(selectedMode, characters)
    setCurrentRoom(room)
    setScreen('chat')
  }

  const handleUpdateRoom = (updatedRoom) => {
    setCurrentRoom(updatedRoom)
  }

  const handleBackToStart = () => {
    setCurrentRoom(null)
    setSelectedMode(null)
    setSelectedCharacters([])
    setScreen('start')
  }

  const handleBackToMode = () => {
    setSelectedCharacters([])
    setScreen('mode')
  }

  if (screen === 'loading') {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
      </div>
    )
  }

  return (
    <div className="app">
      {/* Premium toggle — shown on all screens except setup */}
      {screen !== 'setup' && (
        <div className="premium-toggle-bar">
          <span className="premium-toggle-label">
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
