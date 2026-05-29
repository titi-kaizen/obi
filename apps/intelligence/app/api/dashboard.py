from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.article import Article, ArticleStatus

router = APIRouter()


@router.get("/kpis")
async def get_kpis(db: AsyncSession = Depends(get_db)):
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)

    arts_today = (await db.execute(
        select(func.count(Article.id)).where(Article.scraped_at >= today)
    )).scalar() or 0

    arts_week = (await db.execute(
        select(func.count(Article.id)).where(Article.scraped_at >= week_ago)
    )).scalar() or 0

    avg_rel = (await db.execute(
        select(func.avg(Article.relevance_score))
        .where(
            Article.relevance_score.isnot(None),
            Article.status == ArticleStatus.completed.value,
            Article.scraped_at >= week_ago,
        )
    )).scalar() or 0.0

    top_cat_row = (await db.execute(
        select(Article.category, func.count(Article.id).label("cnt"))
        .where(Article.category.isnot(None), Article.scraped_at >= week_ago)
        .group_by(Article.category)
        .order_by(func.count(Article.id).desc())
        .limit(1)
    )).first()

    pending_count = (await db.execute(
        select(func.count(Article.id))
        .where(Article.status.in_(["queued", "scraped", "parsing"]))
    )).scalar() or 0

    failed_count = (await db.execute(
        select(func.count(Article.id))
        .where(
            Article.status == ArticleStatus.failed.value,
            Article.scraped_at >= week_ago,
        )
    )).scalar() or 0

    return {
        "articles_today": arts_today,
        "articles_week": arts_week,
        "avg_relevance_score": round(float(avg_rel), 3),
        "top_category": top_cat_row[0] if top_cat_row else None,
        "pending_count": pending_count,
        "failed_count": failed_count,
    }


@router.get("/trends")
async def get_trends(days: int = 7, db: AsyncSession = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(
            func.date_trunc("day", Article.scraped_at).label("day"),
            func.count(Article.id).label("count"),
            func.avg(Article.relevance_score).label("avg_relevance"),
        )
        .where(Article.scraped_at >= since)
        .group_by(func.date_trunc("day", Article.scraped_at))
        .order_by(func.date_trunc("day", Article.scraped_at))
    )

    return [
        {
            "date": row.day.date().isoformat() if row.day else None,
            "count": row.count,
            "avg_relevance": round(float(row.avg_relevance), 3) if row.avg_relevance else 0.0,
        }
        for row in result.fetchall()
    ]
