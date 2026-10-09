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
        UniqueConstraint("session_id", "job_question_id", name="uq_answers_session_job_question"),
        Index("ix_answers_question_id", "question_id"),
        Index("ix_answers_job_question_id", "job_question_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("interview_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id: Mapped[int | None] = mapped_column(
        ForeignKey("questions.id"), nullable=True
    )
    job_question_id: Mapped[int | None] = mapped_column(
        ForeignKey("job_questions.id", ondelete="CASCADE"),
        nullable=True,
    )
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    interview_session: Mapped["InterviewSession"] = relationship(back_populates="answers")
    question: Mapped["Question | None"] = relationship(back_populates="answers")
    job_question: Mapped["JobQuestion | None"] = relationship(back_populates="answers")
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
