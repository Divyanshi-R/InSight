from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class JobProfileCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_title: str = Field(min_length=1, max_length=150)
    job_description: str = Field(min_length=1, max_length=20000)
    experience_level: str | None = Field(default=None, max_length=80)

    @field_validator("job_title", "job_description")
    @classmethod
    def reject_blank_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("This field must not be blank")
        return normalized

    @field_validator("experience_level")
    @classmethod
    def normalize_experience_level(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class JobProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    job_title: str
    job_description: str
    experience_level: str | None
    created_at: datetime
    updated_at: datetime
