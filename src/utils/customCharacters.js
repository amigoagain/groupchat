import { supabase, isSupabaseConfigured } from '../lib/supabase.js'
import { characters as builtInCharacters } from '../data/characters.js'
import { generateFullCharacterRecord } from '../services/claudeApi.js'

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
  const tagList = row.tags || []
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
    isCanonical: !!row.is_canonical,  // 🔵 blue badge
    isVariant: !!row.variant_of,      // 🟣 purple badge
    isExpert: !row.is_canonical && !!row.verified && !row.variant_of && tagList.includes('expert'), // 🟢 green badge
    variantOf: row.variant_of || null,
    verified: !!row.verified,
    tags: tagList,
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

/**
 * Auto-create a character for the Gardener flow.
 *
 * Steps:
 *  1. Check Supabase — if a row with this name already exists, return it.
 *  2. Call Claude to generate a rich character record.
 *  3. Insert the new record into custom_characters with created_by='gardener'.
 *  4. Return the character object ready for use in a room.
 *
 * Falls back gracefully if Supabase or the Claude API is unavailable.
 */
export async function autoCreateGardenerCharacter(name) {
  const trimmed = name.trim()

  // 1. Check if already in Supabase
  if (isSupabaseConfigured) {
    try {
      const { data } = await supabase
        .from('custom_characters')
        .select('*')
        .ilike('name', trimmed)
        .limit(1)
      if (data && data.length > 0) {
        console.info('[Kepos] Gardener reusing existing character:', trimmed, data[0].id)
        return rowToChar(data[0])
      }
    } catch (err) {
      console.warn('[Kepos] autoCreateGardenerCharacter lookup failed:', err)
    }
  }

  // 2. Generate via Claude API
  let profile
  try {
    profile = await generateFullCharacterRecord(trimmed)
  } catch (err) {
    console.warn('[Kepos] generateFullCharacterRecord failed for', trimmed, '— using minimal fallback:', err)
    profile = {
      title:       'Historical Figure',
      personality: `You are ${trimmed}. Respond in character based on your known views, ideas, and historical context. Stay true to your documented positions and communication style.`,
      color:       '#4A5C3A',
      tags:        [],
      category:    'history',
    }
  }

  const id = `gardener_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const char = {
    id,
    name:            trimmed,
    title:           profile.title,
    initial:         trimmed.charAt(0).toUpperCase(),
    color:           profile.color,
    description:     profile.personality.split('. ').slice(0, 2).join('. ') + '.',
    personality:     profile.personality,
    personalityText: profile.personality,
    isCustom:        false,
    isCanonical:     false,
    isVariant:       false,
    verified:        false,
    tags:            profile.tags || [],
    createdBy:       'gardener',
    upvotes:         0,
  }

  // 3. Insert into Supabase (fire and let it save; use returned row if available)
  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('custom_characters')
        .insert({
          id:               char.id,
          name:             char.name,
          title:            char.title,
          initial:          char.initial,
          color:            char.color,
          description:      char.description,
          personality:      char.personality,
          personality_text: char.personality,
          is_canonical:     false,
          verified:         false,
          created_by:       'gardener',
          variant_of:       null,
          tags:             char.tags,
        })
        .select()
        .single()

      if (!error && data) {
        console.info('[Kepos] Auto-created Gardener character:', trimmed, data.id)
        return rowToChar(data)
      }
      if (error) {
        console.warn('[Kepos] Supabase insert for Gardener character failed:', error.message)
      }
    } catch (err) {
      console.warn('[Kepos] autoCreateGardenerCharacter Supabase write failed:', err)
    }
  }

  // 4. Fallback: return the in-memory object (session-only)
  console.info('[Kepos] Using in-memory Gardener character (Supabase unavailable):', trimmed)
  return char
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
