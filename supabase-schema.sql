-- ============================================================
-- GroupChat — Complete Schema Rebuild
-- Run this in Supabase SQL Editor
-- WARNING: Drops the existing rooms table. custom_characters is preserved.
-- ============================================================

-- ── Step 1: Drop old rooms table (clean slate) ────────────────────────────────
DROP TABLE IF EXISTS rooms CASCADE;

-- ── Step 2: Users table ───────────────────────────────────────────────────────
-- Links Supabase auth identities to app-level user profiles
CREATE TABLE IF NOT EXISTS users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id     UUID        UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  username    TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_auth_id_idx ON users(auth_id);

-- ── Step 3: Rooms table ───────────────────────────────────────────────────────
CREATE TABLE rooms (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT        NOT NULL UNIQUE,
  mode                  JSONB       NOT NULL,
  characters            JSONB       NOT NULL DEFAULT '[]',
  created_by_user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_by_name       TEXT        NOT NULL DEFAULT 'Guest',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity         TIMESTAMPTZ NOT NULL DEFAULT now(),
  participant_count     INTEGER     NOT NULL DEFAULT 1,
  visibility            TEXT        NOT NULL DEFAULT 'private'
                        CHECK (visibility IN ('private','unlisted','read-only','moderated-public','open')),
  parent_room_id        UUID        REFERENCES rooms(id) ON DELETE SET NULL,
  branched_at_sequence  INTEGER,
  branch_depth          INTEGER     NOT NULL DEFAULT 0,
  last_message_preview  TEXT,
  -- Founding context: selected messages that seeded a branch room
  -- Shape: [{ sender_type, sender_name, sender_color, sender_initial, content, sequence_number }]
  founding_context      JSONB       DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS rooms_code_idx          ON rooms (code);
CREATE INDEX IF NOT EXISTS rooms_visibility_idx    ON rooms (visibility, last_activity DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS rooms_parent_room_idx   ON rooms (parent_room_id) WHERE parent_room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS rooms_created_by_idx    ON rooms (created_by_user_id) WHERE created_by_user_id IS NOT NULL;

-- ── Step 4: Messages table ────────────────────────────────────────────────────
CREATE TABLE messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_type     TEXT        NOT NULL CHECK (sender_type IN ('user','character','weaver')),
  sender_name     TEXT        NOT NULL,
  sender_id       TEXT,       -- user_id (UUID string) for users, character.id for characters
  sender_color    TEXT,       -- hex color for UI rendering
  sender_initial  TEXT,       -- single letter initial for avatar
  content         TEXT        NOT NULL,
  sequence_number INTEGER     NOT NULL DEFAULT 0,
  is_error        BOOLEAN     NOT NULL DEFAULT false,
  metadata        JSONB       DEFAULT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS messages_room_id_seq_idx ON messages (room_id, sequence_number ASC);

-- Auto-assign sequence_number per room (monotonically increasing)
CREATE OR REPLACE FUNCTION set_message_sequence_number()
RETURNS TRIGGER AS $$
DECLARE
  next_seq INTEGER;
BEGIN
  SELECT COALESCE(MAX(sequence_number), 0) + 1
    INTO next_seq
    FROM messages
   WHERE room_id = NEW.room_id;
  NEW.sequence_number := next_seq;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS messages_seq_trigger ON messages;
CREATE TRIGGER messages_seq_trigger
  BEFORE INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION set_message_sequence_number();

-- ── Step 5: Enable RLS ────────────────────────────────────────────────────────
ALTER TABLE users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms   ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- ── Step 6: RLS Policies ──────────────────────────────────────────────────────

-- Users: each user can read/write their own profile; anyone can insert on signup
DROP POLICY IF EXISTS "Users read own"   ON users;
DROP POLICY IF EXISTS "Users update own" ON users;
DROP POLICY IF EXISTS "Users insert"     ON users;

CREATE POLICY "Users read own"   ON users FOR SELECT USING (auth.uid() = auth_id OR true); -- readable by all (username display)
CREATE POLICY "Users update own" ON users FOR UPDATE USING (auth.uid() = auth_id);
CREATE POLICY "Users insert"     ON users FOR INSERT WITH CHECK (true);

-- Rooms: public rooms (read-only/open) are readable by all; private/unlisted by code only
DROP POLICY IF EXISTS "Rooms read"   ON rooms;
DROP POLICY IF EXISTS "Rooms insert" ON rooms;
DROP POLICY IF EXISTS "Rooms update" ON rooms;

CREATE POLICY "Rooms read"   ON rooms FOR SELECT USING (true);  -- code acts as the secret; filtered in app
CREATE POLICY "Rooms insert" ON rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Rooms update" ON rooms FOR UPDATE USING (true);

-- Messages: readable if the user can read the room; writable by anyone with the code
DROP POLICY IF EXISTS "Messages read"   ON messages;
DROP POLICY IF EXISTS "Messages insert" ON messages;

CREATE POLICY "Messages read"   ON messages FOR SELECT USING (true);
CREATE POLICY "Messages insert" ON messages FOR INSERT WITH CHECK (true);

-- ── Step 7: Helper function — upsert user on auth sign-in ────────────────────
-- Called from the app after successful auth to create/update the users row
CREATE OR REPLACE FUNCTION upsert_user_profile(
  p_auth_id  UUID,
  p_email    TEXT,
  p_username TEXT
)
RETURNS users AS $$
DECLARE
  result users;
BEGIN
  INSERT INTO users (auth_id, email, username)
  VALUES (p_auth_id, p_email, p_username)
  ON CONFLICT (auth_id)
  DO UPDATE SET email = EXCLUDED.email,
                username = CASE WHEN EXCLUDED.username != '' THEN EXCLUDED.username ELSE users.username END
  RETURNING * INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Step 8: Verify ────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
