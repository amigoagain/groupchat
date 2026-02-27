-- ══════════════════════════════════════════════════════════════════════════════
--  gardener_memory — v3 migration
--  Run this in the Supabase SQL editor AFTER supabase-gardener-memory-v2.sql.
-- ══════════════════════════════════════════════════════════════════════════════

-- Stores the opening path detected by the Gardener Router on the first turn.
-- 'arrival'   — user opened with a greeting or casual message (no topic)
-- 'deliberate' — user opened with a specific question, topic, or prompt
-- null         — middle/late phase, or pre-Router conversations
ALTER TABLE gardener_memory
  ADD COLUMN IF NOT EXISTS opening_path text
  CHECK (opening_path IN ('arrival', 'deliberate'));
