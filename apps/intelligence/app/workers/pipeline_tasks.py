"""
AI classification pipeline.
Flow: scraped → parsing → classified → completed
"""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timezone, timedelta

import structlog
from celery import shared_task
from sqlalchemy import select, update, func

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models.article import Article, ArticleStatus
from app.nlp.classifier import classify_article
from app.nlp.operator_detector import detect_operators

log = structlog.get_logger(__name__)
settings = get_settings()


def run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@shared_task(
    name="app.workers.pipeline_tasks.process_article",
    bind=True,
    queue="pipeline",
    max_retries=3,
    default_retry_delay=30,
    soft_time_limit=90,
    time_limit=120,
)
def process_article(self, url_hash: str):
    """Classify a single article with LLM."""
    return run_async(_process_article_async(self, url_hash))


@shared_task(
    name="app.workers.pipeline_tasks.retry_stuck_articles",
    queue="pipeline",
)
def retry_stuck_articles():
    """Re-enqueue articles stuck in 'parsing' state for > 10 minutes."""
    return run_async(_retry_stuck_async())


@shared_task(
    name="app.workers.pipeline_tasks.generate_all_operator_briefs",
    queue="briefs",
)
def generate_all_operator_briefs():
    from app.operators.brief_generator import generate_all_briefs
    return run_async(generate_all_briefs())


async def _process_article_async(task, url_hash: str) -> dict:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Article).where(Article.url_hash == url_hash)
        )
        article = result.scalar_one_or_none()

        if not article:
            return {"error": "article not found", "url_hash": url_hash}

        # Skip if already processed or irrelevant
        if article.status in (ArticleStatus.completed.value, ArticleStatus.irrelevant.value):
            return {"skipped": True, "status": article.status}

        # Mark as parsing
        article.status = ArticleStatus.parsing.value
        await db.commit()

    # Small delay to respect LLM rate limits
    # concurrency: 4 workers × 500ms = effectively 8 req/s max
    await asyncio.sleep(settings.ai_rate_limit_delay_ms / 1000)

    t0 = time.monotonic()

    try:
        # Re-read fresh (avoid stale data)
        async with AsyncSessionLocal() as db:
            article = await db.get(Article, article.id)

        title = article.title or article.url
        content = article.content or ""

        result = await classify_article(
            title=title,
            content=content,
            source_url=article.url,
            pre_filter_score=article.og_relevance_pre or 0.0,
        )

        elapsed = int((time.monotonic() - t0) * 1000)
        operators = detect_operators(title, content)

        async with AsyncSessionLocal() as db:
            art = await db.get(Article, article.id)
            if not art:
                return {"error": "article disappeared"}

            art.status = ArticleStatus.completed.value
            art.category = result.category
            art.subcategory = result.subcategory
            art.sentiment = result.sentiment
            art.relevance_score = result.relevance_score
            art.supply_chain_impact = result.supply_chain_impact
            art.keywords = result.keywords
            art.summary = result.summary
            art.operator_slugs = list(set((art.operator_slugs or []) + operators))
            art.processed_at = datetime.now(timezone.utc)
            art.pipeline_completed_at = datetime.now(timezone.utc)
            art.pipeline_duration_ms = elapsed
            art.error_message = None

            await db.commit()

        log.info("article_processed",
                 url_hash=url_hash,
                 category=result.category,
                 relevance=result.relevance_score,
                 model=result.model_used,
                 elapsed_ms=elapsed)
        return {
            "url_hash": url_hash,
            "category": result.category,
            "relevance": result.relevance_score,
            "elapsed_ms": elapsed,
        }

    except Exception as exc:
        msg = str(exc)
        log.error("pipeline_failed", url_hash=url_hash, error=msg)
        async with AsyncSessionLocal() as db:
            art = await db.get(Article, article.id)
            if art:
                art.status = ArticleStatus.failed.value
                art.error_message = msg[:500]
                art.retry_count = (art.retry_count or 0) + 1
                await db.commit()
        raise task.retry(exc=exc) from exc


async def _retry_stuck_async() -> dict:
    """Find articles in 'parsing' state for more than 10 minutes and re-enqueue."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Article)
            .where(Article.status == ArticleStatus.parsing.value)
            .where(Article.pipeline_started_at < cutoff)
            .limit(50)
        )
        stuck = result.scalars().all()

        for art in stuck:
            art.status = ArticleStatus.scraped.value
            art.error_message = "Retried: was stuck in parsing"

        await db.commit()

    for art in stuck:
        process_article.apply_async(args=[art.url_hash], queue="pipeline")

    if stuck:
        log.warning("retried_stuck_articles", count=len(stuck))
    return {"retried": len(stuck)}
