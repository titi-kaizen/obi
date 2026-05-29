from datetime import date, datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.article import Article, ArticleStatus
from app.models.operator_brief import OperatorBrief
from app.operators.registry import list_operators, get_operator
from app.schemas.operator import OperatorOut, OperatorBriefOut, OperatorStatsOut

router = APIRouter()


@router.get("", response_model=list[OperatorOut])
async def list_operators_endpoint():
    return [
        OperatorOut(
            slug=op.slug, name=op.name, category=op.category,
            country=op.country, website=op.website, description=op.description,
        )
        for op in list_operators()
    ]


@router.get("/{slug}/stats", response_model=OperatorStatsOut)
async def get_operator_stats(
    slug: str,
    days: int = Query(7, ge=1, le=30),
    db: AsyncSession = Depends(get_db),
):
    operator = get_operator(slug)
    if not operator:
        raise HTTPException(404, "Operator not found")

    since = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(Article)
        .where(
            and_(
                Article.status == ArticleStatus.completed.value,
                Article.operator_slugs.any(slug),  # type: ignore
                Article.scraped_at >= since,
            )
        )
        .order_by(Article.relevance_score.desc().nullslast())
        .limit(50)
    )
    articles = result.scalars().all()

    scores = [a.relevance_score for a in articles if a.relevance_score]
    avg = sum(scores) / len(scores) if scores else None

    from collections import Counter
    sentiments = Counter(a.sentiment for a in articles if a.sentiment)
    dom_sentiment = sentiments.most_common(1)[0][0] if sentiments else None

    all_kws: list[str] = []
    for a in articles:
        all_kws.extend(a.keywords or [])
    top_kws = [kw for kw, _ in Counter(all_kws).most_common(10)]

    recent = [
        {"id": a.id, "title": a.title, "relevance_score": a.relevance_score, "url": a.url}
        for a in articles[:5]
    ]

    return OperatorStatsOut(
        slug=slug,
        name=operator.name,
        article_count=len(articles),
        avg_relevance=round(avg, 3) if avg else None,
        dominant_sentiment=dom_sentiment,
        top_keywords=top_kws,
        recent_articles=recent,
    )


@router.get("/{slug}/brief", response_model=OperatorBriefOut)
async def get_operator_brief(
    slug: str,
    target_date: date | None = None,
    db: AsyncSession = Depends(get_db),
):
    if target_date is None:
        target_date = datetime.now(timezone.utc).date()

    result = await db.execute(
        select(OperatorBrief).where(
            and_(
                OperatorBrief.operator_slug == slug,
                OperatorBrief.brief_date == target_date,
            )
        )
    )
    brief = result.scalar_one_or_none()
    if not brief:
        raise HTTPException(404, f"No brief found for {slug} on {target_date}")

    return OperatorBriefOut.model_validate(brief)


@router.post("/{slug}/brief/generate", status_code=202)
async def generate_brief(
    slug: str,
    target_date: date | None = None,
):
    operator = get_operator(slug)
    if not operator:
        raise HTTPException(404, "Operator not found")

    from app.workers.pipeline_tasks import generate_all_operator_briefs
    # For single operator we call the async function directly via a task
    from app.operators.brief_generator import generate_operator_brief
    import asyncio

    async def _gen():
        return await generate_operator_brief(slug, target_date)

    loop = asyncio.get_event_loop()
    loop.create_task(_gen())

    return {"message": f"Brief generation started for {operator.name}"}
