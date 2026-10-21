from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database.models import Answer, Evaluation, InterviewSession, JobProfile
from app.schemas.dashboard import DashboardSummaryResponse, RecentSessionResponse


def get_dashboard_summary(
    db: Session,
    user_id: int,
) -> DashboardSummaryResponse:
    total_sessions = db.scalar(
        select(func.count(InterviewSession.id)).where(
            InterviewSession.user_id == user_id
        )
    ) or 0
    completed_sessions = db.scalar(
        select(func.count(InterviewSession.id)).where(
            InterviewSession.user_id == user_id,
            func.upper(InterviewSession.status) == "COMPLETED",
        )
    ) or 0
    in_progress_sessions = db.scalar(
        select(func.count(InterviewSession.id)).where(
            InterviewSession.user_id == user_id,
            func.upper(InterviewSession.status) == "IN_PROGRESS",
        )
    ) or 0
    average_score = db.scalar(
        select(func.avg(Evaluation.overall_score))
        .join(Answer, Evaluation.answer_id == Answer.id)
        .join(InterviewSession, Answer.session_id == InterviewSession.id)
        .where(InterviewSession.user_id == user_id)
    )

    return DashboardSummaryResponse(
        total_sessions=total_sessions,
        completed_sessions=completed_sessions,
        in_progress_sessions=in_progress_sessions,
        average_score=(
            Decimal(str(average_score)) if average_score is not None else None
        ),
    )


def get_recent_sessions(
    db: Session,
    user_id: int,
    limit: int = 5,
) -> list[RecentSessionResponse]:
    sessions = list(
        db.scalars(
            select(InterviewSession)
            .where(InterviewSession.user_id == user_id)
            .order_by(InterviewSession.started_at.desc(), InterviewSession.id.desc())
            .limit(limit)
        ).all()
    )

    results: list[RecentSessionResponse] = []
    for session in sessions:
        job_title = "Practice Interview"
        if session.job_profile_id is not None:
            profile = session.job_profile or db.get(JobProfile, session.job_profile_id)
            if profile is not None:
                job_title = profile.job_title

        scores = [
            float(ans.evaluation.overall_score)
            for ans in session.answers
            if ans.evaluation is not None and ans.evaluation.overall_score is not None
        ]
        avg_score = (
            round(Decimal(str(sum(scores) / len(scores))), 2)
            if scores
            else None
        )

        results.append(
            RecentSessionResponse(
                id=session.id,
                started_at=session.started_at,
                completed_at=session.completed_at,
                status=session.status,
                job_title=job_title,
                score=avg_score,
            )
        )
    return results

