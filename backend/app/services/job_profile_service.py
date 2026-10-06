from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.models import JobProfile
from app.schemas.job_profile import JobProfileCreate


def create_job_profile(
    db: Session,
    user_id: int,
    profile_data: JobProfileCreate,
) -> JobProfile:
    job_profile = JobProfile(
        user_id=user_id,
        job_title=profile_data.job_title,
        job_description=profile_data.job_description,
        experience_level=profile_data.experience_level,
    )
    db.add(job_profile)
    db.commit()
    db.refresh(job_profile)
    return job_profile


def list_job_profiles(db: Session, user_id: int) -> list[JobProfile]:
    return list(
        db.scalars(
            select(JobProfile)
            .where(JobProfile.user_id == user_id)
            .order_by(JobProfile.created_at.desc(), JobProfile.id.desc())
        ).all()
    )


def get_job_profile(
    db: Session,
    user_id: int,
    job_profile_id: int,
) -> JobProfile | None:
    return db.scalar(
        select(JobProfile).where(
            JobProfile.id == job_profile_id,
            JobProfile.user_id == user_id,
        )
    )


def delete_job_profile(
    db: Session,
    user_id: int,
    job_profile_id: int,
) -> bool:
    job_profile = get_job_profile(db, user_id, job_profile_id)
    if job_profile is None:
        return False

    db.delete(job_profile)
    db.commit()
    return True
