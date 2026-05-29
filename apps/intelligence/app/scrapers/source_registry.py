"""
Per-source scraping configurations.
Each entry defines CSS selectors and method for a specific news source.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class SourceConfig:
    name: str
    url: str
    source_type: str = "html"          # html | rss | playwright
    source_category: str = "media"     # media | operator | service_company | institutional | international
    priority: int = 5                  # 1–10
    scrape_interval_minutes: int = 60

    # CSS selectors
    container_selector: str = ""
    link_selector: str = "a[href]"
    title_selector: str = "h1, h2, h3"
    date_selector: str = "time, .date, .published, [datetime]"
    content_selector: str = "p"

    # RSS feed URL (if source_type == "rss")
    rss_url: str = ""

    # Extra
    requires_playwright: bool = False
    article_url_patterns: list[str] = field(default_factory=list)


SOURCE_REGISTRY: list[SourceConfig] = [

    # ── MEDIOS (prioridad alta) ──────────────────────────────────────────────

    SourceConfig(
        name="EconoJournal Energía",
        url="https://econojournal.com.ar/seccion/energia/",
        source_category="media",
        priority=10,
        scrape_interval_minutes=30,
        container_selector="article, .post-item, .news-item, .td-module-thumb",
        link_selector="a[href]",
        title_selector="h3, h2, .entry-title, .td-module-title",
        date_selector="time, .td-post-date, .entry-date",
        article_url_patterns=[r"/\d{4}/\d{2}/"],
    ),
    SourceConfig(
        name="Energía Online",
        url="https://energiaonline.com.ar/",
        source_category="media",
        priority=9,
        scrape_interval_minutes=30,
        container_selector="article, .item-list article, .views-row",
        link_selector="a[href]",
        title_selector="h2, h3, .field-content",
        date_selector="time, .date-display-single",
        article_url_patterns=[r"/nota/", r"/noticias/"],
    ),
    SourceConfig(
        name="Más Energía (LM Neuquén)",
        url="https://mase.lmneuquen.com",
        source_category="media",
        priority=9,
        scrape_interval_minutes=30,
        container_selector="article, .node-article, .views-row",
        link_selector="a[href]",
        title_selector="h2, h3, .field-name-title",
        date_selector="time, .date-display-single",
        article_url_patterns=[r"/nota/", r"/\d{4}/\d{2}/"],
    ),
    SourceConfig(
        name="Mejor Energía",
        url="https://mejorenergia.com.ar",
        source_category="media",
        priority=8,
        scrape_interval_minutes=45,
        container_selector="article, .post, .entry",
        link_selector="a[href]",
        title_selector="h2, h3, .entry-title",
        date_selector="time, .entry-date, .post-date",
        article_url_patterns=[r"/\d{4}/\d{2}/"],
    ),
    SourceConfig(
        name="Diario Río Negro (Energía)",
        url="https://www.rionegro.com.ar/energia/",
        source_category="media",
        priority=8,
        scrape_interval_minutes=45,
        container_selector=".article-card, article, .news-card",
        link_selector="a[href]",
        title_selector="h2, h3, .article-title",
        date_selector="time, .article-date",
        article_url_patterns=[r"/energia/", r"/\d{4}/\d{2}/"],
    ),
    SourceConfig(
        name="Ámbito Energía",
        url="https://www.ambito.com/contenidos/energia.html",
        source_category="media",
        priority=7,
        scrape_interval_minutes=45,
        container_selector=".article__box, article, .news-item",
        link_selector="a[href]",
        title_selector="h2, h3, .article__title",
        date_selector="time, .article__date",
        article_url_patterns=[r"/energia/", r"/\d{4}/\d{2}/"],
    ),
    SourceConfig(
        name="El Cronista Energía",
        url="https://www.cronista.com/tema/energia/",
        source_category="media",
        priority=7,
        scrape_interval_minutes=60,
        container_selector="article, .news-item, .post-item",
        link_selector="a[href]",
        title_selector="h2, h3",
        date_selector="time, .date",
        article_url_patterns=[r"/finanzasmercados/", r"/negocios/"],
    ),
    SourceConfig(
        name="Infobae Economía",
        url="https://www.infobae.com/economia/",
        source_category="media",
        priority=6,
        scrape_interval_minutes=60,
        container_selector="article, .article-card, [data-type='article']",
        link_selector="a[href]",
        title_selector="h2, h3, [class*='title']",
        date_selector="time, [class*='date']",
        requires_playwright=False,
        article_url_patterns=[r"/economia/", r"/energia/"],
    ),

    # ── RSS FEEDS (más confiable cuando disponible) ──────────────────────────
    SourceConfig(
        name="EconoJournal RSS",
        url="https://econojournal.com.ar/seccion/energia/",
        source_type="rss",
        source_category="media",
        priority=10,
        scrape_interval_minutes=20,
        rss_url="https://econojournal.com.ar/feed/",
    ),
    SourceConfig(
        name="Energía Online RSS",
        url="https://energiaonline.com.ar/",
        source_type="rss",
        source_category="media",
        priority=9,
        scrape_interval_minutes=20,
        rss_url="https://energiaonline.com.ar/feed/",
    ),
    SourceConfig(
        name="Río Negro RSS",
        url="https://www.rionegro.com.ar",
        source_type="rss",
        source_category="media",
        priority=7,
        scrape_interval_minutes=30,
        rss_url="https://www.rionegro.com.ar/feed/",
    ),

    # ── INSTITUCIONAL ────────────────────────────────────────────────────────
    SourceConfig(
        name="Guía Vaca Muerta",
        url="https://guiavacamuerta.com",
        source_category="institutional",
        priority=9,
        scrape_interval_minutes=60,
        container_selector="article, .post, .entry, .news-card",
        link_selector="a[href]",
        title_selector="h2, h3, .entry-title",
        date_selector="time, .entry-date",
        article_url_patterns=[r"/\d{4}/\d{2}/", r"/noticias/"],
    ),
    SourceConfig(
        name="IAPG",
        url="https://iapg.org.ar/novedades/",
        source_category="institutional",
        priority=8,
        scrape_interval_minutes=120,
        container_selector="article, .post, .novedad",
        link_selector="a[href]",
        title_selector="h2, h3",
        date_selector="time, .date",
        article_url_patterns=[r"/novedades/", r"/noticias/"],
    ),
    SourceConfig(
        name="Secretaría de Energía",
        url="https://www.argentina.gob.ar/economia/energia/noticias",
        source_category="institutional",
        priority=8,
        scrape_interval_minutes=120,
        container_selector=".news-item, article, .card",
        link_selector="a[href]",
        title_selector="h2, h3, .title",
        date_selector="time, .date",
        article_url_patterns=[r"/economia/energia/"],
    ),
    SourceConfig(
        name="Energía Argentina",
        url="https://www.energia-argentina.com.ar/",
        source_category="institutional",
        priority=7,
        scrape_interval_minutes=120,
        container_selector="article, .post, .entry",
        link_selector="a[href]",
        title_selector="h2, h3",
        date_selector="time, .date",
    ),
    SourceConfig(
        name="Gobierno Neuquén",
        url="https://www.neuquen.gov.ar/energia/",
        source_category="institutional",
        priority=6,
        scrape_interval_minutes=180,
        container_selector="article, .news, .nota",
        link_selector="a[href]",
        title_selector="h2, h3",
        date_selector="time, .date",
    ),

    # ── INTERNACIONALES ──────────────────────────────────────────────────────
    SourceConfig(
        name="IEA",
        url="https://www.iea.org/news",
        source_category="international",
        priority=7,
        scrape_interval_minutes=240,
        container_selector=".m-article-card, article, .news-item",
        link_selector="a[href]",
        title_selector="h2, h3, .m-article-card__title",
        date_selector="time, .m-article-card__date",
        article_url_patterns=[r"/news/", r"/reports/"],
    ),

    # ── OPERADORAS (press releases / newsroom) ───────────────────────────────
    SourceConfig(
        name="YPF Noticias",
        url="https://www.ypf.com/sala-de-prensa/",
        source_category="operator",
        priority=8,
        scrape_interval_minutes=120,
        container_selector="article, .news-item, .press-release",
        link_selector="a[href]",
        title_selector="h2, h3, .title",
        date_selector="time, .date",
    ),
    SourceConfig(
        name="Vista Energy News",
        url="https://www.vistaenergy.com/en/press-releases/",
        source_category="operator",
        priority=7,
        scrape_interval_minutes=180,
        container_selector=".press-release-item, article",
        link_selector="a[href]",
        title_selector="h2, h3",
        date_selector="time, .date",
    ),
    SourceConfig(
        name="Tecpetrol Noticias",
        url="https://www.tecpetrol.com/prensa/",
        source_category="operator",
        priority=7,
        scrape_interval_minutes=180,
        container_selector="article, .news-card",
        link_selector="a[href]",
        title_selector="h2, h3",
        date_selector="time, .date",
    ),
]


def get_source_config(url: str) -> SourceConfig | None:
    for cfg in SOURCE_REGISTRY:
        if cfg.url.rstrip("/") == url.rstrip("/"):
            return cfg
    return None


def get_all_active_sources() -> list[SourceConfig]:
    return list(SOURCE_REGISTRY)
