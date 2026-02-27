-- ══════════════════════════════════════════════════════════════════════════════
--  gardener_memory table
--  One record per room, updated in place each turn.
--  Stores the Gardener's working understanding of the conversation.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS gardener_memory (
  id                        uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id                   uuid        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  updated_at                timestamptz DEFAULT now(),

  -- Phase tracks conversation arc
  conversation_phase        text        NOT NULL DEFAULT 'opening'
                            CHECK (conversation_phase IN ('opening', 'middle', 'late')),

  -- Turn count increments every time a user message completes a full response cycle
  turn_count                integer     NOT NULL DEFAULT 0,

  -- Per-character drift tracking: { "CharacterName": { "score": 0-10, "note": "..." } }
  character_drift           jsonb       NOT NULL DEFAULT '{}',

  -- Log of Gardener interventions: [{ "turn": int, "character": str, "type": str, "apparent_effect": str }]
  intervention_log          jsonb       NOT NULL DEFAULT '[]',

  -- Boolean flags for planting signal conditions
  planting_signal_conditions jsonb      NOT NULL DEFAULT '{
    "unresolved_tension": false,
    "user_created_space": false,
    "genuine_surprise": false,
    "framework_convergence": false
  }',

  -- Gardener's private 2-3 sentence understanding of what the conversation is about
  conversation_spine        text        NOT NULL DEFAULT '',

  -- One memory record per room
  UNIQUE (room_id)
);

-- Indexes for efficient lookup
CREATE INDEX IF NOT EXISTS idx_gardener_memory_room_id  ON gardener_memory (room_id);
CREATE INDEX IF NOT EXISTS idx_gardener_memory_updated  ON gardener_memory (updated_at);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE gardener_memory ENABLE ROW LEVEL SECURITY;

-- Read: all authenticated users (rooms they can access)
CREATE POLICY "gardener_memory_select" ON gardener_memory
  FOR SELECT USING (true);

-- Insert/Update: authenticated users only
CREATE POLICY "gardener_memory_insert" ON gardener_memory
  FOR INSERT WITH CHECK (true);

CREATE POLICY "gardener_memory_update" ON gardener_memory
  FOR UPDATE USING (true);
