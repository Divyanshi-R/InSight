from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict


class DashboardSummaryResponse(BaseModel):
    total_sessions: int
    completed_sessions: int
    in_progress_sessions: int
    average_score: Decimal | None


class RecentSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    started_at: datetime
    completed_at: datetime | None
    status: str
