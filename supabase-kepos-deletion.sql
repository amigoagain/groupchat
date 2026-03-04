-- ============================================================
-- KEPOS — Public Room Deletion + Stroll State Signal Column
-- Run this in Supabase SQL Editor (project: qmpdgkjbmgntgrzjmcoj)
-- ============================================================
--
-- PRE-RUN LOG (executed 2026-03-04 via REST API before this migration):
-- 36 public rooms identified for deletion:
--   453GPY · open · chat · 2026-03-01
--   P3S9PT · read-only · chat · 2026-02-25
--   M5AHMT · read-only · chat · 2026-02-25
--   LLDNAY · open · chat · 2026-02-26
--   DMTDVC · open · chat · 2026-02-26
--   Q5H2TT · read-only · chat · 2026-02-25
--   ST4HMC · open · chat · 2026-02-26
--   C7BWZP · read-only · chat · 2026-02-25
--   524ZJ8 · open · chat · 2026-02-26
--   MPEGHJ · open · chat · 2026-02-26
--   WD67JJ · open · chat · 2026-02-26
--   5V6KJC · open · chat · 2026-03-03
--   2P7H44 · open · chat · 2026-02-27
--   M6ZMB5 · open · chat · 2026-02-27
--   N8WQVN · open · chat · 2026-02-27
--   FWT3X7 · open · chat · 2026-02-26
--   QQWRL9 · open · chat · 2026-02-26
--   DFCPU9 · open · chat · 2026-02-26
--   3VKEVB · open · chat · 2026-02-26
--   UDVLQL · open · chat · 2026-02-27
--   U4UU3G · open · chat · 2026-02-27
--   69MLBZ · open · chat · 2026-02-26
--   ETNCR8 · open · chat · 2026-02-27
--   GLY2FM · open · chat · 2026-02-27
--   X7R5TX · open · chat · 2026-02-27
--   WXJKPP · open · chat · 2026-03-03
--   PWMJJR · open · chat · 2026-02-28
--   65EMBG · open · chat · 2026-03-04
--   GAF983 · open · chat · 2026-02-28
--   UJ6RKS · open · chat · 2026-02-28
--   9QXL3S · open · chat · 2026-02-28
--   B2WMS6 · open · chat · 2026-03-04
--   4GNR6G · open · chat · 2026-02-27
--   87PJLA · open · chat · 2026-02-28
--   AXA2YR · unlisted · chat · 2026-02-28
--   HV4KM2 · open · chat · 2026-02-28
-- ============================================================

-- ── Step 1: Confirm rooms to be deleted (run first to verify) ─────────────────
SELECT id, code, visibility, room_mode, created_at
FROM rooms
WHERE visibility IN ('read-only', 'moderated-public', 'open', 'unlisted')
AND room_mode != 'stroll'
AND id NOT IN (
  SELECT DISTINCT parent_room_id FROM rooms
  WHERE parent_room_id IS NOT NULL
);

-- ── Step 2: Delete public rooms ────────────────────────────────────────────────
DELETE FROM rooms
WHERE visibility IN ('read-only', 'moderated-public', 'open', 'unlisted')
AND room_mode != 'stroll'
AND id NOT IN (
  SELECT DISTINCT parent_room_id FROM rooms
  WHERE parent_room_id IS NOT NULL
);

-- ── Step 3: Delete orphaned messages ──────────────────────────────────────────
-- (rooms with ON DELETE CASCADE should handle messages automatically,
--  but this is a safety net for any that slipped through)
DELETE FROM messages
WHERE room_id NOT IN (SELECT id FROM rooms);

-- ── Step 4: Confirm deletion ───────────────────────────────────────────────────
SELECT count(*) AS remaining_public_rooms
FROM rooms
WHERE visibility IN ('read-only', 'moderated-public', 'open', 'unlisted');

-- ── Step 5: Add turn_count_chosen to stroll_state ─────────────────────────────
--
-- Permanent record of the user's original turn count intention at stroll creation.
-- Written once at stroll creation. Never updated.
-- Distinct from turn_count_total (may differ in branches) and turns_elapsed.
-- Signal: ratio of turns_elapsed / turn_count_chosen at dormancy reveals
-- whether the user's intended length matched what actually ran.
ALTER TABLE stroll_state
ADD COLUMN IF NOT EXISTS turn_count_chosen integer;

-- ── Step 6: Backfill existing stroll_state rows ────────────────────────────────
-- For existing rows, use turn_count_total as the best available proxy
UPDATE stroll_state
SET turn_count_chosen = turn_count_total
WHERE turn_count_chosen IS NULL;

-- ── Step 7: Confirm stroll_state migration ────────────────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'stroll_state'
AND column_name = 'turn_count_chosen';
