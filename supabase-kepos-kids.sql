-- ============================================================
-- KEPOS — Kepos for Kids schema migration
-- Run this in Supabase SQL Editor (project: qmpdgkjbmgntgrzjmcoj)
-- ============================================================
--
-- Adds:
--   rooms.is_kids_mode  — boolean flag; true for stroll rooms opened via
--                         the Kepos for Kids gate.
--                         Causes runStrollGardener to use STROLL_GARDENER_KIDS_BASE
--                         and age-appropriate turn behaviour.
-- ============================================================

ALTER TABLE rooms
ADD COLUMN IF NOT EXISTS is_kids_mode BOOLEAN NOT NULL DEFAULT false;

-- Index so filtering is fast if needed later
CREATE INDEX IF NOT EXISTS rooms_is_kids_mode_idx ON rooms (is_kids_mode)
  WHERE is_kids_mode = true;
