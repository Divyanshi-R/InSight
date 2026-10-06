from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class JobProfile(Base):
    __tablename__ = "job_profiles"
    __table_args__ = (Index("ix_job_profiles_user_created", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    job_title: Mapped[str] = mapped_column(String(150), nullable=False)
    job_description: Mapped[str] = mapped_column(Text, nullable=False)
    experience_level: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    user: Mapped["User"] = relationship(back_populates="job_profiles")
    questions: Mapped[list["JobQuestion"]] = relationship(
        back_populates="job_profile",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="JobQuestion.created_at.desc(), JobQuestion.id.desc()",
    )
