import { useState, useEffect, useRef } from 'react'
import { buildCustomCharacter } from '../utils/customCharacters.js'
import { generateCharacterProfile } from '../services/claudeApi.js'

const PRESET_COLORS = [
  '#8B7CF8', '#FF6B35', '#FFD700', '#FF4757',
  '#2ED573', '#B341FF', '#3498DB', '#FF6B8A',
  '#A8B8C8', '#00D2D3', '#00E5FF', '#FF4FC8',
  '#F0A500', '#E84393', '#7FDBFF', '#01FF70',
]

export default function CreateCharacterModal({ character, onSave, onDelete, onClose }) {
  const isEditing = Boolean(character)

  // ── Generate state ──────────────────────────────────────────────────────────
  const [generateName, setGenerateName] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [generatedFrom, setGeneratedFrom] = useState('')

  // ── Form state ──────────────────────────────────────────────────────────────
  const [name, setName] = useState(character?.name || '')
  const [title, setTitle] = useState(character?.title || '')
  const [personalityText, setPersonalityText] = useState(character?.personalityText || '')
  const [color, setColor] = useState(character?.color || PRESET_COLORS[0])
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [errors, setErrors] = useState({})

  const overlayRef = useRef(null)
  const nameRef = useRef(null)
  const generateInputRef = useRef(null)

  useEffect(() => {
    setTimeout(() => generateInputRef.current?.focus(), 60)
  }, [])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // ── Generate handler ────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    const nameToGenerate = generateName.trim()
    if (!nameToGenerate || isGenerating) return

    setIsGenerating(true)
    setGenerateError('')
    setGeneratedFrom('')

    try {
      const profile = await generateCharacterProfile(nameToGenerate)
      setTitle(profile.title)
      setPersonalityText(profile.personality)
      setColor(profile.color)
      if (!name.trim()) setName(nameToGenerate)
      setGeneratedFrom(nameToGenerate)
      setErrors({})
      setTimeout(() => nameRef.current?.focus(), 80)
    } catch (err) {
      setGenerateError(err.message || 'Generation failed. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleGenerateKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleGenerate() }
  }

  // ── Save / Delete ───────────────────────────────────────────────────────────

  const validate = () => {
    const errs = {}
    if (!name.trim()) errs.name = 'Name is required.'
    if (name.trim().length > 40) errs.name = 'Name must be 40 characters or fewer.'
    if (!title.trim()) errs.title = 'Title / role is required.'
    if (!personalityText.trim()) errs.personality = 'Personality description is required.'
    if (personalityText.trim().length < 20) errs.personality = 'Please write at least a sentence or two.'
    return errs
  }

  const handleSave = () => {
    const errs = validate()
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    const built = buildCustomCharacter({ id: character?.id, name, title, personalityText, color })
    onSave(built)
  }

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose()
  }

  const avatarInitial = name.trim().charAt(0).toUpperCase() || '?'

  return (
    <div className="modal-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="modal-container" role="dialog" aria-modal="true">

        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">
            {isEditing ? 'Edit Character' : 'Create a Character'}
          </h2>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">

          {/* ── AI Generate section ── */}
          <div className="generate-section">
            <div className="generate-label">✦ Generate from a famous person</div>
            <div className="generate-row">
              <input
                ref={generateInputRef}
                className="generate-input"
                type="text"
                placeholder="Enter any name e.g. Jean-Paul Sartre"
                value={generateName}
                onChange={e => { setGenerateName(e.target.value); setGenerateError('') }}
                onKeyDown={handleGenerateKeyDown}
                disabled={isGenerating}
              />
              <button
                className="generate-btn"
                onClick={handleGenerate}
                disabled={!generateName.trim() || isGenerating}
                type="button"
              >
                {isGenerating ? <span className="btn-spinner" /> : 'Generate'}
              </button>
            </div>
            {generateError && <div className="generate-error">{generateError}</div>}
            {generatedFrom && !generateError && (
              <div className="generate-success">
                ✓ Fields filled from &ldquo;{generatedFrom}&rdquo; — edit anything before saving
              </div>
            )}
          </div>

          <div className="generate-divider"><span>or fill in manually</span></div>

          {/* Live preview */}
          <div className="modal-preview">
            <div className="modal-preview-avatar" style={{ background: color }}>
              {avatarInitial}
            </div>
            <div className="modal-preview-info">
              <div className="modal-preview-name">{name.trim() || 'Character Name'}</div>
              <div className="modal-preview-title">{title.trim() || 'Title / Role'}</div>
            </div>
          </div>

          {/* Form fields */}
          <div className="modal-form">

            <div className="form-group">
              <label className="form-label">Name <span className="form-required">*</span></label>
              <input
                ref={nameRef}
                className={`form-input ${errors.name ? 'form-input-error' : ''}`}
                type="text"
                placeholder="e.g. Marcus Aurelius"
                value={name}
                maxLength={40}
                onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })) }}
              />
              {errors.name && <div className="form-error">{errors.name}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">Title / Role <span className="form-required">*</span></label>
              <input
                className={`form-input ${errors.title ? 'form-input-error' : ''}`}
                type="text"
                placeholder="e.g. Stoic Emperor, Startup Founder, Jazz Musician"
                value={title}
                maxLength={60}
                onChange={e => { setTitle(e.target.value); setErrors(p => ({ ...p, title: '' })) }}
              />
              {errors.title && <div className="form-error">{errors.title}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">
                Personality <span className="form-required">*</span>
              </label>
              <div className="form-hint">
                Describe how they speak, think, and what makes them unique. This becomes their AI prompt.
              </div>
              <textarea
                className={`form-textarea ${errors.personality ? 'form-input-error' : ''}`}
                placeholder="e.g. You speak with calm authority and dry wit. You always ground advice in first-hand experience. You believe discipline is the foundation of freedom."
                value={personalityText}
                rows={5}
                onChange={e => { setPersonalityText(e.target.value); setErrors(p => ({ ...p, personality: '' })) }}
              />
              <div className="form-char-count">{personalityText.length} characters</div>
              {errors.personality && <div className="form-error">{errors.personality}</div>}
            </div>

            <div className="form-group">
              <label className="form-label">Accent Color</label>
              <div className="form-hint">Used for the avatar and message bubbles.</div>
              <div className="color-picker">
                <div className="color-presets">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      className={`color-swatch ${color === c ? 'color-swatch-selected' : ''}`}
                      style={{ background: c }}
                      onClick={() => setColor(c)}
                      title={c}
                      type="button"
                    />
                  ))}
                </div>
                <div className="color-custom-row">
                  <label className="color-custom-label">Custom</label>
                  <div className="color-custom-input-wrap">
                    <input
                      type="color"
                      className="color-custom-input"
                      value={color}
                      onChange={e => setColor(e.target.value)}
                    />
                    <span className="color-custom-hex">{color.toUpperCase()}</span>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {isEditing && (
            <div className="modal-delete-area">
              {deleteConfirm ? (
                <div className="modal-delete-confirm">
                  <span>Delete this character?</span>
                  <button className="modal-btn-danger" onClick={() => onDelete(character.id)}>
                    Yes, delete
                  </button>
                  <button className="modal-btn-ghost" onClick={() => setDeleteConfirm(false)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button className="modal-btn-delete" onClick={() => setDeleteConfirm(true)}>
                  🗑 Delete character
                </button>
              )}
            </div>
          )}
          <div className="modal-actions">
            <button className="modal-btn-cancel" onClick={onClose}>Cancel</button>
            <button className="modal-btn-save" onClick={handleSave}>
              {isEditing ? 'Save Changes' : 'Create Character'}
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
