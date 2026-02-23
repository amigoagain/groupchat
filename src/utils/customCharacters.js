import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { characters as builtInCharacters } from '../data/characters.js'

const LS_KEY = 'groupchat_custom_characters'

function lsLoad() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function lsSave(chars) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(chars)) } catch {}
}

/**
 * Map a Supabase row to the character shape used throughout the app.
 * Handles both canonical/variant rows (seeded) and user-created rows.
 */
function rowToChar(row) {
  const isUserCreated = !row.is_canonical && !row.verified && !row.variant_of
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    initial: row.initial || row.name.charAt(0).toUpperCase(),
    color: row.color,
    description: row.description || '',
    personality: row.personality,
    personalityText: row.personality_text || '',
    // Flags for UI rendering
    isCustom: isUserCreated,          // shows edit/delete buttons
    isCanonical: !!row.is_canonical,  // gold ✦ badge
    isVariant: !!row.variant_of,      // ↗ badge
    variantOf: row.variant_of || null,
    verified: !!row.verified,
    tags: row.tags || [],
    createdBy: row.created_by || null,
    upvotes: row.upvotes || 0,
  }
}

/**
 * Load ALL characters from Supabase (canonical, variants, user-created).
 * Falls back to built-in code characters + localStorage if Supabase unavailable.
 */
export async function loadAllCharacters() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('custom_characters')
        .select('*')
        .order('is_canonical', { ascending: false })
        .order('created_at', { ascending: true })

      if (!error && data && data.length > 0) {
        return data.map(rowToChar)
      }
    } catch (err) {
      console.warn('Supabase loadAllCharacters failed, using fallback:', err)
    }
  }

  // Offline fallback: built-in code chars + localStorage custom chars
  const customChars = lsLoad()
  return [
    ...builtInCharacters.map(c => ({ ...c, isCustom: false, isCanonical: false, isVariant: false, verified: false, tags: [] })),
    ...customChars,
  ]
}

/**
 * Load only user-created custom characters (for backwards compat).
 */
export async function loadCustomCharacters() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('custom_characters')
        .select('*')
        .eq('is_canonical', false)
        .is('variant_of', null)
        .order('created_at', { ascending: true })

      if (!error && data) {
        // Filter to only user-created (not verified seeded characters)
        const chars = data
          .filter(row => !row.verified)
          .map(rowToChar)
        lsSave(chars)
        return chars
      }
    } catch (err) {
      console.warn('Supabase loadCustomCharacters failed, using localStorage:', err)
    }
  }
  return lsLoad()
}

export async function saveCustomCharacter(character) {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('custom_characters')
        .upsert(
          {
            id: character.id,
            name: character.name,
            title: character.title,
            initial: character.initial,
            color: character.color,
            description: character.description || '',
            personality: character.personality,
            personality_text: character.personalityText || '',
            is_canonical: false,
            verified: false,
            created_by: character.createdBy || null,
            tags: character.tags || [],
          },
          { onConflict: 'id' }
        )
      if (error) console.warn('Supabase saveCustomCharacter error:', error.message)
    } catch (err) {
      console.warn('Supabase saveCustomCharacter failed:', err)
    }
  }

  const cached = lsLoad()
  const idx = cached.findIndex(c => c.id === character.id)
  if (idx >= 0) cached[idx] = character
  else cached.push(character)
  lsSave(cached)
  return cached
}

export async function deleteCustomCharacter(id) {
  if (isSupabaseConfigured) {
    try {
      const { error } = await supabase
        .from('custom_characters')
        .delete()
        .eq('id', id)
      if (error) console.warn('Supabase deleteCustomCharacter error:', error.message)
    } catch (err) {
      console.warn('Supabase deleteCustomCharacter failed:', err)
    }
  }

  const updated = lsLoad().filter(c => c.id !== id)
  lsSave(updated)
  return updated
}

export function buildCustomCharacter({ id, name, title, personalityText, color }) {
  const trimmedName = name.trim()
  const trimmedTitle = title.trim()
  const trimmedPersonality = personalityText.trim()

  const personality =
    `You are ${trimmedName}, ${trimmedTitle}. ` +
    trimmedPersonality +
    `\n\nStay fully in character at all times. Respond naturally in the first person as this character. ` +
    `Never break character or acknowledge that you are an AI playing a role.`

  const firstSentence = trimmedPersonality.split(/[.!?]/)[0] || trimmedPersonality
  const description =
    firstSentence.length > 100
      ? firstSentence.slice(0, 97) + '...'
      : firstSentence + '.'

  return {
    id: id || `custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: trimmedName,
    title: trimmedTitle,
    initial: trimmedName.charAt(0).toUpperCase(),
    color,
    description,
    personality,
    personalityText: trimmedPersonality,
    isCustom: true,
    isCanonical: false,
    isVariant: false,
    verified: false,
    tags: [],
  }
}
