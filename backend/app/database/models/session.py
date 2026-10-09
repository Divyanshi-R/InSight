from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class InterviewSession(Base):
    __tablename__ = "interview_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    job_profile_id: Mapped[int | None] = mapped_column(
        ForeignKey("job_profiles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="IN_PROGRESS", server_default="IN_PROGRESS"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="interview_sessions")
    job_profile: Mapped["JobProfile | None"] = relationship(
        back_populates="interview_sessions"
    )
    answers: Mapped[list["Answer"]] = relationship(
        back_populates="interview_session",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
