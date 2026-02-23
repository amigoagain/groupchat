-- ============================================================
-- GroupChat — Supabase Schema Migrations
-- Run these in your Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- ── Step 1: Add new columns to custom_characters ─────────────────────────────
-- Safe to run multiple times (IF NOT EXISTS guards each column)

ALTER TABLE custom_characters
  ADD COLUMN IF NOT EXISTS verified       boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS variant_of     uuid      REFERENCES custom_characters(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS upvotes        integer   DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_by     text,
  ADD COLUMN IF NOT EXISTS is_canonical   boolean   DEFAULT false,
  ADD COLUMN IF NOT EXISTS tags           text[]    DEFAULT '{}';

-- ── Step 2: Index for fast lookups by parent character ───────────────────────
CREATE INDEX IF NOT EXISTS idx_custom_characters_variant_of
  ON custom_characters (variant_of)
  WHERE variant_of IS NOT NULL;

-- ── Step 3: Index for fast lookups of canonical characters ───────────────────
CREATE INDEX IF NOT EXISTS idx_custom_characters_is_canonical
  ON custom_characters (is_canonical);

-- ── Step 4: Add upsert support on character name (used by seed script) ───────
-- This creates a unique constraint on name so upsert(onConflict:'name') works.
-- NOTE: If you have duplicate names in your DB already, de-duplicate first.
ALTER TABLE custom_characters
  ADD CONSTRAINT custom_characters_name_unique UNIQUE (name);

-- ── Step 5: RLS — ensure public can read all characters ──────────────────────
-- (Run only if your table doesn't already have these policies)

-- Allow anyone to read all characters (canonical + variants + custom)
CREATE POLICY IF NOT EXISTS "Allow public read of all characters"
  ON custom_characters FOR SELECT
  USING (true);

-- Allow anyone to insert new custom characters
CREATE POLICY IF NOT EXISTS "Allow public insert of custom characters"
  ON custom_characters FOR INSERT
  WITH CHECK (true);

-- Allow update only of non-canonical characters
CREATE POLICY IF NOT EXISTS "Allow public update of user characters"
  ON custom_characters FOR UPDATE
  USING (is_canonical = false AND verified = false);

-- Allow delete only of non-canonical characters
CREATE POLICY IF NOT EXISTS "Allow public delete of user characters"
  ON custom_characters FOR DELETE
  USING (is_canonical = false AND verified = false);

-- ── Verification query — run after migrations to confirm schema ───────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'custom_characters'
ORDER BY ordinal_position;
