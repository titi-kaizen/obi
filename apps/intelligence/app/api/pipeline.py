"""
Pipeline visibility endpoint — real-time status of the scraping/NLP pipeline.
Fixes: Problem #8 — no visibility into pipeline.
"""
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.article import Article, ArticleStatus
from app.models.scrape_log import ScrapeLog
from app.models.source import Source
from app.schemas.article import PipelineStatsOut, PipelineStageCount

router = APIRouter()


@router.get("/stats", response_model=PipelineStatsOut)
async def get_pipeline_stats(db: AsyncSession = Depends(get_db)):
    # Stage counts
    stage_counts = await db.execute(
        select(Article.status, func.count(Article.id).label("cnt"))
        .group_by(Article.status)
    )
    stages = PipelineStageCount()
    for status, cnt in stage_counts.fetchall():
        if hasattr(stages, status):
            setattr(stages, status, cnt)

    # Avg relevance
    avg_rel = (await db.execute(
        select(func.avg(Article.relevance_score))
        .where(Article.relevance_score.isnot(None))
    )).scalar() or 0.0

    # Avg pipeline duration
    avg_dur = (await db.execute(
        select(func.avg(Article.pipeline_duration_ms))
        .where(Article.pipeline_duration_ms.isnot(None))
    )).scalar() or 0.0

    # Articles today
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    arts_today = (await db.execute(
        select(func.count(Article.id)).where(Article.scraped_at >= today_start)
    )).scalar() or 0

    # Articles this week
    week_start = datetime.now(timezone.utc) - timedelta(days=7)
    arts_week = (await db.execute(
        select(func.count(Article.id)).where(Article.scraped_at >= week_start)
    )).scalar() or 0

    # Top categories
    top_cats_result = await db.execute(
        select(Article.category, func.count(Article.id).label("cnt"))
        .where(Article.category.isnot(None))
        .group_by(Article.category)
        .order_by(func.count(Article.id).desc())
        .limit(5)
    )
    top_categories = [{"category": row[0], "count": row[1]} for row in top_cats_result.fetchall()]

    # Top sources by article count
    top_sources_result = await db.execute(
        select(Article.source_name, func.count(Article.id).label("cnt"))
        .group_by(Article.source_name)
        .order_by(func.count(Article.id).desc())
        .limit(5)
    )
    top_sources = [{"source": row[0], "count": row[1]} for row in top_sources_result.fetchall()]

    return PipelineStatsOut(
        stages=stages,
        avg_relevance=round(float(avg_rel), 3),
        avg_pipeline_duration_ms=round(float(avg_dur), 1),
        articles_today=arts_today,
        articles_week=arts_week,
        top_categories=top_categories,
        top_sources=top_sources,
    )


@router.get("/scrape-logs", response_model=list[dict])
async def get_recent_scrape_logs(
    limit: int = Query(30, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ScrapeLog)
        .order_by(ScrapeLog.started_at.desc())
        .limit(limit)
    )
    logs = result.scalars().all()
    return [
        {
            "id": l.id,
            "source_name": l.source_name,
            "status": l.status,
            "scrape_method": l.scrape_method,
            "selector_used": l.selector_used,
            "articles_found": l.articles_found,
            "articles_new": l.articles_new,
            "articles_skipped": l.articles_skipped,
            "articles_irrelevant": l.articles_irrelevant,
            "response_time_ms": l.response_time_ms,
            "duration_ms": l.duration_ms,
            "error_message": l.error_message,
            "started_at": l.started_at.isoformat() if l.started_at else None,
            "finished_at": l.finished_at.isoformat() if l.finished_at else None,
        }
        for l in logs
    ]


@router.get("/stuck-articles")
async def get_stuck_articles(
    minutes: int = Query(10, ge=1, le=60),
    db: AsyncSession = Depends(get_db),
):
    """Show articles stuck in intermediate pipeline states."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    result = await db.execute(
        select(Article)
        .where(
            Article.status.in_(["parsing", "scraping"]),
            Article.pipeline_started_at < cutoff,
        )
        .limit(50)
    )
    stuck = result.scalars().all()
    return {
        "count": len(stuck),
        "articles": [
            {
                "id": a.id,
                "title": a.title,
                "status": a.status,
                "pipeline_started_at": a.pipeline_started_at.isoformat() if a.pipeline_started_at else None,
            }
            for a in stuck
        ],
    }


@router.post("/retry-stuck", status_code=202)
async def retry_stuck():
    from app.workers.pipeline_tasks import retry_stuck_articles
    task = retry_stuck_articles.apply_async(queue="pipeline")
    return {"message": "Retry task queued", "task_id": task.id}


@router.post("/process-pending", status_code=202)
async def process_pending(db: AsyncSession = Depends(get_db)):
    """Manually trigger processing for all scraped-but-unprocessed articles."""
    result = await db.execute(
        select(Article)
        .where(Article.status == ArticleStatus.scraped.value)
        .limit(200)
    )
    articles = result.scalars().all()

    from app.workers.pipeline_tasks import process_article
    for a in articles:
        process_article.apply_async(args=[a.url_hash], queue="pipeline")

    return {"message": f"Queued {len(articles)} articles for processing"}
