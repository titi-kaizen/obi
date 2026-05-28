-- ─── Migration 001: Sources ────────────────────────────────────────────────────
-- Fuentes de noticias O&G Argentina

CREATE TYPE source_type AS ENUM ('rss', 'html', 'playwright');

CREATE TABLE sources (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  url                     text NOT NULL UNIQUE,
  type                    source_type NOT NULL DEFAULT 'rss',
  category                text NOT NULL DEFAULT 'other',
  selector                text,                        -- CSS selector for HTML scraping
  scrape_interval_minutes integer NOT NULL DEFAULT 60,
  is_active               boolean NOT NULL DEFAULT true,
  last_scraped_at         timestamptz,
  last_error              text,
  error_count             integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sources_updated_at
  BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes
CREATE INDEX idx_sources_is_active ON sources(is_active);
CREATE INDEX idx_sources_type ON sources(type);
CREATE INDEX idx_sources_last_scraped_at ON sources(last_scraped_at NULLS FIRST);

-- RLS
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;

-- Viewers, analysts, admins can read sources
CREATE POLICY "sources_read" ON sources
  FOR SELECT USING (
    auth.role() = 'authenticated'
  );

-- Only admins can insert/update/delete
CREATE POLICY "sources_write" ON sources
  FOR ALL USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );
