-- ============================================================
-- GroupChat — Rooms Table Setup
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- Safe to run on an existing table — uses IF NOT EXISTS / DO blocks
-- ============================================================

-- ── Step 1: Create the rooms table if it doesn't exist ───────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text          NOT NULL UNIQUE,
  mode        jsonb         NOT NULL,
  characters  jsonb         NOT NULL DEFAULT '[]',
  messages    jsonb         NOT NULL DEFAULT '[]',
  created_at  timestamptz   NOT NULL DEFAULT now()
);

-- ── Step 2: Index for fast room code lookups ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms (code);

-- ── Step 3: Enable Row Level Security ────────────────────────────────────────
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- ── Step 4: RLS policies — allow anonymous public access ─────────────────────

-- Drop old policies if they exist (ensures clean state)
DROP POLICY IF EXISTS "Allow public read rooms"   ON rooms;
DROP POLICY IF EXISTS "Allow public insert rooms" ON rooms;
DROP POLICY IF EXISTS "Allow public update rooms" ON rooms;

-- Anyone can read any room (needed for shared URL links)
CREATE POLICY "Allow public read rooms"
  ON rooms FOR SELECT
  USING (true);

-- Anyone can create a room
CREATE POLICY "Allow public insert rooms"
  ON rooms FOR INSERT
  WITH CHECK (true);

-- Anyone can update messages in a room (needed for live sync)
CREATE POLICY "Allow public update rooms"
  ON rooms FOR UPDATE
  USING (true);

-- ── Verification — run after to confirm everything is correct ─────────────────

-- Check the table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'rooms'
ORDER BY ordinal_position;

-- Check RLS policies are in place
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'rooms';
