from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.database.models import JobQuestion
from app.schemas.job_question import GeneratedQuestion
from app.services.ai_question_generator import (
    MAX_GENERATED_QUESTIONS,
    PROMPT_VERSION,
    AIQuestionGenerator,
    QuestionGeneratorError,
)
from app.services.job_profile_service import get_job_profile


def generate_and_store_questions(
    db: Session,
    user_id: int,
    job_profile_id: int,
    generator: AIQuestionGenerator,
) -> list[JobQuestion] | None:
    profile = get_job_profile(db, user_id, job_profile_id)
    if profile is None:
        return None

    questions = generator.generate_questions(
        job_title=profile.job_title,
        job_description=profile.job_description,
        experience_level=profile.experience_level,
    )
    if not isinstance(questions, list) or not 1 <= len(questions) <= MAX_GENERATED_QUESTIONS:
        raise QuestionGeneratorError("AI provider returned an invalid response")

    validated: list[GeneratedQuestion] = []
    seen: set[str] = set()
    for question in questions:
        try:
            item = (
                question
                if isinstance(question, GeneratedQuestion)
                else GeneratedQuestion.model_validate(question)
            )
        except (TypeError, ValueError):
            raise QuestionGeneratorError("AI provider returned an invalid response") from None
        normalized = " ".join(item.question.split()).casefold()
        if normalized not in seen:
            seen.add(normalized)
            validated.append(item)

    if not validated:
        raise QuestionGeneratorError("AI provider returned no usable questions")

    existing_questions = db.scalars(
        select(JobQuestion.question).where(
            JobQuestion.job_profile_id == job_profile_id
        )
    ).all()
    existing_normalized = {
        " ".join(question.split()).casefold() for question in existing_questions
    }

    new_questions = [
        JobQuestion(
            job_profile_id=job_profile_id,
            question=item.question,
            question_type=item.question_type,
            difficulty=item.difficulty,
            skill_tags=item.skill_tags,
            generation_model=settings.AI_MODEL,
            generation_prompt_version=PROMPT_VERSION,
            approved_by_student=False,
        )
        for item in validated
        if " ".join(item.question.split()).casefold() not in existing_normalized
    ]
    db.add_all(new_questions)
    db.commit()
    for question in new_questions:
        db.refresh(question)
    return new_questions


def list_job_questions(db: Session, job_profile_id: int) -> list[JobQuestion]:
    return list(
        db.scalars(
            select(JobQuestion)
            .where(JobQuestion.job_profile_id == job_profile_id)
            .order_by(JobQuestion.created_at.desc(), JobQuestion.id.desc())
        ).all()
    )


def update_question_approval(
    db: Session,
    job_profile_id: int,
    question_id: int,
    approved: bool,
) -> JobQuestion | None:
    question = db.scalar(
        select(JobQuestion).where(
            JobQuestion.job_profile_id == job_profile_id,
            JobQuestion.id == question_id,
        )
    )
    if question is None:
        return None
    question.approved_by_student = approved
    db.commit()
    db.refresh(question)
    return question
