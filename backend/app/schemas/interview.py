from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class InterviewStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_profile_id: int


class InterviewAnswerUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer_text: str = Field(default="", max_length=20000)


class InterviewQuestionItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question: str
    question_type: str
    difficulty: str
    skill_tags: list[str] = Field(default_factory=list)
    answer: str | None = None
    answered: bool = False


class InterviewSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    job_profile_id: int | None
    job_title: str
    status: str
    started_at: datetime
    completed_at: datetime | None
    total_questions: int
    answered_count: int
    questions: list[InterviewQuestionItem]


class InterviewAnswerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    question_id: int
    answer: str | None
    answered: bool


class InterviewListItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_profile_id: int | None
    job_title: str
    status: str
    started_at: datetime
    completed_at: datetime | None
    total_questions: int
    answered_count: int
