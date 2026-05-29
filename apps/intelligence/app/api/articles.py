from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.article import Article, ArticleStatus
from app.schemas.article import ArticleOut, ArticleListOut

router = APIRouter()


@router.get("", response_model=ArticleListOut)
async def list_articles(
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    status: str | None = None,
    category: str | None = None,
    operator: str | None = None,
    min_relevance: float = Query(0.0, ge=0.0, le=1.0),
    source_id: str | None = None,
    search: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(Article)

    if status:
        q = q.where(Article.status == status)
    else:
        # Default: exclude irrelevant
        q = q.where(Article.status != ArticleStatus.irrelevant.value)

    if category:
        q = q.where(Article.category == category)
    if operator:
        q = q.where(Article.operator_slugs.any(operator))  # type: ignore
    if min_relevance > 0:
        q = q.where(Article.relevance_score >= min_relevance)
    if source_id:
        q = q.where(Article.source_id == source_id)
    if search:
        q = q.where(
            or_(
                Article.title.ilike(f"%{search}%"),
                Article.summary.ilike(f"%{search}%"),
            )
        )

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    q = q.order_by(
        Article.relevance_score.desc().nullslast(),
        Article.scraped_at.desc(),
    ).offset((page - 1) * limit).limit(limit)

    result = await db.execute(q)
    articles = result.scalars().all()

    return ArticleListOut(
        data=[ArticleOut.model_validate(a) for a in articles],
        total=total,
        page=page,
        limit=limit,
        pages=(total + limit - 1) // limit,
    )


@router.get("/{article_id}", response_model=ArticleOut)
async def get_article(article_id: str, db: AsyncSession = Depends(get_db)):
    article = await db.get(Article, article_id)
    if not article:
        raise HTTPException(404, "Article not found")
    return ArticleOut.model_validate(article)


@router.post("/{article_id}/reprocess", status_code=202)
async def reprocess_article(article_id: str, db: AsyncSession = Depends(get_db)):
    article = await db.get(Article, article_id)
    if not article:
        raise HTTPException(404, "Article not found")

    article.status = ArticleStatus.scraped.value
    article.error_message = None
    await db.commit()

    from app.workers.pipeline_tasks import process_article
    process_article.apply_async(args=[article.url_hash], queue="pipeline")

    return {"message": "Article queued for reprocessing", "article_id": article_id}
