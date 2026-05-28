-- ─── Migration 002: Articles ───────────────────────────────────────────────────
-- Artículos scrapeados con enrichment de IA

-- Enable pgvector extension for semantic search
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
  url_hash             text UNIQUE,                   -- MD5/SHA256 of URL for dedup
  title                text,
  content              text,
  summary              text,                          -- AI-generated summary
  published_at         timestamptz,
  scraped_at           timestamptz NOT NULL DEFAULT now(),
  processed_at         timestamptz,
  status               article_status NOT NULL DEFAULT 'pending',

  -- AI enrichment (populated by ai-pipeline worker)
  category             og_category,
  subcategory          text,
  sentiment            sentiment_type,
  relevance_score      numeric(3, 2)                 -- 0.00 to 1.00
                         CHECK (relevance_score >= 0 AND relevance_score <= 1),
  supply_chain_impact  text,
  keywords             text[] NOT NULL DEFAULT '{}',

  -- Semantic search (populated after AI enrichment)
  embedding            vector(1536),

  -- Error tracking
  error_message        text,
  retry_count          integer NOT NULL DEFAULT 0,

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER articles_updated_at
  BEFORE UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes for common query patterns
CREATE INDEX idx_articles_source_id ON articles(source_id);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_category ON articles(category);
CREATE INDEX idx_articles_published_at ON articles(published_at DESC NULLS LAST);
CREATE INDEX idx_articles_relevance_score ON articles(relevance_score DESC NULLS LAST);
CREATE INDEX idx_articles_url_hash ON articles(url_hash);
CREATE INDEX idx_articles_keywords ON articles USING GIN(keywords);

-- Vector index for semantic similarity search
CREATE INDEX idx_articles_embedding ON articles USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Full-text search index
CREATE INDEX idx_articles_fts ON articles
  USING GIN(to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(content, '')));

-- RLS
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "articles_read" ON articles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "articles_service_write" ON articles
  FOR ALL USING (auth.role() = 'service_role');

-- Helper: find similar articles by vector distance
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
  SELECT
    a.id, a.title, a.summary, a.url, a.published_at, a.relevance_score,
    1 - (a.embedding <=> query_embedding) AS similarity
  FROM articles a
  WHERE a.embedding IS NOT NULL
    AND 1 - (a.embedding <=> query_embedding) > match_threshold
    AND a.status = 'done'
  ORDER BY a.embedding <=> query_embedding
  LIMIT match_count;
$$;
