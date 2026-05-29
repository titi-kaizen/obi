from datetime import datetime

from pydantic import BaseModel, ConfigDict, HttpUrl


class SourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    url: str
    source_type: str
    source_category: str
    priority: int
    scrape_interval_minutes: int
    is_active: bool
    last_scraped_at: datetime | None
    last_error: str | None
    error_count: int
    total_articles_scraped: int
    requires_playwright: bool
    selector: str | None
    created_at: datetime


class SourceCreate(BaseModel):
    name: str
    url: str
    source_type: str = "html"
    source_category: str = "media"
    priority: int = 5
    scrape_interval_minutes: int = 60
    selector: str | None = None
    requires_playwright: bool = False


class SourceUpdate(BaseModel):
    name: str | None = None
    priority: int | None = None
    scrape_interval_minutes: int | None = None
    is_active: bool | None = None
    selector: str | None = None
    requires_playwright: bool | None = None


class ScrapeLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    source_id: str
    source_name: str
    status: str
    scrape_method: str | None
    selector_used: str | None
    articles_found: int
    articles_new: int
    articles_skipped: int
    articles_failed: int
    articles_irrelevant: int
    response_time_ms: int | None
    error_message: str | None
    started_at: datetime
    finished_at: datetime | None
    duration_ms: int | None
