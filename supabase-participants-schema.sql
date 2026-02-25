-- ============================================================
-- Kepos — room_participants Migration
-- Run this in Supabase SQL Editor after supabase-schema.sql
-- Adds participant role management for read-only / moderated rooms.
-- ============================================================

-- ── Step 1: Create room_participants table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS room_participants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id     TEXT        NOT NULL,   -- users.id UUID as TEXT (works for auth + guest)
  username    TEXT,
  role        TEXT        NOT NULL DEFAULT 'viewer'
              CHECK (role IN ('admin', 'participant', 'viewer')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (room_id, user_id)
);

-- ── Step 2: Indexes ────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_room_participants_room ON room_participants (room_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_user ON room_participants (user_id);

-- ── Step 3: Enable RLS ────────────────────────────────────────────────────────
ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;

-- ── Step 4: RLS Policies ──────────────────────────────────────────────────────
-- Anyone who knows the room code can read participant list (room code = access token)
DROP POLICY IF EXISTS "Participants read"   ON room_participants;
DROP POLICY IF EXISTS "Participants insert" ON room_participants;
DROP POLICY IF EXISTS "Participants update" ON room_participants;
DROP POLICY IF EXISTS "Participants delete" ON room_participants;

CREATE POLICY "Participants read"   ON room_participants FOR SELECT USING (true);
CREATE POLICY "Participants insert" ON room_participants FOR INSERT WITH CHECK (true);
CREATE POLICY "Participants update" ON room_participants FOR UPDATE USING (true);
CREATE POLICY "Participants delete" ON room_participants FOR DELETE USING (true);

-- ── Step 5: Verify ─────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
