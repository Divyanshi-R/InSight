from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_active_user, get_db
from app.database.models import User
from app.schemas.dashboard import DashboardSummaryResponse, RecentSessionResponse
from app.services.dashboard_service import get_dashboard_summary, get_recent_sessions

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummaryResponse)
def dashboard_summary(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> DashboardSummaryResponse:
    return get_dashboard_summary(db, current_user.id)


@router.get("/recent", response_model=list[RecentSessionResponse])
def recent_sessions(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[RecentSessionResponse]:
    return get_recent_sessions(db, current_user.id)
