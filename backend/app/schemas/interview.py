from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class InterviewStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_profile_id: int


class SpeechMetrics(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    word_count: int = 0
    duration_seconds: float | None = None
    words_per_minute: float | None = None
    filler_words_count: int = 0
    filler_words: dict[str, int] = Field(default_factory=dict)
    pause_analysis: str = "Pause analysis is not yet available"


class InterviewAnswerUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer_text: str = Field(default="", max_length=20000)
    duration_seconds: float | None = Field(default=None, ge=0, le=86400)


class InterviewQuestionItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    question: str
    question_type: str
    difficulty: str
    skill_tags: list[str] = Field(default_factory=list)
    answer: str | None = None
    answered: bool = False
    duration_seconds: float | None = None
    speech_metrics: SpeechMetrics | None = None


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
    duration_seconds: float | None = None
    speech_metrics: SpeechMetrics | None = None


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
