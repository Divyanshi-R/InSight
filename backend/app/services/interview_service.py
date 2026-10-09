from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models import Answer, InterviewSession, JobProfile, JobQuestion, Question
from app.schemas.interview import (
    InterviewAnswerResponse,
    InterviewListItemResponse,
    InterviewQuestionItem,
    InterviewSessionResponse,
)


class InterviewProfileNotFound(Exception):
    pass


class NoApprovedQuestionsError(Exception):
    pass


class InterviewSessionNotFound(Exception):
    pass


class InterviewCompletedError(Exception):
    pass


class QuestionNotInSessionError(Exception):
    pass


def build_interview_response(
    db: Session,
    session: InterviewSession,
) -> InterviewSessionResponse:
    job_title = "Practice Interview"
    if session.job_profile_id is not None:
        profile = session.job_profile or db.get(JobProfile, session.job_profile_id)
        if profile is not None:
            job_title = profile.job_title

    answers = list(
        db.scalars(
            select(Answer)
            .where(Answer.session_id == session.id)
            .order_by(Answer.id.asc())
        ).all()
    )

    questions: list[InterviewQuestionItem] = []
    for ans in answers:
        if ans.job_question_id is not None:
            jq = ans.job_question or db.get(JobQuestion, ans.job_question_id)
            if jq is not None:
                has_answer = bool(ans.transcript and ans.transcript.strip())
                questions.append(
                    InterviewQuestionItem(
                        id=jq.id,
                        question=jq.question,
                        question_type=jq.question_type,
                        difficulty=jq.difficulty,
                        skill_tags=jq.skill_tags or [],
                        answer=ans.transcript,
                        answered=has_answer,
                    )
                )
        elif ans.question_id is not None:
            q = ans.question or db.get(Question, ans.question_id)
            if q is not None:
                has_answer = bool(ans.transcript and ans.transcript.strip())
                questions.append(
                    InterviewQuestionItem(
                        id=q.id,
                        question=q.question_text,
                        question_type=q.question_type,
                        difficulty=q.difficulty,
                        skill_tags=[],
                        answer=ans.transcript,
                        answered=has_answer,
                    )
                )

    answered_count = sum(1 for item in questions if item.answered)

    return InterviewSessionResponse(
        id=session.id,
        user_id=session.user_id,
        job_profile_id=session.job_profile_id,
        job_title=job_title,
        status=session.status,
        started_at=session.started_at,
        completed_at=session.completed_at,
        total_questions=len(questions),
        answered_count=answered_count,
        questions=questions,
    )


def start_interview(
    db: Session,
    user_id: int,
    job_profile_id: int,
) -> InterviewSessionResponse:
    profile = db.get(JobProfile, job_profile_id)
    if profile is None or profile.user_id != user_id:
        raise InterviewProfileNotFound("Job profile not found")

    approved_questions = list(
        db.scalars(
            select(JobQuestion)
            .where(
                JobQuestion.job_profile_id == job_profile_id,
                JobQuestion.approved_by_student == True,  # noqa: E712
            )
            .order_by(JobQuestion.id.asc())
        ).all()
    )

    if not approved_questions:
        raise NoApprovedQuestionsError(
            "Job profile has no approved questions. Please approve at least one question before starting an interview."
        )

    session = InterviewSession(
        user_id=user_id,
        job_profile_id=job_profile_id,
        status="IN_PROGRESS",
        started_at=datetime.now(timezone.utc),
    )
    db.add(session)
    db.flush()

    for q in approved_questions:
        db.add(
            Answer(
                session_id=session.id,
                job_question_id=q.id,
                question_id=None,
                transcript=None,
            )
        )

    db.commit()
    db.refresh(session)
    return build_interview_response(db, session)


def get_interview(
    db: Session,
    user_id: int,
    session_id: int,
) -> InterviewSessionResponse | None:
    session = db.get(InterviewSession, session_id)
    if session is None or session.user_id != user_id:
        return None
    return build_interview_response(db, session)


def update_answer(
    db: Session,
    user_id: int,
    session_id: int,
    question_id: int,
    answer_text: str,
) -> InterviewAnswerResponse:
    session = db.get(InterviewSession, session_id)
    if session is None or session.user_id != user_id:
        raise InterviewSessionNotFound("Interview session not found")

    if session.status.upper() == "COMPLETED":
        raise InterviewCompletedError(
            "Cannot modify answers for a completed interview session"
        )

    answer = db.scalar(
        select(Answer).where(
            Answer.session_id == session_id,
            Answer.job_question_id == question_id,
        )
    )

    clean_text = answer_text.strip() if answer_text else ""

    if answer is None:
        jq = db.scalar(
            select(JobQuestion).where(
                JobQuestion.id == question_id,
                JobQuestion.job_profile_id == session.job_profile_id,
            )
        )
        if jq is None:
            raise QuestionNotInSessionError(
                "Question not found in this interview session"
            )
        answer = Answer(
            session_id=session.id,
            job_question_id=question_id,
            question_id=None,
            transcript=clean_text or None,
        )
        db.add(answer)
    else:
        answer.transcript = clean_text or None

    db.commit()
    db.refresh(answer)

    has_answer = bool(answer.transcript and answer.transcript.strip())
    return InterviewAnswerResponse(
        question_id=question_id,
        answer=answer.transcript,
        answered=has_answer,
    )


def complete_interview(
    db: Session,
    user_id: int,
    session_id: int,
) -> InterviewSessionResponse:
    session = db.get(InterviewSession, session_id)
    if session is None or session.user_id != user_id:
        raise InterviewSessionNotFound("Interview session not found")

    if session.status.upper() != "COMPLETED":
        session.status = "COMPLETED"
        session.completed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(session)

    return build_interview_response(db, session)


def list_user_interviews(
    db: Session,
    user_id: int,
) -> list[InterviewListItemResponse]:
    sessions = list(
        db.scalars(
            select(InterviewSession)
            .where(InterviewSession.user_id == user_id)
            .order_by(InterviewSession.started_at.desc(), InterviewSession.id.desc())
        ).all()
    )

    results: list[InterviewListItemResponse] = []
    for session in sessions:
        job_title = "Practice Interview"
        if session.job_profile_id is not None:
            profile = session.job_profile or db.get(JobProfile, session.job_profile_id)
            if profile is not None:
                job_title = profile.job_title

        answers = list(
            db.scalars(
                select(Answer).where(Answer.session_id == session.id)
            ).all()
        )
        total_q = len(answers)
        answered_q = sum(
            1 for ans in answers if ans.transcript and ans.transcript.strip()
        )

        results.append(
            InterviewListItemResponse(
                id=session.id,
                job_profile_id=session.job_profile_id,
                job_title=job_title,
                status=session.status,
                started_at=session.started_at,
                completed_at=session.completed_at,
                total_questions=total_q,
                answered_count=answered_q,
            )
        )
    return results
