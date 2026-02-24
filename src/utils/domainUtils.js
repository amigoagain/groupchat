/**
 * Domain inference for characters.
 * Maps characters to human-readable domain categories used as filter chips
 * in the character selection screen.
 */

// ─── Name-based overrides ──────────────────────────────────────────────────
// Handles well-known historical figures whose titles may be ambiguous.
const NAME_DOMAIN_MAP = {
  // Philosophy
  'socrates':         'Philosophy',
  'plato':            'Philosophy',
  'aristotle':        'Philosophy',
  'nietzsche':        'Philosophy',
  'kant':             'Philosophy',
  'descartes':        'Philosophy',
  'locke':            'Philosophy',
  'hume':             'Philosophy',
  'wittgenstein':     'Philosophy',
  'spinoza':          'Philosophy',
  'epictetus':        'Philosophy',
  'marcus aurelius':  'Philosophy',
  'seneca':           'Philosophy',
  'voltaire':         'Philosophy',
  'rousseau':         'Philosophy',
  'john stuart mill': 'Philosophy',
  'bertrand russell': 'Philosophy',
  'simone de beauvoir':'Philosophy',

  // Science
  'marie curie':      'Science',
  'albert einstein':  'Science',
  'isaac newton':     'Science',
  'charles darwin':   'Science',
  'richard feynman':  'Science',
  'carl sagan':       'Science',
  'oliver sacks':     'Science',
  'nikola tesla':     'Science',
  'stephen hawking':  'Science',
  'galileo galilei':  'Science',
  'niels bohr':       'Science',
  'james watson':     'Science',
  'alan turing':      'Tech',

  // Psychology
  'sigmund freud':    'Psychology',
  'carl jung':        'Psychology',
  'william james':    'Psychology',
  'abraham maslow':   'Psychology',
  'b.f. skinner':     'Psychology',

  // Business / Tech
  'elon musk':        'Tech',
  'steve jobs':       'Tech',
  'bill gates':       'Tech',
  'warren buffett':   'Business',
  'jeff bezos':       'Business',
  'peter drucker':    'Business',
  'adam smith':       'Business',

  // History
  'sun tzu':          'History',
  'napoleon':         'History',
  'cleopatra':        'History',
  'julius caesar':    'History',
  'alexander the great': 'History',
  'machiavelli':      'History',
  'genghis khan':     'History',
  'winston churchill':'History',

  // Arts
  'william shakespeare': 'Arts',
  'leonardo da vinci': 'Arts',
  'da vinci':         'Arts',
  'wolfgang amadeus mozart': 'Arts',
  'beethoven':        'Arts',
  'frida kahlo':      'Arts',
  'mark twain':       'Arts',
  'virginia woolf':   'Arts',
  'james joyce':      'Arts',

  // Politics / Culture
  'mahatma gandhi':   'Politics',
  'gandhi':           'Politics',
  'nelson mandela':   'Politics',
  'martin luther king': 'Politics',
  'malcolm x':        'Politics',
  'abraham lincoln':  'Politics',
  'oprah winfrey':    'Culture',
  'maya angelou':     'Culture',
}

// ─── Title keyword rules ───────────────────────────────────────────────────
// Checked in order; first match wins.
const TITLE_RULES = [
  ['Philosophy',  ['philosopher', 'philosophy', 'ethicist', 'stoic', 'logician', 'existential', 'metaphysician']],
  ['Science',     ['physicist', 'chemist', 'astronomer', 'biologist', 'geologist', 'mathematician', 'neuroscientist', 'atmospheric', 'climate scientist', 'research assistant', 'academic research']],
  ['Psychology',  ['psycho', 'therapist', 'cognitive', 'behavioural', 'behavioral', 'counselor', 'mental health']],
  ['Business',    ['entrepreneur', 'investor', 'economist', 'financial', 'consultant', 'executive', 'ceo', 'planner', 'advisor', 'strategist', 'management']],
  ['Law',         ['attorney', 'lawyer', 'legal', 'jurist', 'judge', 'solicitor', 'barrister']],
  ['Health',      ['doctor', 'physician', 'medical', 'nutritionist', 'dietitian', 'surgeon', 'nurse', 'internist', 'psychiatrist', 'practitioner']],
  ['History',     ['military', 'historian', 'general', 'emperor', 'king', 'queen', 'admiral', 'revolutionary', 'strategist']],
  ['Arts',        ['artist', 'musician', 'poet', 'writer', 'author', 'director', 'actor', 'painter', 'composer', 'playwright', 'novelist']],
  ['Tech',        ['engineer', 'developer', 'programmer', 'technologist', 'hacker', 'software', 'computer']],
  ['Politics',    ['politician', 'president', 'senator', 'diplomat', 'activist', 'minister', 'chancellor', 'leader']],
  ['Culture',     ['media', 'host', 'coach', 'celebrity', 'communicator', 'journalist', 'broadcaster']],
]

/**
 * Infer a domain category for a character.
 *
 * Priority:
 *   1. Exact name match in NAME_DOMAIN_MAP
 *   2. Partial name match (first/last word) in NAME_DOMAIN_MAP
 *   3. Title keyword matching via TITLE_RULES
 *   4. 'Other'
 *
 * @param {{ name: string, title?: string, tags?: string[] }} char
 * @returns {string} domain label
 */
export function inferDomain(char) {
  const nameLower = (char.name || '').toLowerCase().trim()

  // 1. Exact name match
  if (NAME_DOMAIN_MAP[nameLower]) return NAME_DOMAIN_MAP[nameLower]

  // 2. Partial name matches — try "first last", "last", "first"
  const parts = nameLower.split(/\s+/)
  for (const [key, domain] of Object.entries(NAME_DOMAIN_MAP)) {
    const keyParts = key.split(/\s+/)
    if (parts[0] === keyParts[0] && keyParts.length > 1) continue // avoid "Carl" → Carl Jung match
    if (parts.length === 1 && keyParts.includes(parts[0])) return domain
    if (parts.length > 1 && key.includes(parts[0]) && key.includes(parts[parts.length - 1])) return domain
  }

  // 3. Title keyword matching
  const titleLower = (char.title || '').toLowerCase()
  for (const [domain, keywords] of TITLE_RULES) {
    if (keywords.some(kw => titleLower.includes(kw))) return domain
  }

  return 'Other'
}

/** All possible domain values (for rendering filter chips in sorted order). */
export const ALL_DOMAINS = [
  'Philosophy', 'Science', 'Psychology', 'Business',
  'Law', 'Health', 'History', 'Arts', 'Tech', 'Politics', 'Culture', 'Other',
]

/** Colour associated with each domain (for domain tags and chips). */
export const DOMAIN_COLORS = {
  Philosophy: '#8b5cf6',
  Science:    '#06b6d4',
  Psychology: '#f472b6',
  Business:   '#f59e0b',
  Law:        '#64748b',
  Health:     '#22c55e',
  History:    '#ef4444',
  Arts:       '#ec4899',
  Tech:       '#3b82f6',
  Politics:   '#6366f1',
  Culture:    '#f97316',
  Other:      '#4d5f80',
}
