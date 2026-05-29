"""
Scraping pipeline tasks.
Flow: queued → scraping → scraped → (enqueue pipeline)
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone

import structlog
from celery import shared_task
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models.article import Article, ArticleStatus
from app.models.scrape_log import ScrapeLog
from app.models.source import Source
from app.nlp.normalizer import deduplicate_url, deduplicate_title, normalize_title, normalize_content
from app.nlp.relevance_engine import score_article, is_priority_source
from app.nlp.operator_detector import detect_operators
from app.scrapers import (
    ScrapedItem, scrape_html, scrape_playwright, scrape_rss,
    NeedsPlaywrightError, get_source_config,
)

log = structlog.get_logger(__name__)
settings = get_settings()


def run_async(coro):
    """Run async coroutine from synchronous Celery task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@shared_task(
    name="app.workers.scrape_tasks.scrape_source",
    bind=True,
    queue="scrape",
    max_retries=3,
    default_retry_delay=60,
)
def scrape_source(self, source_id: str):
    """Scrape a single source and enqueue pipeline tasks for new articles."""
    return run_async(_scrape_source_async(self, source_id))


@shared_task(
    name="app.workers.scrape_tasks.scrape_all_sources",
    queue="scrape",
)
def scrape_all_sources(priority_only: bool = False):
    """Schedule scraping for all active sources."""
    return run_async(_scrape_all_sources_async(priority_only))


async def _scrape_all_sources_async(priority_only: bool) -> dict:
    async with AsyncSessionLocal() as db:
        q = select(Source).where(Source.is_active == True)
        if priority_only:
            q = q.where(Source.priority >= 7)
        result = await db.execute(q.order_by(Source.priority.desc()))
        sources = result.scalars().all()

    dispatched = 0
    for source in sources:
        scrape_source.apply_async(args=[source.id], queue="scrape")
        dispatched += 1

    log.info("scrape_all_dispatched", dispatched=dispatched, priority_only=priority_only)
    return {"dispatched": dispatched}


async def _scrape_source_async(task, source_id: str) -> dict:
    async with AsyncSessionLocal() as db:
        source = await db.get(Source, source_id)
        if not source:
            log.error("source_not_found", source_id=source_id)
            return {"error": "source not found"}

    log_entry = await _create_scrape_log(source)
    t0 = time.monotonic()

    try:
        items, resp_time = await _do_scrape(source)
    except Exception as exc:
        elapsed = int((time.monotonic() - t0) * 1000)
        msg = str(exc)
        log.error("scrape_failed", source=source.name, error=msg)
        await _update_scrape_log(log_entry.id, "failed", error=msg, duration_ms=elapsed)
        await _update_source_error(source_id, msg)
        raise task.retry(exc=exc) from exc

    # Deduplicate and store
    stats = await _process_scraped_items(items, source)
    elapsed = int((time.monotonic() - t0) * 1000)

    await _update_scrape_log(
        log_entry.id, "success",
        articles_found=len(items),
        articles_new=stats["new"],
        articles_skipped=stats["skipped"],
        articles_irrelevant=stats["irrelevant"],
        scrape_method=stats.get("method", "bs4"),
        selector_used=stats.get("selector", ""),
        response_time_ms=stats.get("resp_ms", 0),
        duration_ms=elapsed,
    )
    await _update_source_success(source_id)

    log.info("scrape_complete",
             source=source.name,
             found=len(items),
             new=stats["new"],
             skipped=stats["skipped"],
             irrelevant=stats["irrelevant"],
             elapsed_ms=elapsed)
    return stats


async def _do_scrape(source: Source) -> tuple[list[ScrapedItem], int]:
    """Select and run the appropriate scraper."""
    config = get_source_config(source.url)

    if source.source_type == "rss" and config and config.rss_url:
        return await scrape_rss(config.rss_url, timeout=settings.scrape_timeout_seconds)

    if source.source_type == "playwright" or (config and config.requires_playwright):
        return await scrape_playwright(
            source.url,
            config=config,
            timeout_ms=settings.playwright_timeout_ms,
            debug_screenshot=settings.enable_debug_screenshots,
            screenshots_dir=settings.screenshots_dir,
        )

    # Default: BeautifulSoup first, fallback to Playwright
    try:
        return await scrape_html(source.url, config=config, timeout=settings.scrape_timeout_seconds)
    except NeedsPlaywrightError:
        if settings.enable_playwright:
            log.info("fallback_to_playwright", url=source.url)
            return await scrape_playwright(
                source.url,
                config=config,
                timeout_ms=settings.playwright_timeout_ms,
                debug_screenshot=settings.enable_debug_screenshots,
            )
        raise


async def _process_scraped_items(items: list[ScrapedItem], source: Source) -> dict:
    if not items:
        return {"new": 0, "skipped": 0, "irrelevant": 0}

    stats = {"new": 0, "skipped": 0, "irrelevant": 0,
             "method": items[0].method if items else "bs4",
             "selector": items[0].selector_used if items else "",
             "resp_ms": items[0].response_time_ms if items else 0}

    # Build hashes for batch dedup check
    url_hashes = [deduplicate_url(i.url) for i in items]

    async with AsyncSessionLocal() as db:
        existing = await db.execute(
            select(Article.url_hash).where(Article.url_hash.in_(url_hashes))
        )
        existing_hashes = {row[0] for row in existing.fetchall()}

    to_insert: list[dict] = []
    seen_in_batch: set[str] = set(existing_hashes)

    for item, url_hash in zip(items, url_hashes):
        if url_hash in seen_in_batch:
            stats["skipped"] += 1
            continue
        seen_in_batch.add(url_hash)

        # Pre-filter: fast O&G relevance check
        priority = is_priority_source(source.url)
        relevance = score_article(item.title, item.content, source_is_priority=priority)

        if relevance.score < settings.min_og_relevance_to_store:
            stats["irrelevant"] += 1
            log.debug("article_filtered",
                      title=item.title[:60],
                      score=relevance.score,
                      penalties=relevance.penalty_terms)
            continue

        title = normalize_title(item.title)
        content = normalize_content(item.content)
        operators = detect_operators(title, content)

        status = ArticleStatus.scraped.value
        if relevance.score < settings.min_og_relevance_for_llm:
            status = ArticleStatus.irrelevant.value
            stats["irrelevant"] += 1
        else:
            stats["new"] += 1

        to_insert.append({
            "source_id": source.id,
            "source_name": source.name,
            "url": item.url,
            "url_hash": url_hash,
            "title": title,
            "content": content,
            "published_at": _parse_date(item.published_at),
            "status": status,
            "scrape_method": item.method,
            "scrape_selector": item.selector_used,
            "og_relevance_pre": relevance.score,
            "operator_slugs": operators,
            "pipeline_started_at": datetime.now(timezone.utc),
        })

    if to_insert:
        async with AsyncSessionLocal() as db:
            # Batch insert with conflict ignore
            for row in to_insert:
                article = Article(**row)
                db.add(article)
            try:
                await db.commit()
                # Enqueue pipeline tasks for new articles
                inserted_ids = [row for row in to_insert if row["status"] == ArticleStatus.scraped.value]
                _enqueue_pipeline_tasks(inserted_ids)
            except Exception as e:
                await db.rollback()
                log.error("batch_insert_failed", error=str(e))

    return stats


def _enqueue_pipeline_tasks(article_rows: list[dict]):
    from app.workers.pipeline_tasks import process_article
    for row in article_rows:
        process_article.apply_async(
            args=[row.get("url_hash", "")],
            queue="pipeline",
        )


def _parse_date(raw: str | None) -> datetime | None:
    if not raw:
        return None
    from dateutil import parser as dateutil_parser
    try:
        return dateutil_parser.parse(raw, fuzzy=True)
    except Exception:
        return None


async def _create_scrape_log(source: Source) -> ScrapeLog:
    async with AsyncSessionLocal() as db:
        entry = ScrapeLog(
            source_id=source.id,
            source_name=source.name,
            status="running",
        )
        db.add(entry)
        await db.commit()
        await db.refresh(entry)
        return entry


async def _update_scrape_log(log_id: str, status: str, **kwargs):
    async with AsyncSessionLocal() as db:
        log_entry = await db.get(ScrapeLog, log_id)
        if not log_entry:
            return
        log_entry.status = status
        log_entry.finished_at = datetime.now(timezone.utc)
        for k, v in kwargs.items():
            if hasattr(log_entry, k):
                setattr(log_entry, k, v)
        await db.commit()


async def _update_source_error(source_id: str, msg: str):
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(Source)
            .where(Source.id == source_id)
            .values(last_error=msg[:500], error_count=Source.error_count + 1)
        )
        await db.commit()


async def _update_source_success(source_id: str):
    async with AsyncSessionLocal() as db:
        await db.execute(
            update(Source)
            .where(Source.id == source_id)
            .values(
                last_scraped_at=datetime.now(timezone.utc),
                last_error=None,
                error_count=0,
            )
        )
        await db.commit()
