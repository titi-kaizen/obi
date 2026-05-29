"""RSS feed scraper — fastest and most reliable when feeds are available."""
from __future__ import annotations

import time

import feedparser
import httpx
import structlog

from app.scrapers.base import ScrapedItem

log = structlog.get_logger(__name__)

HEADERS = {
    "User-Agent": "OBI-Intelligence/2.0 (Oil & Gas Argentina; contact@obi.energy)",
    "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
}


async def scrape_rss(feed_url: str, timeout: int = 15) -> tuple[list[ScrapedItem], int]:
    """
    Parse an RSS/Atom feed.
    Returns (items, response_time_ms).
    """
    t0 = time.monotonic()

    async with httpx.AsyncClient(headers=HEADERS, timeout=timeout, follow_redirects=True) as client:
        resp = await client.get(feed_url)
        resp.raise_for_status()
        raw = resp.text
        elapsed = int((time.monotonic() - t0) * 1000)

    feed = feedparser.parse(raw)

    if feed.bozo and not feed.entries:
        raise ValueError(f"RSS parse error for {feed_url}: {feed.bozo_exception}")

    items: list[ScrapedItem] = []
    for entry in feed.entries:
        link = entry.get("link") or entry.get("id")
        if not link:
            continue

        title = entry.get("title", "").strip()
        if not title:
            continue

        content = (
            entry.get("summary")
            or entry.get("content", [{}])[0].get("value", "")
            or ""
        )
        # Strip HTML tags from RSS content
        import re
        content = re.sub(r"<[^>]+>", " ", content)
        content = re.sub(r"\s+", " ", content).strip()

        published = entry.get("published") or entry.get("updated") or None

        items.append(ScrapedItem(
            url=link,
            title=title,
            content=content[:3000],
            published_at=published,
            method="rss",
            selector_used="rss-feed",
            response_time_ms=elapsed,
        ))

    log.info("rss_scrape_complete", url=feed_url, items=len(items), elapsed_ms=elapsed)
    return items, elapsed
