"""
Seed the sources_v2 table from SOURCE_REGISTRY.
Run once after migration: python seed_sources.py
"""
import asyncio

from sqlalchemy import select
from app.database import AsyncSessionLocal, engine, Base
from app.models.source import Source
from app.scrapers.source_registry import SOURCE_REGISTRY


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        inserted = 0
        skipped = 0

        for cfg in SOURCE_REGISTRY:
            existing = await db.execute(
                select(Source).where(Source.url == cfg.url)
            )
            if existing.scalar_one_or_none():
                skipped += 1
                continue

            source = Source(
                name=cfg.name,
                url=cfg.url,
                source_type=cfg.source_type,
                source_category=cfg.source_category,
                priority=cfg.priority,
                scrape_interval_minutes=cfg.scrape_interval_minutes,
                selector=cfg.container_selector or None,
                requires_playwright=cfg.requires_playwright,
            )
            db.add(source)
            inserted += 1

        await db.commit()
        print(f"Seeded {inserted} sources ({skipped} already existed)")


if __name__ == "__main__":
    asyncio.run(seed())
