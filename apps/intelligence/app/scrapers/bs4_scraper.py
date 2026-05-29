"""
BeautifulSoup-based HTML scraper.
Primary scraping method — fast, no browser overhead.
"""
from __future__ import annotations

import re
import time
from urllib.parse import urljoin, urlparse

import httpx
import structlog
from bs4 import BeautifulSoup
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.scrapers.base import ScrapedItem
from app.scrapers.source_registry import SourceConfig

log = structlog.get_logger(__name__)

HEADERS = {
    "User-Agent": "OBI-Intelligence/2.0 (Oil & Gas Argentina; contact@obi.energy)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
}

ARTICLE_URL_PATTERNS = [
    r"/\d{4}/\d{2}/",           # date-based: /2024/05/
    r"/(nota|noticia|articulo|article|news|post|novedad|blog)/",
    r"/prensa/\d",
    r"-(id|art|nota)-\d+",
]


def _looks_like_article(url: str, extra_patterns: list[str] | None = None) -> bool:
    patterns = ARTICLE_URL_PATTERNS + (extra_patterns or [])
    lower = url.lower()
    return any(re.search(p, lower) for p in patterns)


def _resolve_url(href: str, base_url: str) -> str | None:
    if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
        return None
    try:
        resolved = urljoin(base_url, href)
        parsed = urlparse(resolved)
        if parsed.scheme not in ("http", "https"):
            return None
        return resolved
    except Exception:
        return None


def _extract_date(el) -> str | None:
    if not el:
        return None
    dt = el.get("datetime") or el.get("content")
    if dt:
        return dt.strip()
    return el.get_text(strip=True) or None


def _is_same_domain(url: str, base_url: str) -> bool:
    try:
        base_host = urlparse(base_url).hostname or ""
        url_host = urlparse(url).hostname or ""
        return url_host == base_host or url_host.endswith("." + base_host)
    except Exception:
        return False


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectError)),
    reraise=True,
)
async def fetch_html(url: str, timeout: int = 25) -> tuple[str, int]:
    """Returns (html_content, response_time_ms)."""
    t0 = time.monotonic()
    async with httpx.AsyncClient(
        headers=HEADERS,
        timeout=httpx.Timeout(timeout),
        follow_redirects=True,
        max_redirects=5,
    ) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        elapsed = int((time.monotonic() - t0) * 1000)
        return resp.text, elapsed


def _html_is_empty(html: str) -> bool:
    """Detect if page content requires JS rendering."""
    if len(html) < 500:
        return True
    soup = BeautifulSoup(html, "lxml")
    text = soup.get_text(strip=True)
    return len(text) < 100


async def scrape_html(
    url: str,
    config: SourceConfig | None = None,
    timeout: int = 25,
) -> tuple[list[ScrapedItem], int]:
    """
    Scrape a news listing page.
    Returns (items, response_time_ms).
    Raises if fetch fails; caller decides whether to try Playwright.
    """
    html, resp_time = await fetch_html(url, timeout=timeout)

    if _html_is_empty(html):
        raise NeedsPlaywrightError(f"Page appears empty/JS-rendered: {url}")

    soup = BeautifulSoup(html, "lxml")
    items: list[ScrapedItem] = []
    seen_urls: set[str] = set()

    container_sel = config.container_selector if config else ""
    link_sel = (config.link_selector if config else "") or "a[href]"
    title_sel = (config.title_selector if config else "") or "h1, h2, h3"
    date_sel = (config.date_selector if config else "") or "time, .date"
    extra_patterns = config.article_url_patterns if config else []

    containers = soup.select(container_sel) if container_sel else []

    if containers:
        for container in containers:
            link_el = container.select_one(link_sel)
            if not link_el:
                link_el = container.find("a")
            if not link_el:
                continue

            href = link_el.get("href", "")
            abs_url = _resolve_url(href, url)
            if not abs_url or abs_url in seen_urls:
                continue
            if not _is_same_domain(abs_url, url) and not abs_url.startswith("http"):
                continue

            title_el = container.select_one(title_sel) or link_el
            title = title_el.get_text(strip=True) if title_el else ""
            if len(title) < 8:
                continue

            date_el = container.select_one(date_sel)
            published_at = _extract_date(date_el)

            content = " ".join(p.get_text(strip=True) for p in container.select("p") if p.get_text(strip=True))

            seen_urls.add(abs_url)
            items.append(ScrapedItem(
                url=abs_url,
                title=title,
                content=content,
                published_at=published_at,
                method="bs4",
                selector_used=container_sel,
                response_time_ms=resp_time,
            ))
    else:
        # Fallback: scan all links on the page
        for link_el in soup.find_all("a", href=True):
            href = link_el.get("href", "")
            abs_url = _resolve_url(href, url)
            if not abs_url or abs_url in seen_urls:
                continue
            if not _is_same_domain(abs_url, url):
                continue
            if not _looks_like_article(abs_url, extra_patterns):
                continue

            title = link_el.get_text(strip=True)
            if len(title) < 8:
                # Try parent element for title
                parent = link_el.parent
                if parent:
                    title = parent.get_text(strip=True)
            if len(title) < 8:
                continue

            seen_urls.add(abs_url)
            items.append(ScrapedItem(
                url=abs_url,
                title=title[:500],
                content="",
                published_at=None,
                method="bs4",
                selector_used="fallback-links",
                response_time_ms=resp_time,
            ))

    log.info("bs4_scrape_complete",
             url=url,
             items=len(items),
             method="container" if containers else "fallback",
             resp_ms=resp_time)
    return items, resp_time


class NeedsPlaywrightError(Exception):
    """Raised when BeautifulSoup detects a JS-rendered page."""
