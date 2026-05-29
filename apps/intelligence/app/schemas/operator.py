from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class OperatorOut(BaseModel):
    slug: str
    name: str
    category: str
    country: str
    website: str
    description: str


class OperatorStatsOut(BaseModel):
    slug: str
    name: str
    article_count: int
    avg_relevance: float | None
    dominant_sentiment: str | None
    top_keywords: list[str]
    recent_articles: list[dict[str, Any]]


class OperatorBriefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    operator_slug: str
    operator_name: str
    brief_date: date
    content_md: str | None
    article_count: int
    avg_relevance: float | None
    dominant_sentiment: str | None
    top_keywords: list[str]
    risk_level: str | None
    impacts: dict[str, Any] | None
    generated_at: datetime
