import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

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

function rowToChar(row) {
  return {
    id: row.id,
    name: row.name,
    title: row.title,
    initial: row.initial || row.name.charAt(0).toUpperCase(),
    color: row.color,
    description: row.description || '',
    personality: row.personality,
    personalityText: row.personality_text || '',
    isCustom: true,
  }
}

export async function loadCustomCharacters() {
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('custom_characters')
        .select('*')
        .order('created_at', { ascending: true })
      if (!error && data) {
        const chars = data.map(rowToChar)
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
  }
}
