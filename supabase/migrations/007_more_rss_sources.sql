-- Migration 007: Add more RSS sources and fix missing feeds
-- RSS is more reliable than HTML scraping — prioritize RSS sources

INSERT INTO sources_v2 (name, url, source_type, source_category, priority, scrape_interval_minutes)
VALUES
  -- RSS feeds not included in migration 006
  ('Energía Online RSS',          'https://energiaonline.com.ar/feed/',            'rss', 'media',         9,  20),
  ('Río Negro Energía RSS',       'https://www.rionegro.com.ar/feed/',             'rss', 'media',         8,  30),
  ('Mejor Energía RSS',           'https://mejorenergia.com.ar/feed/',             'rss', 'media',         8,  30),
  ('Más Energía RSS',             'https://mase.lmneuquen.com/feed/',              'rss', 'media',         9,  20),
  ('Guía Vaca Muerta RSS',        'https://guiavacamuerta.com/feed/',              'rss', 'institutional', 9,  30),
  ('IAPG RSS',                    'https://iapg.org.ar/feed/',                     'rss', 'institutional', 8,  60),
  ('Infobae Energía RSS',         'https://www.infobae.com/feeds/rss/economia/',   'rss', 'media',         6,  60)
ON CONFLICT (url) DO NOTHING;
