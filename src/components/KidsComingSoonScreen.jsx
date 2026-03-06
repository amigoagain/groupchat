/**
 * KidsComingSoonScreen.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Parent and teacher gate for Kepos for Kids.
 *
 * The page builds toward the walking figure at the bottom.
 * Tapping it opens a kids stroll room directly — no intermediate step.
 * The back button returns to the public library.
 *
 * Visual language: public library background (#111), cream text, olive accents.
 * Tone: calm, considered, trustworthy. Addressed to adults.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export default function KidsComingSoonScreen({ onBack, onEnter }) {
  return (
    <div style={{
      position:        'fixed',
      inset:           0,
      background:      '#111',
      color:           '#e0dbd0',
      fontFamily:      'Georgia, serif',
      overflowY:       'auto',
      zIndex:          900,
      display:         'flex',
      flexDirection:   'column',
    }}>

      {/* Back button */}
      <div style={{
        padding:        '14px 20px',
        borderBottom:   '1px solid #2a2a2a',
        flexShrink:     0,
      }}>
        <button
          onClick={onBack}
          style={{
            background:  'none',
            border:      'none',
            color:       '#6b7c47',
            fontSize:    '18px',
            cursor:      'pointer',
            padding:     '4px 8px 4px 0',
            lineHeight:  1,
            display:     'flex',
            alignItems:  'center',
            gap:         '6px',
          }}
        >
          ←
        </button>
      </div>

      {/* Content — stacks toward the walking figure */}
      <div style={{
        flex:           1,
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'center',
        padding:        '60px 24px 0',
        maxWidth:       '560px',
        margin:         '0 auto',
        width:          '100%',
        boxSizing:      'border-box',
      }}>

        {/* Wordmark */}
        <div style={{
          fontSize:      '22px',
          letterSpacing: '0.04em',
          color:         '#e0dbd0',
          marginBottom:  '14px',
          textAlign:     'center',
        }}>
          Kepos for Kids
        </div>

        {/* Description */}
        <p style={{
          fontSize:     '15px',
          lineHeight:   1.75,
          color:        '#a09880',
          textAlign:    'center',
          marginBottom: '48px',
        }}>
          A place for curious young minds to wander through ideas
          and meet the people who spent their lives thinking about them.
        </p>

        {/* How it works */}
        <div style={{ width: '100%', marginBottom: '36px' }}>
          <div style={{
            fontSize:      '11px',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color:         '#6b7c47',
            fontFamily:    'monospace',
            marginBottom:  '14px',
          }}>
            How it works
          </div>
          <p style={{
            fontSize:    '14px',
            lineHeight:  1.8,
            color:       '#b8b0a0',
          }}>
            Your child arrives with something they're curious about — a word, a question,
            a thing they saw or heard. The Gardener listens, follows the thread, and when
            the moment is right, introduces them to someone in the garden who has spent their
            life thinking about exactly that.
          </p>
          <p style={{
            fontSize:    '14px',
            lineHeight:  1.8,
            color:       '#b8b0a0',
            marginTop:   '14px',
          }}>
            It is a short conversation. Eight turns at most. It ends with an introduction
            and an open door.
          </p>
        </div>

        {/* For parents and teachers */}
        <div style={{ width: '100%', marginBottom: '48px' }}>
          <div style={{
            fontSize:      '11px',
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color:         '#6b7c47',
            fontFamily:    'monospace',
            marginBottom:  '14px',
          }}>
            For parents and teachers
          </div>
          <p style={{
            fontSize:    '14px',
            lineHeight:  1.8,
            color:       '#b8b0a0',
          }}>
            We recommend sitting alongside your child for their first visit. The garden is a
            safe place, but like any good place, it is better the first time with someone
            you trust nearby.
          </p>
        </div>

        {/* Coming soon */}
        <p style={{
          fontSize:     '14px',
          lineHeight:   1.8,
          color:        '#6a6a6a',
          textAlign:    'center',
          marginBottom: '72px',
        }}>
          Coming soon — we are building this carefully.
          More of the garden opens as we get it right.
        </p>

      </div>

      {/* Walking figure — the destination of the page */}
      <div style={{
        display:        'flex',
        justifyContent: 'center',
        alignItems:     'center',
        padding:        '0 0 max(48px, env(safe-area-inset-bottom, 48px))',
        flexShrink:     0,
      }}>
        <button
          onClick={onEnter}
          aria-label="Enter the garden"
          style={{
            width:          '64px',
            height:         '64px',
            background:     '#4a5a24',
            border:         'none',
            borderRadius:   '16px',
            cursor:         'pointer',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            color:          '#f5f2ec',
            boxShadow:      '0 4px 20px rgba(74, 90, 36, 0.30)',
            transition:     'background 0.15s, transform 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#3a4a1c' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#4a5a24' }}
          onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.96)' }}
          onTouchEnd={e   => { e.currentTarget.style.transform = 'scale(1)';   onEnter() }}
        >
          {/* Walking figure — exact same SVG as WeaverEntryScreen textarea button */}
          <svg
            width="22" height="25"
            viewBox="0 0 14 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="9" cy="2" r="1.5" />
            <line x1="8.5" y1="3.5" x2="7.5" y2="8"  />
            <line x1="8"   y1="5.5" x2="11"  y2="7.5" />
            <line x1="8"   y1="5.5" x2="5.5" y2="6.5" />
            <line x1="7.5" y1="8"   x2="10"  y2="13"  />
            <line x1="7.5" y1="8"   x2="5"   y2="12"  />
          </svg>
        </button>
      </div>

    </div>
  )
}
