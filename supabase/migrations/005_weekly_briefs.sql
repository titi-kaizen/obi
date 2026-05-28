-- ─── Migration 005: Weekly Briefs ──────────────────────────────────────────
-- Adds brief_type to executive_briefs so daily and weekly briefs can coexist.

ALTER TABLE executive_briefs
  ADD COLUMN IF NOT EXISTS brief_type text NOT NULL DEFAULT 'daily'
  CHECK (brief_type IN ('daily', 'weekly'));

-- Drop the old per-date uniqueness and replace with (date, type)
ALTER TABLE executive_briefs
  DROP CONSTRAINT IF EXISTS executive_briefs_date_key;

ALTER TABLE executive_briefs
  ADD CONSTRAINT executive_briefs_date_type_key UNIQUE (date, brief_type);
