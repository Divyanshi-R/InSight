from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class JobQuestion(Base):
    __tablename__ = "job_questions"
    __table_args__ = (
        Index("ix_job_questions_profile_created", "job_profile_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    job_profile_id: Mapped[int] = mapped_column(
        ForeignKey("job_profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[str] = mapped_column(String(20), nullable=False)
    difficulty: Mapped[str] = mapped_column(String(20), nullable=False)
    skill_tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    generation_model: Mapped[str] = mapped_column(String(120), nullable=False)
    generation_prompt_version: Mapped[str] = mapped_column(
        String(40), nullable=False
    )
    approved_by_student: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    job_profile: Mapped["JobProfile"] = relationship(back_populates="questions")
    answers: Mapped[list["Answer"]] = relationship(
        back_populates="job_question",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
