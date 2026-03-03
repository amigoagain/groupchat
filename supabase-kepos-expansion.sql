-- ============================================================
-- Kepos Architecture Expansion — Stage 1 Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- ── 1. weather_state ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weather_state (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id             UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  turn_count_total    INTEGER     NOT NULL DEFAULT 0,
  turns_elapsed       INTEGER     NOT NULL DEFAULT 0,
  turns_remaining     INTEGER     NOT NULL DEFAULT 0,
  current_conditions  JSONB       NOT NULL DEFAULT '{}',
  timestamp           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS weather_state_room_id_idx ON weather_state (room_id, timestamp DESC);

ALTER TABLE weather_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "weather_state read"   ON weather_state;
DROP POLICY IF EXISTS "weather_state insert" ON weather_state;
DROP POLICY IF EXISTS "weather_state update" ON weather_state;
CREATE POLICY "weather_state read"   ON weather_state FOR SELECT USING (true);
CREATE POLICY "weather_state insert" ON weather_state FOR INSERT WITH CHECK (true);
CREATE POLICY "weather_state update" ON weather_state FOR UPDATE USING (true);

-- ── 2. agent_signals ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_signals (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID        NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  agent_source TEXT        NOT NULL,
  signal_type  TEXT        NOT NULL CHECK (signal_type IN (
                  'goose_honk','ladybug','hux_bark','farmer_trigger','governance_collapse','weather_report'
               )),
  signal_data  JSONB       NOT NULL DEFAULT '{}',
  turn_number  INTEGER     NOT NULL DEFAULT 0,
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_signals_room_id_idx     ON agent_signals (room_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS agent_signals_type_idx        ON agent_signals (room_id, signal_type, timestamp DESC);

ALTER TABLE agent_signals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "agent_signals read"   ON agent_signals;
DROP POLICY IF EXISTS "agent_signals insert" ON agent_signals;
CREATE POLICY "agent_signals read"   ON agent_signals FOR SELECT USING (true);
CREATE POLICY "agent_signals insert" ON agent_signals FOR INSERT WITH CHECK (true);

-- ── 3. constitutional_layer ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS constitutional_layer (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  character_id     TEXT        NOT NULL UNIQUE,
  character_name   TEXT        NOT NULL,
  commitment_1     TEXT        NOT NULL,
  commitment_2     TEXT        NOT NULL,
  commitment_3     TEXT        NOT NULL,
  commitment_4     TEXT        NOT NULL,
  commitment_5     TEXT        NOT NULL,
  commitment_6     TEXT,
  commitment_7     TEXT,
  endorsed_by      TEXT,
  endorsement_date DATE,
  version          TEXT        NOT NULL DEFAULT '1.0',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE constitutional_layer ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "constitutional_layer read"   ON constitutional_layer;
DROP POLICY IF EXISTS "constitutional_layer insert" ON constitutional_layer;
DROP POLICY IF EXISTS "constitutional_layer update" ON constitutional_layer;
CREATE POLICY "constitutional_layer read"   ON constitutional_layer FOR SELECT USING (true);
CREATE POLICY "constitutional_layer insert" ON constitutional_layer FOR INSERT WITH CHECK (true);
CREATE POLICY "constitutional_layer update" ON constitutional_layer FOR UPDATE USING (true);

-- ── 4. stroll_state ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'stroll_season') THEN
    CREATE TYPE stroll_season AS ENUM (
      'winter_1','spring_1','summer_1','fall_1',
      'winter_2','spring_2','summer_2','fall_2','dormant'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS stroll_state (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id               UUID          NOT NULL UNIQUE REFERENCES rooms(id) ON DELETE CASCADE,
  turn_count_total      INTEGER       NOT NULL DEFAULT 0,
  turns_elapsed         INTEGER       NOT NULL DEFAULT 0,
  turns_remaining       INTEGER       NOT NULL DEFAULT 0,
  current_season        stroll_season NOT NULL DEFAULT 'winter_1',
  season_cycle          INTEGER       NOT NULL DEFAULT 1 CHECK (season_cycle IN (1, 2)),
  substrate_notes       TEXT,
  opened_at             TIMESTAMPTZ   NOT NULL DEFAULT now(),
  closed_at             TIMESTAMPTZ,
  branch_source_room_id UUID          REFERENCES rooms(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stroll_state_room_id_idx ON stroll_state (room_id);

ALTER TABLE stroll_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "stroll_state read"   ON stroll_state;
DROP POLICY IF EXISTS "stroll_state insert" ON stroll_state;
DROP POLICY IF EXISTS "stroll_state update" ON stroll_state;
CREATE POLICY "stroll_state read"   ON stroll_state FOR SELECT USING (true);
CREATE POLICY "stroll_state insert" ON stroll_state FOR INSERT WITH CHECK (true);
CREATE POLICY "stroll_state update" ON stroll_state FOR UPDATE USING (true);

-- ── 5. library_reports ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'library_report_type') THEN
    CREATE TYPE library_report_type AS ENUM (
      'governance_failure','bugs_data','weather_report',
      'gardener_journal','weatherman_journal','entomologist_journal'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS library_reports (
  id            UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type   library_report_type NOT NULL,
  room_id       UUID                REFERENCES rooms(id) ON DELETE SET NULL,
  content       JSONB               NOT NULL DEFAULT '{}',
  generated_by  TEXT                NOT NULL DEFAULT 'system',
  created_at    TIMESTAMPTZ         NOT NULL DEFAULT now(),
  is_public     BOOLEAN             NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS library_reports_type_idx ON library_reports (report_type, created_at DESC);
CREATE INDEX IF NOT EXISTS library_reports_room_idx ON library_reports (room_id) WHERE room_id IS NOT NULL;

ALTER TABLE library_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "library_reports read"   ON library_reports;
DROP POLICY IF EXISTS "library_reports insert" ON library_reports;
CREATE POLICY "library_reports read"   ON library_reports FOR SELECT USING (true);
CREATE POLICY "library_reports insert" ON library_reports FOR INSERT WITH CHECK (true);

-- ── 6. notebook_entries ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notebook_entries (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notebook_entries_user_idx ON notebook_entries (user_id, created_at DESC);

ALTER TABLE notebook_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notebook_entries read"   ON notebook_entries;
DROP POLICY IF EXISTS "notebook_entries insert" ON notebook_entries;
DROP POLICY IF EXISTS "notebook_entries update" ON notebook_entries;
DROP POLICY IF EXISTS "notebook_entries delete" ON notebook_entries;
CREATE POLICY "notebook_entries read"   ON notebook_entries FOR SELECT USING (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));
CREATE POLICY "notebook_entries insert" ON notebook_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "notebook_entries update" ON notebook_entries FOR UPDATE USING (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));
CREATE POLICY "notebook_entries delete" ON notebook_entries FOR DELETE USING (auth.uid() = (SELECT auth_id FROM users WHERE id = user_id));

-- ── 7. Update gardener_memory ─────────────────────────────────────────────────
-- Add seasonal_position, stroll_mode, last_self_assessment, and new array fields

ALTER TABLE gardener_memory
  ADD COLUMN IF NOT EXISTS seasonal_position   TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS stroll_mode         BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_self_assessment TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ladybug_instances   JSONB       NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS hux_bark_instances  JSONB       NOT NULL DEFAULT '[]';

-- ── 8. Update rooms ───────────────────────────────────────────────────────────
-- Add room_mode, stroll_turn_count, dormant_at

ALTER TABLE rooms
  ADD COLUMN IF NOT EXISTS room_mode         TEXT        DEFAULT 'chat'
                           CHECK (room_mode IN ('chat','discuss','plan','advise','stroll')),
  ADD COLUMN IF NOT EXISTS stroll_turn_count INTEGER     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS dormant_at        TIMESTAMPTZ DEFAULT NULL;

-- ── 9. Verify ────────────────────────────────────────────────────────────────
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
