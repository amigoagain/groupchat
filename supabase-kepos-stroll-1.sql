-- ============================================================
-- KEPOS — Stroll as Primary Entry Point schema migration
-- Run this in Supabase SQL Editor (project: qmpdgkjbmgntgrzjmcoj)
-- ============================================================
--
-- Adds:
--   rooms.stroll_type           — 'gardener_only' | 'character_stroll'
--   rooms.genealogy_visible     — privacy: false = branch appears as root in public view
--   stroll_state.stroll_type    — mirrors rooms.stroll_type
--   stroll_state.opening_context — the user's original entry text, preserved in stroll_state
--   stroll_state.parent_stroll_id — links Stroll 2 back to Stroll 1
--   gardener_memory.handoff_mentions — count of times Gardener has suggested a character (max 2)
--   gardener_memory.handoff_character — name of suggested character
--   gardener_memory.handoff_status — 'none' | 'suggested' | 'accepted' | 'declined' | 'passed'
--   gardener_memory.opening_context — the user's original entry text
-- ============================================================

-- ── Step 1: Add stroll_type to rooms ──────────────────────────────────────────
ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS stroll_type text;

-- ── Step 2: Add genealogy_visible to rooms ────────────────────────────────────
-- When a room is set private (after being public), genealogy_visible = false
-- means branches appear as roots in the public graph — parent is hidden.
ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS genealogy_visible boolean DEFAULT true;

-- ── Step 3: Add stroll_type to stroll_state ──────────────────────────────────
ALTER TABLE stroll_state
ADD COLUMN IF NOT EXISTS stroll_type text;

-- ── Step 4: Add opening_context to stroll_state ──────────────────────────────
-- Written once at stroll creation. The user's original entry text.
-- Never updated. Permanent record of what the stroll was about.
ALTER TABLE stroll_state
ADD COLUMN IF NOT EXISTS opening_context text;

-- ── Step 5: Add parent_stroll_id to stroll_state ─────────────────────────────
-- Links Stroll 2 (character_stroll) back to its Stroll 1 (gardener_only).
-- Allows genealogy tracing across the two-part stroll arc.
ALTER TABLE stroll_state
ADD COLUMN IF NOT EXISTS parent_stroll_id uuid REFERENCES rooms(id);

-- ── Step 6: Add handoff tracking to gardener_memory ──────────────────────────
-- handoff_mentions: 0, 1, or 2 — how many times the Gardener has mentioned a character
-- handoff_character: the character name suggested (null until suggested)
-- handoff_status: tracks where we are in the handoff arc
-- opening_context: mirrors stroll_state.opening_context for Gardener prompt access
ALTER TABLE gardener_memory
ADD COLUMN IF NOT EXISTS handoff_mentions integer DEFAULT 0;

ALTER TABLE gardener_memory
ADD COLUMN IF NOT EXISTS handoff_character text;

ALTER TABLE gardener_memory
ADD COLUMN IF NOT EXISTS handoff_status text DEFAULT 'none';

ALTER TABLE gardener_memory
ADD COLUMN IF NOT EXISTS opening_context text;

-- ── Step 7: Seed genealogy_visible on existing rooms ─────────────────────────
UPDATE rooms
SET genealogy_visible = true
WHERE genealogy_visible IS NULL;

-- ── Step 8: Confirm all new columns present ───────────────────────────────────
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('rooms', 'stroll_state', 'gardener_memory')
  AND column_name IN (
    'stroll_type',
    'genealogy_visible',
    'opening_context',
    'parent_stroll_id',
    'handoff_mentions',
    'handoff_character',
    'handoff_status'
  )
ORDER BY table_name, column_name;
