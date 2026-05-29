"""
Playwright scraper — only used when BeautifulSoup returns empty content.
Heavy: launches a browser. Use sparingly.
"""
from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path

import structlog

from app.scrapers.base import ScrapedItem
from app.scrapers.source_registry import SourceConfig

log = structlog.get_logger(__name__)


async def scrape_playwright(
    url: str,
    config: SourceConfig | None = None,
    timeout_ms: int = 20000,
    debug_screenshot: bool = False,
    screenshots_dir: str = "/tmp/obi_screenshots",
) -> tuple[list[ScrapedItem], int]:
    """
    Use Playwright to scrape JS-rendered pages.
    Returns (items, response_time_ms).
    """
    from playwright.async_api import async_playwright

    container_sel = (config.container_selector if config else "") or \
        "article, .article, .post, .news-item, [class*='article'], [class*='news']"
    title_sel = (config.title_selector if config else "") or "h1, h2, h3, [class*='title']"
    date_sel = (config.date_selector if config else "") or "time, [class*='date'], [datetime]"
    extra_patterns = config.article_url_patterns if config else []

    t0 = time.monotonic()
    items: list[ScrapedItem] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-web-security",
            ],
        )
        try:
            context = await browser.new_context(
                user_agent="OBI-Intelligence/2.0 (Oil & Gas Argentina)",
                locale="es-AR",
                extra_http_headers={"Accept-Language": "es-AR,es;q=0.9"},
                viewport={"width": 1280, "height": 800},
            )

            # Block heavy assets to speed up
            await context.route(
                "**/*.{png,jpg,jpeg,gif,webp,svg,woff,woff2,ttf,eot,mp4,mp3,avi,mov}",
                lambda route: route.abort(),
            )

            page = await context.new_page()
            page.set_default_timeout(timeout_ms)

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            except Exception as e:
                log.warning("playwright_goto_failed", url=url, error=str(e))
                raise

            # Wait for article containers to appear
            try:
                await page.wait_for_selector(container_sel, timeout=8000)
            except Exception:
                log.debug("playwright_container_not_found", selector=container_sel, url=url)

            # Optional screenshot for debugging
            if debug_screenshot:
                Path(screenshots_dir).mkdir(parents=True, exist_ok=True)
                safe_name = url.replace("://", "_").replace("/", "_")[:80]
                screenshot_path = f"{screenshots_dir}/{safe_name}.png"
                await page.screenshot(path=screenshot_path, full_page=False)
                log.debug("playwright_screenshot", path=screenshot_path)

            # Extract articles via page.evaluate
            raw_items = await page.evaluate(
                """([containerSel, titleSel, dateSel]) => {
                    const results = [];
                    const baseUrl = window.location.origin;
                    const seen = new Set();

                    document.querySelectorAll(containerSel).forEach(container => {
                        const link = container.querySelector('a[href]');
                        if (!link) return;

                        let href = link.getAttribute('href') || '';
                        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
                        if (!href.startsWith('http')) {
                            href = href.startsWith('/') ? baseUrl + href : baseUrl + '/' + href;
                        }
                        if (seen.has(href)) return;
                        seen.add(href);

                        const titleEl = container.querySelector(titleSel) || link;
                        const title = titleEl?.textContent?.trim() || '';
                        if (title.length < 8) return;

                        const dateEl = container.querySelector(dateSel);
                        const published_at = dateEl?.getAttribute('datetime') || dateEl?.textContent?.trim() || null;

                        const paras = Array.from(container.querySelectorAll('p'))
                            .map(p => p.textContent?.trim())
                            .filter(Boolean)
                            .join(' ');

                        results.push({ url: href, title, content: paras, published_at });
                    });

                    return results;
                }""",
                [container_sel, title_sel, date_sel],
            )

            elapsed = int((time.monotonic() - t0) * 1000)

            for item in raw_items:
                if item.get("title") and item.get("url"):
                    items.append(ScrapedItem(
                        url=item["url"],
                        title=item["title"][:500],
                        content=item.get("content", ""),
                        published_at=item.get("published_at"),
                        method="playwright",
                        selector_used=container_sel,
                        response_time_ms=elapsed,
                    ))

            log.info("playwright_scrape_complete",
                     url=url,
                     items=len(items),
                     elapsed_ms=elapsed)
            return items, elapsed

        finally:
            await browser.close()
