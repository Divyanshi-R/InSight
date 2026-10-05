from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (
        Index("ix_questions_category_type", "category", "question_type"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    question_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    ideal_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="1", index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    answers: Mapped[list["Answer"]] = relationship(back_populates="question")
