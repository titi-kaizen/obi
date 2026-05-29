import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class SourceType(str, enum.Enum):
    rss = "rss"
    html = "html"
    playwright = "playwright"


class SourceCategory(str, enum.Enum):
    media = "media"
    operator = "operator"
    service_company = "service_company"
    institutional = "institutional"
    international = "international"


class Source(Base):
    __tablename__ = "sources_v2"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, default=SourceType.html.value)
    source_category: Mapped[str] = mapped_column(String(30), nullable=False, default=SourceCategory.media.value)

    # Scraping config
    selector: Mapped[str | None] = mapped_column(Text)
    article_link_selector: Mapped[str | None] = mapped_column(Text)
    title_selector: Mapped[str | None] = mapped_column(Text)
    date_selector: Mapped[str | None] = mapped_column(Text)
    content_selector: Mapped[str | None] = mapped_column(Text)
    requires_playwright: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Priority (higher = scraped more often, ranked first)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    scrape_interval_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    last_scraped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None] = mapped_column(Text)
    error_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_articles_scraped: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        Index("idx_sv2_is_active", "is_active"),
        Index("idx_sv2_priority", "priority"),
        Index("idx_sv2_category", "source_category"),
    )
