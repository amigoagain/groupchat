-- ══════════════════════════════════════════════════════════════════════════════
--  gardener_memory — v2 migration
--  Run this in the Supabase SQL editor AFTER supabase-gardener-memory.sql.
-- ══════════════════════════════════════════════════════════════════════════════

-- Tracks which turn the last planting signal was emitted for this room.
-- Used by the rate-limit gate: no further signals within 10 turns of the last.
ALTER TABLE gardener_memory
  ADD COLUMN IF NOT EXISTS last_signal_turn integer NOT NULL DEFAULT 0;
