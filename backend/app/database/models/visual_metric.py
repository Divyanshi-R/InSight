from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class VisualMetric(Base):
    __tablename__ = "visual_metrics"
    __table_args__ = (
        UniqueConstraint("answer_id", name="uq_visual_metrics_answer_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    answer_id: Mapped[int] = mapped_column(
        ForeignKey("answers.id", ondelete="CASCADE"), nullable=False
    )
    eye_contact_percentage: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    face_detected_percentage: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    confidence_estimate: Mapped[Decimal | None] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    expression_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    answer: Mapped["Answer"] = relationship(back_populates="visual_metric")
