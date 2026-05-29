from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.source import Source
from app.models.scrape_log import ScrapeLog
from app.schemas.source import SourceOut, SourceCreate, SourceUpdate, ScrapeLogOut

router = APIRouter()


@router.get("", response_model=list[SourceOut])
async def list_sources(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
):
    q = select(Source)
    if active_only:
        q = q.where(Source.is_active == True)
    q = q.order_by(Source.priority.desc(), Source.name)
    result = await db.execute(q)
    return [SourceOut.model_validate(s) for s in result.scalars().all()]


@router.post("", response_model=SourceOut, status_code=201)
async def create_source(body: SourceCreate, db: AsyncSession = Depends(get_db)):
    source = Source(**body.model_dump())
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return SourceOut.model_validate(source)


@router.patch("/{source_id}", response_model=SourceOut)
async def update_source(
    source_id: str,
    body: SourceUpdate,
    db: AsyncSession = Depends(get_db),
):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(source, k, v)
    await db.commit()
    await db.refresh(source)
    return SourceOut.model_validate(source)


@router.delete("/{source_id}", status_code=204)
async def delete_source(source_id: str, db: AsyncSession = Depends(get_db)):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(404, "Source not found")
    await db.delete(source)
    await db.commit()


@router.post("/{source_id}/scrape", status_code=202)
async def trigger_scrape(source_id: str, db: AsyncSession = Depends(get_db)):
    source = await db.get(Source, source_id)
    if not source:
        raise HTTPException(404, "Source not found")

    from app.workers.scrape_tasks import scrape_source
    task = scrape_source.apply_async(args=[source_id], queue="scrape")
    return {"message": "Scrape triggered", "task_id": task.id}


@router.get("/{source_id}/logs", response_model=list[ScrapeLogOut])
async def get_scrape_logs(
    source_id: str,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ScrapeLog)
        .where(ScrapeLog.source_id == source_id)
        .order_by(ScrapeLog.started_at.desc())
        .limit(limit)
    )
    return [ScrapeLogOut.model_validate(l) for l in result.scalars().all()]


@router.post("/scrape-all", status_code=202)
async def scrape_all():
    from app.workers.scrape_tasks import scrape_all_sources
    task = scrape_all_sources.apply_async(queue="scrape")
    return {"message": "All sources queued for scraping", "task_id": task.id}
