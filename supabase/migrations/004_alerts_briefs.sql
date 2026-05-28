-- ─── Migration 004: Alert Rules, Alert Events & Executive Briefs ───────────────

-- ─── Alert Rules ──────────────────────────────────────────────────────────────

CREATE TABLE alert_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL,     -- references auth.users(id)
  name              text NOT NULL,
  description       text,
  -- conditions: { keywords, categories, entity_names, signal_types, min_relevance }
  conditions        jsonb NOT NULL DEFAULT '{}',
  -- channels: { email, slack, webhook_url }
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

-- RLS: each user only sees their own rules; admins see all
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "alert_rules_own" ON alert_rules
  FOR ALL USING (
    auth.uid() = user_id
    OR (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin'
  );

-- ─── Alert Events ─────────────────────────────────────────────────────────────

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

CREATE POLICY "alert_events_own" ON alert_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM alert_rules r
      WHERE r.id = alert_events.rule_id
        AND (r.user_id = auth.uid() OR (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' = 'admin')
    )
  );

CREATE POLICY "alert_events_service_write" ON alert_events
  FOR ALL USING (auth.role() = 'service_role');

-- ─── Executive Briefs ─────────────────────────────────────────────────────────

CREATE TABLE executive_briefs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date              date NOT NULL UNIQUE,
  content           text NOT NULL,          -- Markdown
  content_html      text,                   -- HTML rendered version
  model_used        text NOT NULL DEFAULT 'claude-sonnet-4-6',
  articles_analyzed integer NOT NULL DEFAULT 0,
  -- [{ name, type, count }]
  top_entities      jsonb NOT NULL DEFAULT '[]',
  -- [{ id, title, severity, type }]
  key_signals       jsonb NOT NULL DEFAULT '[]',
  generated_at      timestamptz NOT NULL DEFAULT now(),
  generated_by      uuid                    -- null = automatic, uuid = user who triggered
);

CREATE INDEX idx_executive_briefs_date ON executive_briefs(date DESC);

ALTER TABLE executive_briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "briefs_read" ON executive_briefs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "briefs_analyst_generate" ON executive_briefs
  FOR ALL USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'analyst')
    OR auth.role() = 'service_role'
  );

-- ─── Scrape Logs ──────────────────────────────────────────────────────────────

CREATE TABLE scrape_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id     uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  articles_found    integer NOT NULL DEFAULT 0,
  articles_new      integer NOT NULL DEFAULT 0,
  articles_skipped  integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
  error_message text
);

CREATE INDEX idx_scrape_logs_source_id ON scrape_logs(source_id);
CREATE INDEX idx_scrape_logs_started_at ON scrape_logs(started_at DESC);

ALTER TABLE scrape_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scrape_logs_admin" ON scrape_logs
  FOR ALL USING (
    (auth.jwt() ->> 'app_metadata')::jsonb ->> 'role' IN ('admin', 'analyst')
    OR auth.role() = 'service_role'
  );
