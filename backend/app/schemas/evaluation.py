from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class AnswerEvaluationRawResult(BaseModel):
    model_config = ConfigDict(extra="ignore")

    relevance_score: Decimal = Field(..., ge=0, le=100)
    completeness_score: Decimal = Field(..., ge=0, le=100)
    clarity_score: Decimal = Field(..., ge=0, le=100)
    structure_score: Decimal = Field(..., ge=0, le=100)
    feedback: str = Field(..., min_length=10)
    strengths: str = Field(..., min_length=3)
    improvements: str = Field(..., min_length=3)


class AnswerEvaluationResult(AnswerEvaluationRawResult):
    overall_score: Decimal = Field(..., ge=0, le=100)


class EvaluationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    answer_id: int
    relevance_score: Decimal | None
    completeness_score: Decimal | None
    clarity_score: Decimal | None
    structure_score: Decimal | None
    overall_score: Decimal | None
    feedback: str | None
    strengths: str | None
    improvements: str | None
    created_at: datetime


class SessionEvaluationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    session_id: int
    job_title: str
    status: str
    total_questions: int
    answered_count: int
    evaluated_count: int
    average_score: Decimal | None
    evaluations: list[EvaluationResponse]
