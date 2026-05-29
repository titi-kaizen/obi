import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ScrapeLog(Base):
    __tablename__ = "scrape_logs_v2"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    source_id: Mapped[str] = mapped_column(UUID(as_uuid=False), nullable=False)
    source_name: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    scrape_method: Mapped[str | None] = mapped_column(String(20))
    selector_used: Mapped[str | None] = mapped_column(Text)

    articles_found: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    articles_new: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    articles_skipped: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    articles_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    articles_irrelevant: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    response_time_ms: Mapped[int | None] = mapped_column(Integer)
    error_message: Mapped[str | None] = mapped_column(Text)

    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_ms: Mapped[int | None] = mapped_column(Integer)

    __table_args__ = (
        Index("idx_sl2_source_id", "source_id"),
        Index("idx_sl2_started_at", "started_at"),
        Index("idx_sl2_status", "status"),
    )
