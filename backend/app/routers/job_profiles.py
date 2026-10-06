from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_active_user, get_db
from app.database.models import JobProfile, User
from app.schemas.job_profile import JobProfileCreate, JobProfileResponse
from app.services.job_profile_service import (
    create_job_profile,
    delete_job_profile,
    get_job_profile,
    list_job_profiles,
)

router = APIRouter(prefix="/api/job-profiles", tags=["Job Profiles"])


@router.post(
    "",
    response_model=JobProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_profile(
    profile_data: JobProfileCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> JobProfile:
    return create_job_profile(db, current_user.id, profile_data)


@router.get("", response_model=list[JobProfileResponse])
def get_profiles(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[JobProfile]:
    return list_job_profiles(db, current_user.id)


@router.get("/{job_profile_id}", response_model=JobProfileResponse)
def get_profile(
    job_profile_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> JobProfile:
    job_profile = get_job_profile(db, current_user.id, job_profile_id)
    if job_profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job profile not found",
        )
    return job_profile


@router.delete("/{job_profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_profile(
    job_profile_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> Response:
    if not delete_job_profile(db, current_user.id, job_profile_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job profile not found",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
