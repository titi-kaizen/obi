-- ─── Migration 003: Entities & Signals ────────────────────────────────────────

CREATE TYPE entity_type AS ENUM ('company', 'person', 'location', 'project', 'regulation');

CREATE TABLE entities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  type             entity_type NOT NULL,
  normalized_name  text NOT NULL,
  description      text,
  mention_count    integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (normalized_name, type)
);

CREATE TABLE article_entities (
  article_id  uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  entity_id   uuid NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  context     text,          -- Sentence fragment where entity was mentioned
  relevance   numeric(3, 2), -- 0.00 to 1.00
  PRIMARY KEY (article_id, entity_id)
);

-- Indexes
CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_normalized_name ON entities(normalized_name);
CREATE INDEX idx_entities_mention_count ON entities(mention_count DESC);
CREATE INDEX idx_article_entities_entity_id ON article_entities(entity_id);
CREATE INDEX idx_article_entities_article_id ON article_entities(article_id);

-- Auto-increment entity mention count on insert
CREATE OR REPLACE FUNCTION increment_entity_mention()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE entities SET mention_count = mention_count + 1 WHERE id = NEW.entity_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER article_entities_increment_mention
  AFTER INSERT ON article_entities
  FOR EACH ROW EXECUTE FUNCTION increment_entity_mention();

-- Decrement on delete
CREATE OR REPLACE FUNCTION decrement_entity_mention()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE entities SET mention_count = GREATEST(mention_count - 1, 0) WHERE id = OLD.entity_id;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER article_entities_decrement_mention
  AFTER DELETE ON article_entities
  FOR EACH ROW EXECUTE FUNCTION decrement_entity_mention();

-- RLS
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entities_read" ON entities FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "entities_service_write" ON entities FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "article_entities_read" ON article_entities FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "article_entities_service_write" ON article_entities FOR ALL USING (auth.role() = 'service_role');

-- ─── Signals ──────────────────────────────────────────────────────────────────

CREATE TYPE signal_type AS ENUM (
  'price_change', 'supply_disruption', 'new_contract',
  'regulatory_change', 'company_news', 'infrastructure', 'logistics', 'market'
);
CREATE TYPE signal_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE signal_status AS ENUM ('active', 'resolved', 'dismissed');

CREATE TABLE signals (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         signal_type NOT NULL,
  title        text NOT NULL,
  description  text,
  severity     signal_severity NOT NULL DEFAULT 'medium',
  status       signal_status NOT NULL DEFAULT 'active',
  article_ids  uuid[] NOT NULL DEFAULT '{}',
  entity_ids   uuid[] NOT NULL DEFAULT '{}',
  metadata     jsonb NOT NULL DEFAULT '{}',
  detected_at  timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  resolved_by  uuid,          -- references auth.users(id)
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_signals_type ON signals(type);
CREATE INDEX idx_signals_severity ON signals(severity);
CREATE INDEX idx_signals_status ON signals(status);
CREATE INDEX idx_signals_detected_at ON signals(detected_at DESC);

-- RLS
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "signals_read" ON signals FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "signals_analyst_resolve" ON signals
  FOR UPDATE USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'analyst')
  );
CREATE POLICY "signals_service_write" ON signals FOR INSERT USING (auth.role() = 'service_role');
