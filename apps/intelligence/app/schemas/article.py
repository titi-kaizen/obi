from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class ArticleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_id: str
    source_name: str
    url: str
    title: str | None
    summary: str | None
    published_at: datetime | None
    scraped_at: datetime
    processed_at: datetime | None
    status: str
    category: str | None
    subcategory: str | None
    sentiment: str | None
    relevance_score: float | None
    og_relevance_pre: float | None
    supply_chain_impact: str | None
    keywords: list[str]
    operator_slugs: list[str]
    scrape_method: str | None
    pipeline_duration_ms: int | None
    error_message: str | None


class ArticleListOut(BaseModel):
    data: list[ArticleOut]
    total: int
    page: int
    limit: int
    pages: int


class PipelineStageCount(BaseModel):
    queued: int = 0
    scraping: int = 0
    scraped: int = 0
    parsing: int = 0
    classified: int = 0
    completed: int = 0
    failed: int = 0
    irrelevant: int = 0


class PipelineStatsOut(BaseModel):
    stages: PipelineStageCount
    avg_relevance: float
    avg_pipeline_duration_ms: float
    articles_today: int
    articles_week: int
    top_categories: list[dict[str, Any]]
    top_sources: list[dict[str, Any]]
