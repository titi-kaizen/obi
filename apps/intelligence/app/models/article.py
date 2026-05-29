import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    DateTime, Float, Index, Integer, String, Text, UniqueConstraint,
    func, text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ArticleStatus(str, enum.Enum):
    queued = "queued"
    scraping = "scraping"
    scraped = "scraped"
    parsing = "parsing"
    classified = "classified"
    completed = "completed"
    failed = "failed"
    irrelevant = "irrelevant"


class Article(Base):
    __tablename__ = "articles_v2"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    source_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    source_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    url: Mapped[str] = mapped_column(Text, nullable=False)
    url_hash: Mapped[str] = mapped_column(String(64), nullable=False)

    title: Mapped[str | None] = mapped_column(Text)
    content: Mapped[str | None] = mapped_column(Text)
    summary: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Pipeline state machine
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=ArticleStatus.queued.value
    )
    pipeline_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pipeline_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    pipeline_duration_ms: Mapped[int | None] = mapped_column(Integer)
    scrape_method: Mapped[str | None] = mapped_column(String(30))  # bs4 | playwright | rss
    scrape_selector: Mapped[str | None] = mapped_column(Text)

    # AI enrichment
    category: Mapped[str | None] = mapped_column(String(50))
    subcategory: Mapped[str | None] = mapped_column(String(60))
    sentiment: Mapped[str | None] = mapped_column(String(10))
    relevance_score: Mapped[float | None] = mapped_column(Float)
    og_relevance_pre: Mapped[float | None] = mapped_column(Float)  # pre-LLM fast score
    supply_chain_impact: Mapped[str | None] = mapped_column(Text)
    keywords: Mapped[list | None] = mapped_column(ARRAY(Text), default=list)

    # Operator/company associations
    operator_slugs: Mapped[list | None] = mapped_column(ARRAY(Text), default=list)

    # Metadata
    scraped_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Error tracking
    error_message: Mapped[str | None] = mapped_column(Text)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    __table_args__ = (
        UniqueConstraint("url_hash", name="uq_articles_v2_url_hash"),
        Index("idx_av2_source_id", "source_id"),
        Index("idx_av2_status", "status"),
        Index("idx_av2_category", "category"),
        Index("idx_av2_relevance", "relevance_score"),
        Index("idx_av2_published_at", "published_at"),
        Index("idx_av2_operator_slugs", "operator_slugs", postgresql_using="gin"),
    )
