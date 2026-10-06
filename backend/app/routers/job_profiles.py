from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from app.core.dependencies import (
    get_ai_question_generator,
    get_current_active_user,
    get_db,
)
from app.database.models import JobProfile, JobQuestion, User
from app.schemas.job_question import (
    JobQuestionApprovalUpdate,
    JobQuestionListResponse,
    JobQuestionResponse,
)
from app.schemas.job_profile import JobProfileCreate, JobProfileResponse
from app.services.ai_question_generator import (
    AIQuestionGenerator,
    QuestionGeneratorError,
    QuestionGeneratorUnavailable,
)
from app.services.job_question_service import (
    generate_and_store_questions,
    list_job_questions,
    update_question_approval,
)
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


@router.post(
    "/{job_profile_id}/questions/generate",
    response_model=JobQuestionListResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_profile_questions(
    job_profile_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
    generator: AIQuestionGenerator = Depends(get_ai_question_generator),
) -> JobQuestionListResponse:
    try:
        questions = generate_and_store_questions(
            db,
            current_user.id,
            job_profile_id,
            generator,
        )
    except QuestionGeneratorUnavailable:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI question generation is not configured",
        ) from None
    except QuestionGeneratorError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI question generation failed",
        ) from None

    if questions is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job profile not found",
        )
    return JobQuestionListResponse(
        questions=[JobQuestionResponse.model_validate(question) for question in questions]
    )


@router.get(
    "/{job_profile_id}/questions",
    response_model=JobQuestionListResponse,
)
def get_profile_questions(
    job_profile_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> JobQuestionListResponse:
    if get_job_profile(db, current_user.id, job_profile_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job profile not found",
        )
    return JobQuestionListResponse(
        questions=[
            JobQuestionResponse.model_validate(question)
            for question in list_job_questions(db, job_profile_id)
        ]
    )


@router.patch(
    "/{job_profile_id}/questions/{question_id}",
    response_model=JobQuestionResponse,
)
def approve_profile_question(
    job_profile_id: int,
    question_id: int,
    request: JobQuestionApprovalUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> JobQuestion:
    if get_job_profile(db, current_user.id, job_profile_id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job profile not found",
        )
    question = update_question_approval(
        db,
        job_profile_id,
        question_id,
        request.approved_by_student,
    )
    if question is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found",
        )
    return question
