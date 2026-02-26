-- ── planting_signals table ────────────────────────────────────────────────────
-- Stores moments where the Gardener detects conditions suitable for planting:
-- real conversation depth, unresolved tension between frameworks, and a user
-- move that creates space rather than fills it.
--
-- The signal is emitted by the Gardener as a PLANTING_SIGNAL:{...} line at
-- the end of a character response, stripped by the app before display, and
-- written here fire-and-forget. Never shown to users.
--
-- Run this in your Supabase SQL editor.

CREATE TABLE IF NOT EXISTS planting_signals (
  id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id              uuid        REFERENCES rooms(id) ON DELETE CASCADE,
  created_at           timestamptz DEFAULT now(),
  character_config     text[],                        -- array of character names present
  conversation_mode    text,                          -- mode id (chat / discuss / plan / advise)
  depth_level          text        CHECK (depth_level IN ('surface', 'engaged', 'working', 'deep')),
  tension_signature    text,                          -- brief description of the unresolved seam
  user_move_signature  text        CHECK (user_move_signature IN ('name_only', 'short_restatement', 'single_question', 'other')),
  sequence_number      integer                        -- message sequence number at signal fire
);

CREATE INDEX IF NOT EXISTS idx_planting_signals_room_id    ON planting_signals(room_id);
CREATE INDEX IF NOT EXISTS idx_planting_signals_created_at ON planting_signals(created_at);

-- Enable Row Level Security (permissive for now — tighten in production)
ALTER TABLE planting_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "planting_signals_select" ON planting_signals FOR SELECT USING (true);
CREATE POLICY "planting_signals_insert" ON planting_signals FOR INSERT WITH CHECK (true);
