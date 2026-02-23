import { useState, useEffect, useRef } from 'react'
import { buildCustomCharacter } from '../utils/customCharacters.js'

// Preset accent colours that match the app's palette
const PRESET_COLORS = [
  '#8B7CF8', // violet
  '#FF6B35', // orange
  '#FFD700', // gold
  '#FF4757', // red
  '#2ED573', // green
  '#B341FF', // purple
  '#3498DB', // blue
  '#FF6B8A', // rose
  '#00D2D3', // teal
  '#00E5FF', // cyan
  '#FF4FC8', // magenta
  '#F0A500', // amber
  '#E84393', // hot pink
  '#7FDBFF', // sky
  '#01FF70', // lime
  '#FF851B', // coral
]

export default function CreateCharacterModal({ character, onSave, onDelete, onClose }) {
  const isEditing = Boolean(character)

  const [name, setName] = useState(character?.name || '')
  const [title, setTitle] = useState(character?.title || '')
  const [personalityText, setPersonalityText] = useState(character?.personalityText || '')
  const [color, setColor] = useState(character?.color || PRESET_COLORS[0])
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [errors, setErrors] = useState({})

  const overlayRef = useRef(null)
  const nameRef = useRef(null)

  // Focus name field on open
  useEffect(() => {
    setTimeout(() => nameRef.current?.focus(), 60)
  }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

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
    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }
    const built = buildCustomCharacter({
      id: character?.id,
      name,
      title,
      personalityText,
      color,
    })
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
          {/* Live avatar preview */}
          <div className="modal-preview">
            <div className="modal-preview-avatar" style={{ background: color }}>
              {avatarInitial}
            </div>
            <div className="modal-preview-info">
              <div className="modal-preview-name">{name.trim() || 'Character Name'}</div>
              <div className="modal-preview-title">{title.trim() || 'Title / Role'}</div>
            </div>
          </div>

          {/* Form */}
          <div className="modal-form">

            {/* Name */}
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

            {/* Title */}
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

            {/* Personality */}
            <div className="form-group">
              <label className="form-label">
                Personality <span className="form-required">*</span>
              </label>
              <div className="form-hint">
                Describe how they speak, think, and what makes them unique. This becomes their AI prompt.
              </div>
              <textarea
                className={`form-textarea ${errors.personality ? 'form-input-error' : ''}`}
                placeholder={`e.g. Speaks with calm authority and dry wit. Always grounds advice in first-hand experience. Fond of asking "What would you regret not doing?" Believes discipline is the foundation of freedom. References Stoic philosophy without being preachy.`}
                value={personalityText}
                rows={5}
                onChange={e => { setPersonalityText(e.target.value); setErrors(p => ({ ...p, personality: '' })) }}
              />
              <div className="form-char-count">
                {personalityText.length} characters
              </div>
              {errors.personality && <div className="form-error">{errors.personality}</div>}
            </div>

            {/* Color */}
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
                  <button
                    className="modal-btn-danger"
                    onClick={() => onDelete(character.id)}
                  >
                    Yes, delete
                  </button>
                  <button
                    className="modal-btn-ghost"
                    onClick={() => setDeleteConfirm(false)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="modal-btn-delete"
                  onClick={() => setDeleteConfirm(true)}
                >
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
