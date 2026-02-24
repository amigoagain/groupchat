-- ============================================================
-- GroupChat — Inbox Columns Migration
-- Run in Supabase SQL Editor (Dashboard → SQL Editor)
-- Safe to run multiple times (IF NOT EXISTS guards each column)
-- ============================================================

-- ── Add inbox-related columns to rooms table ──────────────────────────────────
ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS created_by           text,
  ADD COLUMN IF NOT EXISTS last_message_preview text,
  ADD COLUMN IF NOT EXISTS last_activity        timestamptz  DEFAULT now(),
  ADD COLUMN IF NOT EXISTS participant_count    integer      DEFAULT 0;

-- ── Indexes for fast inbox queries ────────────────────────────────────────────

-- Used for "Browse All" sorting by most recent activity
CREATE INDEX IF NOT EXISTS idx_rooms_last_activity
  ON rooms (last_activity DESC NULLS LAST);

-- Used for "My Chats" filtering by creator
CREATE INDEX IF NOT EXISTS idx_rooms_created_by
  ON rooms (created_by);

-- ── Verification — run after to confirm everything is correct ─────────────────
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'rooms'
ORDER BY ordinal_position;
