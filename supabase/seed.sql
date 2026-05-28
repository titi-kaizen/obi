-- ─── OGASCI: Seed — Fuentes O&G Argentina ─────────────────────────────────────
-- 25+ fuentes de noticias del sector Oil & Gas Argentina

INSERT INTO sources (name, url, type, category, scrape_interval_minutes, is_active) VALUES

-- ─── RSS Feeds ────────────────────────────────────────────────────────────────
('IAPG - Instituto Argentino del Petróleo y el Gas',
 'https://www.iapg.org.ar/feed/',
 'rss', 'upstream', 30, true),

('Energía On',
 'https://www.energiaon.com.ar/feed/',
 'rss', 'market', 30, true),

('Portal Energético',
 'https://portalenergetico.com.ar/feed/',
 'rss', 'supply_chain', 30, true),

('Petroquímica Argentina',
 'https://petroquimica.com.ar/feed/',
 'rss', 'downstream', 60, true),

('Oil Production',
 'https://www.oilproduction.net/feed/',
 'rss', 'upstream', 60, true),

('Más Energía',
 'https://masenergia.com.ar/feed/',
 'rss', 'market', 30, true),

('Télam - Energía',
 'https://www.telam.com.ar/rss/seccion/economia/',
 'rss', 'politics', 30, true),

('Infobae - Economía',
 'https://www.infobae.com/feeds/rss/economia/',
 'rss', 'market', 30, true),

('La Nación - Economía',
 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/categoria/economia/',
 'rss', 'market', 30, true),

('El Cronista - Energía',
 'https://www.cronista.com/rss/secciones/finanzas-y-mercados/',
 'rss', 'market', 30, true),

('Ámbito Financiero',
 'https://www.ambito.com/rss/pages/economia.xml',
 'rss', 'market', 30, true),

('Apertura - Energía',
 'https://www.apertura.com/rss/seccion/economia/',
 'rss', 'company', 60, true),

('Bloomberg Línea Argentina',
 'https://www.bloomberglinea.com/rss/argentina/',
 'rss', 'market', 30, true),

('Río Negro - Economía',
 'https://www.rionegro.com.ar/rss/seccion/economia/',
 'rss', 'upstream', 30, true),

('La Mañana de Neuquén',
 'https://www.lmneuquen.com/rss/seccion/economía-y-empresas/',
 'rss', 'upstream', 30, true),

('Perfil - Economía',
 'https://www.perfil.com/feed/economia',
 'rss', 'politics', 60, true),

-- ─── HTML Scraping ────────────────────────────────────────────────────────────
('Secretaría de Energía Argentina - Novedades',
 'https://www.argentina.gob.ar/energia/noticias',
 'html', 'regulation', 120, true),

('ENARGAS - Resoluciones',
 'https://www.enargas.gob.ar/secciones/resoluciones/index.php',
 'html', 'regulation', 240, true),

('YPF - Prensa',
 'https://www.ypf.com/sala-de-prensa/comunicados',
 'html', 'company', 120, true),

('Vista Energy - Press Releases',
 'https://www.vistaenergy.com/es/inversores/sala-de-prensa',
 'html', 'company', 240, true),

('Pampa Energía - Noticias',
 'https://www.pampaenergia.com/novedades',
 'html', 'company', 240, true),

('TGS - Transportadora Gas del Sur',
 'https://www.tgs.com.ar/es/prensa/comunicados',
 'html', 'midstream', 240, true),

('Pan American Energy - Noticias',
 'https://www.pae.com.ar/sala-de-prensa/',
 'html', 'company', 240, true),

('Tecpetrol - Noticias',
 'https://www.tecpetrol.com/es/noticias',
 'html', 'company', 240, true),

-- ─── Playwright (JS-heavy sites) ─────────────────────────────────────────────
('Vaca Muerta News',
 'https://vacamuertanews.com.ar',
 'playwright', 'upstream', 30, true),

('Argentina Mining - Energía',
 'https://www.argentinamining.com/tag/petroleo-gas/',
 'playwright', 'upstream', 120, true),

-- ─── Fuentes Prioritarias ─────────────────────────────────────────────────────
('Econojournal',
 'https://econojournal.com.ar/feed/',
 'rss', 'upstream', 30, true),

('Vaca Muerta AR',
 'https://vacamuerta.ar/feed/',
 'rss', 'upstream', 30, true),

('MASE - La Mañana de Neuquén',
 'https://mase.lmneuquen.com/feed/',
 'rss', 'upstream', 30, true),

('McKinsey - Oil & Gas Insights',
 'https://www.mckinsey.com/industries/oil-and-gas/our-insights',
 'playwright', 'market', 120, true),

('Minuto Neuquén - Energía',
 'https://www.minutoneuquen.com/energia/feed/',
 'rss', 'upstream', 30, true),

('Rystad Energy - News',
 'https://www.rystadenergy.com/news/',
 'playwright', 'market', 60, true);
