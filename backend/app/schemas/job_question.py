from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


QuestionType = Literal["TECHNICAL", "CONCEPTUAL", "SCENARIO", "BEHAVIORAL"]
QuestionDifficulty = Literal["EASY", "MEDIUM", "HARD"]


class GeneratedQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=4000)
    question_type: QuestionType
    difficulty: QuestionDifficulty
    skill_tags: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("question")
    @classmethod
    def question_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Question must not be blank")
        return value

    @field_validator("skill_tags")
    @classmethod
    def validate_skill_tags(cls, value: list[str]) -> list[str]:
        tags: list[str] = []
        for tag in value:
            normalized = tag.strip()
            if not normalized or len(normalized) > 80:
                raise ValueError("Skill tags must be non-empty strings of at most 80 characters")
            tags.append(normalized)
        return tags


GeneratedQuestionData = GeneratedQuestion | dict[str, object]


class JobQuestionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_profile_id: int
    question: str
    question_type: QuestionType
    difficulty: QuestionDifficulty
    skill_tags: list[str]
    generation_model: str
    generation_prompt_version: str
    approved_by_student: bool
    created_at: datetime


class JobQuestionListResponse(BaseModel):
    questions: list[JobQuestionResponse]


class JobQuestionApprovalUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    approved_by_student: bool
