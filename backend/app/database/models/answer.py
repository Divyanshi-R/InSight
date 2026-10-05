from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Answer(Base):
    __tablename__ = "answers"
    __table_args__ = (
        UniqueConstraint("session_id", "question_id", name="uq_answers_session_question"),
        Index("ix_answers_question_id", "question_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("questions.id"), nullable=False
    )
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    interview_session: Mapped["InterviewSession"] = relationship(back_populates="answers")
    question: Mapped["Question"] = relationship(back_populates="answers")
    evaluation: Mapped["Evaluation | None"] = relationship(
        back_populates="answer",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )
    visual_metric: Mapped["VisualMetric | None"] = relationship(
        back_populates="answer",
        cascade="all, delete-orphan",
        passive_deletes=True,
        uselist=False,
    )
