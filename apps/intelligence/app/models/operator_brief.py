import uuid
from datetime import datetime, date

from sqlalchemy import Date, DateTime, Float, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class OperatorBrief(Base):
    __tablename__ = "operator_briefs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    operator_slug: Mapped[str] = mapped_column(String(100), nullable=False)
    operator_name: Mapped[str] = mapped_column(String(255), nullable=False)
    brief_date: Mapped[date] = mapped_column(Date, nullable=False)

    # Brief content
    content_md: Mapped[str | None] = mapped_column(Text)

    # Aggregated stats
    article_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    avg_relevance: Mapped[float | None] = mapped_column(Float)
    dominant_sentiment: Mapped[str | None] = mapped_column(String(10))
    top_keywords: Mapped[list | None] = mapped_column(ARRAY(Text), default=list)
    risk_level: Mapped[str | None] = mapped_column(String(10))  # low | medium | high

    # Impact areas
    impacts: Mapped[dict | None] = mapped_column(JSONB, default=dict)
    top_article_ids: Mapped[list | None] = mapped_column(ARRAY(Text), default=list)

    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        Index("idx_ob_operator_date", "operator_slug", "brief_date"),
        Index("idx_ob_brief_date", "brief_date"),
    )
