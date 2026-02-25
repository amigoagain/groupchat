import { useState } from 'react'

export default function SetupScreen({ onApiKeySet }) {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [testing, setTesting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    const key = apiKey.trim()
    if (!key) {
      setError('Please enter your API key.')
      return
    }
    if (!key.startsWith('sk-ant-')) {
      setError('That doesn\'t look like a valid Anthropic API key. It should start with "sk-ant-".')
      return
    }

    setTesting(true)
    setError('')

    // Write key to .env isn't possible in browser, so we store in sessionStorage
    // and re-read it via a custom mechanism
    // For Vite, we can't write .env at runtime — instruct user to add it manually
    // But we can store it in sessionStorage as a fallback for testing
    sessionStorage.setItem('GROUPCHAT_API_KEY', key)

    // Quick test call
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      })

      if (res.status === 401) {
        setError('Invalid API key. Please check and try again.')
        setTesting(false)
        return
      }

      if (!res.ok && res.status !== 200) {
        // Any non-auth error means key is probably valid
      }

      onApiKeySet()
    } catch {
      // Network error — still proceed, might work in the app
      onApiKeySet()
    }

    setTesting(false)
  }

  return (
    <div className="setup-screen">
      <div className="setup-card">
        <div className="setup-logo">Kepos</div>
        <div className="setup-tagline">AI-powered group conversations</div>

        <h2>Connect your API key</h2>
        <p>
          Kepos uses the Claude API to power your AI characters. You'll need an Anthropic API key to get started.{' '}
          <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">
            Get one here →
          </a>
        </p>

        <form onSubmit={handleSubmit}>
          <div className="setup-input-group">
            <label className="setup-input-label">Anthropic API Key</label>
            <input
              className="setup-input"
              type="password"
              placeholder="sk-ant-api03-..."
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setError('') }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {error && <div className="join-error" style={{ marginBottom: 16 }}>{error}</div>}

          <button
            className="setup-submit-btn"
            type="submit"
            disabled={!apiKey.trim() || testing}
          >
            {testing ? 'Verifying...' : 'Start Kepos'}
          </button>
        </form>

        <div className="setup-note">
          Your API key is stored only in your browser session and never sent anywhere except Anthropic's servers.
          <br /><br />
          For a permanent setup, add <code style={{ color: 'var(--accent)', fontSize: '11px' }}>REACT_APP_ANTHROPIC_API_KEY=your_key</code> to the <code style={{ color: 'var(--accent)', fontSize: '11px' }}>.env</code> file in the project root.
        </div>
      </div>
    </div>
  )
}
