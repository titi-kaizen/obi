-- ─── Migration 006: Python Backend Tables ────────────────────────────────────
-- New tables for the Python FastAPI intelligence engine

-- ── Article pipeline states (extended) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS articles_v2 (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id               uuid NOT NULL,
  source_name             text NOT NULL DEFAULT '',

  url                     text NOT NULL,
  url_hash                text NOT NULL,

  title                   text,
  content                 text,
  summary                 text,
  published_at            timestamptz,

  -- Pipeline state machine
  status                  text NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued','scraping','scraped','parsing',
                                              'classified','completed','failed','irrelevant')),
  pipeline_started_at     timestamptz,
  pipeline_completed_at   timestamptz,
  pipeline_duration_ms    integer,
  scrape_method           text CHECK (scrape_method IN ('bs4','playwright','rss') OR scrape_method IS NULL),
  scrape_selector         text,

  -- AI enrichment
  category                text,
  subcategory             text,
  sentiment               text CHECK (sentiment IN ('positive','negative','neutral') OR sentiment IS NULL),
  relevance_score         numeric(4,3) CHECK (relevance_score >= 0 AND relevance_score <= 1),
  og_relevance_pre        numeric(4,3),
  supply_chain_impact     text,
  keywords                text[] NOT NULL DEFAULT '{}',

  -- Operator associations
  operator_slugs          text[] NOT NULL DEFAULT '{}',

  -- Metadata
  scraped_at              timestamptz NOT NULL DEFAULT now(),
  processed_at            timestamptz,

  -- Errors
  error_message           text,
  retry_count             integer NOT NULL DEFAULT 0,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_articles_v2_url_hash UNIQUE (url_hash)
);

CREATE INDEX IF NOT EXISTS idx_av2_source_id       ON articles_v2(source_id);
CREATE INDEX IF NOT EXISTS idx_av2_status          ON articles_v2(status);
CREATE INDEX IF NOT EXISTS idx_av2_category        ON articles_v2(category);
CREATE INDEX IF NOT EXISTS idx_av2_relevance       ON articles_v2(relevance_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_av2_published_at    ON articles_v2(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_av2_operator_slugs  ON articles_v2 USING GIN(operator_slugs);
CREATE INDEX IF NOT EXISTS idx_av2_scraped_at      ON articles_v2(scraped_at DESC);

-- ── Sources v2 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sources_v2 (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      text NOT NULL,
  url                       text NOT NULL UNIQUE,
  source_type               text NOT NULL DEFAULT 'html'
                              CHECK (source_type IN ('rss','html','playwright')),
  source_category           text NOT NULL DEFAULT 'media'
                              CHECK (source_category IN ('media','operator','service_company',
                                                          'institutional','international')),
  selector                  text,
  article_link_selector     text,
  title_selector            text,
  date_selector             text,
  content_selector          text,
  requires_playwright       boolean NOT NULL DEFAULT false,
  priority                  integer NOT NULL DEFAULT 5 CHECK (priority BETWEEN 1 AND 10),
  scrape_interval_minutes   integer NOT NULL DEFAULT 60,
  is_active                 boolean NOT NULL DEFAULT true,
  last_scraped_at           timestamptz,
  last_error                text,
  error_count               integer NOT NULL DEFAULT 0,
  total_articles_scraped    integer NOT NULL DEFAULT 0,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sv2_is_active  ON sources_v2(is_active);
CREATE INDEX IF NOT EXISTS idx_sv2_priority   ON sources_v2(priority DESC);
CREATE INDEX IF NOT EXISTS idx_sv2_category   ON sources_v2(source_category);

-- ── Scrape logs v2 ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scrape_logs_v2 (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id             uuid NOT NULL,
  source_name           text NOT NULL DEFAULT '',
  status                text NOT NULL DEFAULT 'running',
  scrape_method         text,
  selector_used         text,
  articles_found        integer NOT NULL DEFAULT 0,
  articles_new          integer NOT NULL DEFAULT 0,
  articles_skipped      integer NOT NULL DEFAULT 0,
  articles_failed       integer NOT NULL DEFAULT 0,
  articles_irrelevant   integer NOT NULL DEFAULT 0,
  response_time_ms      integer,
  error_message         text,
  started_at            timestamptz NOT NULL DEFAULT now(),
  finished_at           timestamptz,
  duration_ms           integer
);

CREATE INDEX IF NOT EXISTS idx_sl2_source_id  ON scrape_logs_v2(source_id);
CREATE INDEX IF NOT EXISTS idx_sl2_started_at ON scrape_logs_v2(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sl2_status     ON scrape_logs_v2(status);

-- ── Operator Briefs ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS operator_briefs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_slug       text NOT NULL,
  operator_name       text NOT NULL,
  brief_date          date NOT NULL,
  content_md          text,
  article_count       integer NOT NULL DEFAULT 0,
  avg_relevance       numeric(4,3),
  dominant_sentiment  text CHECK (dominant_sentiment IN ('positive','negative','neutral') OR dominant_sentiment IS NULL),
  top_keywords        text[] DEFAULT '{}',
  risk_level          text CHECK (risk_level IN ('low','medium','high') OR risk_level IS NULL),
  impacts             jsonb DEFAULT '{}',
  top_article_ids     text[] DEFAULT '{}',
  generated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ob_operator_date ON operator_briefs(operator_slug, brief_date);
CREATE INDEX IF NOT EXISTS idx_ob_brief_date    ON operator_briefs(brief_date DESC);

-- Unique constraint: one brief per operator per day
DO $$ BEGIN
  ALTER TABLE operator_briefs ADD CONSTRAINT uq_operator_brief_daily
    UNIQUE (operator_slug, brief_date);
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- ── Seed: active sources ──────────────────────────────────────────────────────
INSERT INTO sources_v2 (name, url, source_type, source_category, priority, scrape_interval_minutes)
VALUES
  ('EconoJournal Energía',        'https://econojournal.com.ar/seccion/energia/',       'html', 'media',         10, 30),
  ('EconoJournal RSS',            'https://econojournal.com.ar/feed/',                  'rss',  'media',         10, 20),
  ('Energía Online',              'https://energiaonline.com.ar/',                       'html', 'media',         9,  30),
  ('Más Energía (LM Neuquén)',    'https://mase.lmneuquen.com',                         'html', 'media',         9,  30),
  ('Mejor Energía',               'https://mejorenergia.com.ar',                        'html', 'media',         8,  45),
  ('Diario Río Negro Energía',    'https://www.rionegro.com.ar/energia/',               'html', 'media',         8,  45),
  ('Ámbito Energía',              'https://www.ambito.com/contenidos/energia.html',     'html', 'media',         7,  45),
  ('El Cronista Energía',         'https://www.cronista.com/tema/energia/',             'html', 'media',         7,  60),
  ('Infobae Economía',            'https://www.infobae.com/economia/',                  'html', 'media',         6,  60),
  ('Guía Vaca Muerta',            'https://guiavacamuerta.com',                         'html', 'institutional', 9,  60),
  ('IAPG',                        'https://iapg.org.ar/novedades/',                     'html', 'institutional', 8,  120),
  ('Secretaría de Energía',       'https://www.argentina.gob.ar/economia/energia',      'html', 'institutional', 8,  120),
  ('Energía Argentina',           'https://www.energia-argentina.com.ar/',              'html', 'institutional', 7,  120),
  ('Gobierno Neuquén Energía',    'https://www.neuquen.gov.ar/energia/',                'html', 'institutional', 6,  180),
  ('IEA',                         'https://www.iea.org/news',                           'html', 'international', 7,  240),
  ('YPF Noticias',                'https://www.ypf.com/sala-de-prensa/',               'html', 'operator',      8,  120),
  ('Vista Energy News',           'https://www.vistaenergy.com/en/press-releases/',     'html', 'operator',      7,  180),
  ('Tecpetrol Noticias',          'https://www.tecpetrol.com/prensa/',                  'html', 'operator',      7,  180)
ON CONFLICT (url) DO NOTHING;
