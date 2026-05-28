-- ═══════════════════════════════════════════════════════════════════════════════
-- OGASCI — Setup completo (migraciones 001→004 + seed)
-- Pegar TODO en Supabase SQL Editor y ejecutar de una sola vez
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 001: Sources ─────────────────────────────────────────────────────────────

CREATE TYPE source_type AS ENUM ('rss', 'html', 'playwright');

CREATE TABLE sources (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL,
  url                     text NOT NULL UNIQUE,
  type                    source_type NOT NULL DEFAULT 'rss',
  category                text NOT NULL DEFAULT 'other',
  selector                text,
  scrape_interval_minutes integer NOT NULL DEFAULT 60,
  is_active               boolean NOT NULL DEFAULT true,
  last_scraped_at         timestamptz,
  last_error              text,
  error_count             integer NOT NULL DEFAULT 0,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

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

CREATE INDEX idx_sources_is_active ON sources(is_active);
CREATE INDEX idx_sources_type ON sources(type);
CREATE INDEX idx_sources_last_scraped_at ON sources(last_scraped_at NULLS FIRST);

ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sources_read" ON sources FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "sources_write" ON sources FOR ALL USING ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin');

-- ─── 002: Articles ────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE article_status AS ENUM ('pending', 'processing', 'done', 'failed');
CREATE TYPE sentiment_type AS ENUM ('positive', 'negative', 'neutral');
CREATE TYPE og_category AS ENUM (
  'upstream', 'downstream', 'midstream', 'supply_chain',
  'regulation', 'market', 'company', 'environment',
  'politics', 'infrastructure', 'other'
);

CREATE TABLE articles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id            uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  url                  text NOT NULL UNIQUE,
  url_hash             text UNIQUE,
  title                text,
  content              text,
  summary              text,
  published_at         timestamptz,
  scraped_at           timestamptz NOT NULL DEFAULT now(),
  processed_at         timestamptz,
  status               article_status NOT NULL DEFAULT 'pending',
  category             og_category,
  subcategory          text,
  sentiment            sentiment_type,
  relevance_score      numeric(3, 2) CHECK (relevance_score >= 0 AND relevance_score <= 1),
  supply_chain_impact  text,
  keywords             text[] NOT NULL DEFAULT '{}',
  embedding            vector(1536),
  error_message        text,
  retry_count          integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER articles_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_articles_source_id ON articles(source_id);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_category ON articles(category);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC NULLS LAST);
CREATE INDEX idx_articles_relevance_score ON articles(relevance_score DESC NULLS LAST);
CREATE INDEX idx_articles_url_hash ON articles(url_hash);
CREATE INDEX idx_articles_keywords ON articles USING GIN(keywords);
CREATE INDEX idx_articles_embedding ON articles USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_articles_fts ON articles USING GIN(to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content, '')));

ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "articles_read" ON articles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "articles_service_write" ON articles FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION match_articles(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count     int DEFAULT 10
)
RETURNS TABLE (
  id              uuid,
  title           text,
  summary         text,
  url             text,
  published_at    timestamptz,
  relevance_score numeric,
  similarity      float
)
LANGUAGE sql STABLE AS $$
  SELECT a.id, a.title, a.summary, a.url, a.published_at, a.relevance_score,
         1 - (a.embedding <=> query_embedding) AS similarity
  FROM articles a
  WHERE a.embedding IS NOT NULL
    AND 1 - (a.embedding <=> query_embedding) > match_threshold
    AND a.status = 'done'
  ORDER BY a.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ─── 003: Entities & Signals ──────────────────────────────────────────────────

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
  context     text,
  relevance   numeric(3, 2),
  PRIMARY KEY (article_id, entity_id)
);

CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_normalized_name ON entities(normalized_name);
CREATE INDEX idx_entities_mention_count ON entities(mention_count DESC);
CREATE INDEX idx_article_entities_entity_id ON article_entities(entity_id);
CREATE INDEX idx_article_entities_article_id ON article_entities(article_id);

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

ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entities_read" ON entities FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "entities_service_write" ON entities FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "article_entities_read" ON article_entities FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "article_entities_service_write" ON article_entities FOR ALL USING (auth.role() = 'service_role');

CREATE TYPE signal_type AS ENUM ('price_change','supply_disruption','new_contract','regulatory_change','company_news','infrastructure','logistics','market');
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
  resolved_by  uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_signals_type ON signals(type);
CREATE INDEX idx_signals_severity ON signals(severity);
CREATE INDEX idx_signals_status ON signals(status);
CREATE INDEX idx_signals_detected_at ON signals(detected_at DESC);

ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signals_read" ON signals FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "signals_analyst_resolve" ON signals FOR UPDATE USING ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'analyst'));
CREATE POLICY "signals_service_write" ON signals FOR INSERT USING (auth.role() = 'service_role');

-- ─── 004: Alerts & Briefs ─────────────────────────────────────────────────────

CREATE TABLE alert_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,
  name              text NOT NULL,
  description       text,
  conditions        jsonb NOT NULL DEFAULT '{}',
  channels          jsonb NOT NULL DEFAULT '{}',
  is_active         boolean NOT NULL DEFAULT true,
  last_triggered_at timestamptz,
  trigger_count     integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER alert_rules_updated_at
  BEFORE UPDATE ON alert_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX idx_alert_rules_user_id ON alert_rules(user_id);
CREATE INDEX idx_alert_rules_is_active ON alert_rules(is_active);

ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_rules_own" ON alert_rules FOR ALL USING (auth.uid() = user_id OR (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin');

CREATE TYPE alert_event_status AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE alert_channel AS ENUM ('email', 'slack', 'webhook');

CREATE TABLE alert_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id       uuid NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  article_id    uuid NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  channel       alert_channel NOT NULL,
  status        alert_event_status NOT NULL DEFAULT 'pending',
  error_message text,
  triggered_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_alert_events_rule_id ON alert_events(rule_id);
CREATE INDEX idx_alert_events_article_id ON alert_events(article_id);
CREATE INDEX idx_alert_events_triggered_at ON alert_events(triggered_at DESC);

ALTER TABLE alert_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alert_events_own" ON alert_events FOR SELECT USING (EXISTS (SELECT 1 FROM alert_rules r WHERE r.id = alert_events.rule_id AND (r.user_id = auth.uid() OR (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin')));
CREATE POLICY "alert_events_service_write" ON alert_events FOR ALL USING (auth.role() = 'service_role');

CREATE TABLE executive_briefs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date              date NOT NULL UNIQUE,
  content           text NOT NULL,
  content_html      text,
  model_used        text NOT NULL DEFAULT 'llama-3.3-70b-versatile',
  articles_analyzed integer NOT NULL DEFAULT 0,
  top_entities      jsonb NOT NULL DEFAULT '[]',
  key_signals       jsonb NOT NULL DEFAULT '[]',
  generated_at      timestamptz NOT NULL DEFAULT now(),
  generated_by      uuid
);

CREATE INDEX idx_executive_briefs_date ON executive_briefs(date DESC);
ALTER TABLE executive_briefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "briefs_read" ON executive_briefs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "briefs_analyst_generate" ON executive_briefs FOR ALL USING ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'analyst') OR auth.role() = 'service_role');

CREATE TABLE scrape_logs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id         uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  articles_found    integer NOT NULL DEFAULT 0,
  articles_new      integer NOT NULL DEFAULT 0,
  articles_skipped  integer NOT NULL DEFAULT 0,
  status            text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  error_message     text
);

CREATE INDEX idx_scrape_logs_source_id ON scrape_logs(source_id);
CREATE INDEX idx_scrape_logs_started_at ON scrape_logs(started_at DESC);
ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scrape_logs_admin" ON scrape_logs FOR ALL USING ((auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'analyst') OR auth.role() = 'service_role');

-- ─── Seed: 25 fuentes O&G Argentina ──────────────────────────────────────────

INSERT INTO sources (name, url, type, category, scrape_interval_minutes, is_active) VALUES
('IAPG - Instituto Argentino del Petróleo y el Gas', 'https://www.iapg.org.ar/feed/', 'rss', 'upstream', 30, true),
('Energía On', 'https://www.energiaon.com.ar/feed/', 'rss', 'market', 30, true),
('Portal Energético', 'https://portalenergetico.com.ar/feed/', 'rss', 'supply_chain', 30, true),
('Petroquímica Argentina', 'https://petroquimica.com.ar/feed/', 'rss', 'downstream', 60, true),
('Oil Production', 'https://www.oilproduction.net/feed/', 'rss', 'upstream', 60, true),
('Más Energía', 'https://masenergia.com.ar/feed/', 'rss', 'market', 30, true),
('Télam - Energía', 'https://www.telam.com.ar/rss/seccion/economia/', 'rss', 'politics', 30, true),
('Infobae - Economía', 'https://www.infobae.com/feeds/rss/economia/', 'rss', 'market', 30, true),
('La Nación - Economía', 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/categoria/economia/', 'rss', 'market', 30, true),
('El Cronista - Energía', 'https://www.cronista.com/rss/secciones/finanzas-y-mercados/', 'rss', 'market', 30, true),
('Ámbito Financiero', 'https://www.ambito.com/rss/pages/economia.xml', 'rss', 'market', 30, true),
('Apertura - Energía', 'https://www.apertura.com/rss/seccion/economia/', 'rss', 'company', 60, true),
('Bloomberg Línea Argentina', 'https://www.bloomberglinea.com/rss/argentina/', 'rss', 'market', 30, true),
('Río Negro - Economía', 'https://www.rionegro.com.ar/rss/seccion/economia/', 'rss', 'upstream', 30, true),
('La Mañana de Neuquén', 'https://www.lmneuquen.com/rss/seccion/economia-y-empresas/', 'rss', 'upstream', 30, true),
('Perfil - Economía', 'https://www.perfil.com/feed/economia', 'rss', 'politics', 60, true),
('Secretaría de Energía Argentina - Novedades', 'https://www.argentina.gob.ar/energia/noticias', 'html', 'regulation', 120, true),
('ENARGAS - Resoluciones', 'https://www.enargas.gob.ar/secciones/resoluciones/index.php', 'html', 'regulation', 240, true),
('YPF - Prensa', 'https://www.ypf.com/sala-de-prensa/comunicados', 'html', 'company', 120, true),
('Vista Energy - Press Releases', 'https://www.vistaenergy.com/es/inversores/sala-de-prensa', 'html', 'company', 240, true),
('Pampa Energía - Noticias', 'https://www.pampaenergia.com/novedades', 'html', 'company', 240, true),
('TGS - Transportadora Gas del Sur', 'https://www.tgs.com.ar/es/prensa/comunicados', 'html', 'midstream', 240, true),
('Pan American Energy - Noticias', 'https://www.pae.com.ar/sala-de-prensa/', 'html', 'company', 240, true),
('Tecpetrol - Noticias', 'https://www.tecpetrol.com/es/noticias', 'html', 'company', 240, true),
('Vaca Muerta News', 'https://vacamuertanews.com.ar', 'playwright', 'upstream', 30, true),
('Argentina Mining - Energía', 'https://www.argentinamining.com/tag/petroleo-gas/', 'playwright', 'upstream', 120, true),
-- Fuentes Prioritarias
('Econojournal', 'https://econojournal.com.ar/feed/', 'rss', 'upstream', 30, true),
('Vaca Muerta AR', 'https://vacamuerta.ar/feed/', 'rss', 'upstream', 30, true),
('MASE - La Mañana de Neuquén', 'https://mase.lmneuquen.com/feed/', 'rss', 'upstream', 30, true),
('McKinsey - Oil & Gas Insights', 'https://www.mckinsey.com/industries/oil-and-gas/our-insights', 'playwright', 'market', 120, true),
('Minuto Neuquén - Energía', 'https://www.minutoneuquen.com/energia/feed/', 'rss', 'upstream', 30, true),
('Rystad Energy - News', 'https://www.rystadenergy.com/news/', 'playwright', 'market', 60, true);
