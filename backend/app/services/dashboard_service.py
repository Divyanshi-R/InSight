from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.database.models import Answer, Evaluation, InterviewSession
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
    sessions = db.scalars(
        select(InterviewSession)
        .where(InterviewSession.user_id == user_id)
        .order_by(InterviewSession.started_at.desc(), InterviewSession.id.desc())
        .limit(limit)
    ).all()
    return [RecentSessionResponse.model_validate(session) for session in sessions]
