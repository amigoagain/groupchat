-- ============================================================
-- GroupChat — Feature 7: Room Visibility + Branch Data Model
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- Safe to run multiple times — all statements are idempotent
-- ============================================================

-- ── Step 1: Add visibility column ─────────────────────────────────────────────
-- Supported states:
--   private          → only the creator (via room code) can access
--   unlisted         → accessible via room code, not in Browse All
--   read-only        → publicly listed in Browse All; users can read but not post
--   moderated-public → publicly listed; posts require approval (future feature)
--   open             → fully public; anyone can read and post
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';

-- Add check constraint separately (ADD COLUMN … CHECK is not supported in all PG versions via IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'rooms_visibility_check'
  ) THEN
    ALTER TABLE rooms
      ADD CONSTRAINT rooms_visibility_check
      CHECK (visibility IN ('private', 'unlisted', 'read-only', 'moderated-public', 'open'));
  END IF;
END $$;

-- ── Step 2: Set all existing rooms to 'private' (they were effectively private already) ─
UPDATE rooms SET visibility = 'private' WHERE visibility IS NULL OR visibility NOT IN ('private', 'unlisted', 'read-only', 'moderated-public', 'open');

-- ── Step 3: Add branch genealogy columns ──────────────────────────────────────
-- parent_room_id: the room this was branched from (nullable — null = original room)
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS parent_room_id TEXT REFERENCES rooms(code) ON DELETE SET NULL;

-- branched_at: JSONB snapshot of where the branch originated
-- Shape: { messageId: string, messageIndex: number, timestamp: string, contentSnippet: string }
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS branched_at JSONB DEFAULT NULL;

-- ── Step 4: Indexes ───────────────────────────────────────────────────────────
-- Index for Browse All query (filter + sort by recency)
CREATE INDEX IF NOT EXISTS rooms_visibility_activity_idx
  ON rooms (visibility, last_activity DESC NULLS LAST);

-- Index for lineage tracing (find all branches of a room)
CREATE INDEX IF NOT EXISTS rooms_parent_room_idx
  ON rooms (parent_room_id)
  WHERE parent_room_id IS NOT NULL;

-- ── Step 5: Verification ──────────────────────────────────────────────────────
-- Run after to confirm everything applied correctly

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'rooms'
ORDER BY ordinal_position;
