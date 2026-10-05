from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Numeric, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Evaluation(Base):
    __tablename__ = "evaluations"
    __table_args__ = (
        UniqueConstraint("answer_id", name="uq_evaluations_answer_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    answer_id: Mapped[int] = mapped_column(
        ForeignKey("answers.id", ondelete="CASCADE"), nullable=False
    )
    relevance_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    completeness_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    clarity_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    structure_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    overall_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    strengths: Mapped[str | None] = mapped_column(Text, nullable=True)
    improvements: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    answer: Mapped["Answer"] = relationship(back_populates="evaluation")
