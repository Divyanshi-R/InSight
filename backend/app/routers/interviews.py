from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_active_user, get_db
from app.database.models import User
from app.schemas.interview import (
    InterviewAnswerResponse,
    InterviewAnswerUpdate,
    InterviewListItemResponse,
    InterviewSessionResponse,
    InterviewStartRequest,
)
from app.services.interview_service import (
    InterviewCompletedError,
    InterviewProfileNotFound,
    InterviewSessionNotFound,
    NoApprovedQuestionsError,
    QuestionNotInSessionError,
    complete_interview,
    get_interview,
    list_user_interviews,
    start_interview,
    update_answer,
)

router = APIRouter(prefix="/api/interviews", tags=["Interviews"])


@router.post(
    "",
    response_model=InterviewSessionResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_interview(
    request: InterviewStartRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> InterviewSessionResponse:
    try:
        return start_interview(db, current_user.id, request.job_profile_id)
    except InterviewProfileNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job profile not found",
        ) from None
    except NoApprovedQuestionsError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from None


@router.get("", response_model=list[InterviewListItemResponse])
def get_user_interviews(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> list[InterviewListItemResponse]:
    return list_user_interviews(db, current_user.id)


@router.get(
    "/{session_id}",
    response_model=InterviewSessionResponse,
)
def get_interview_session(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> InterviewSessionResponse:
    interview = get_interview(db, current_user.id, session_id)
    if interview is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found",
        )
    return interview


@router.put(
    "/{session_id}/answers/{question_id}",
    response_model=InterviewAnswerResponse,
)
def save_interview_answer(
    session_id: int,
    question_id: int,
    request: InterviewAnswerUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> InterviewAnswerResponse:
    try:
        return update_answer(
            db,
            current_user.id,
            session_id,
            question_id,
            request.answer_text,
        )
    except InterviewSessionNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found",
        ) from None
    except QuestionNotInSessionError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Question not found in this interview session",
        ) from None
    except InterviewCompletedError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from None


@router.patch(
    "/{session_id}/answers/{question_id}",
    response_model=InterviewAnswerResponse,
)
def patch_interview_answer(
    session_id: int,
    question_id: int,
    request: InterviewAnswerUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> InterviewAnswerResponse:
    return save_interview_answer(
        session_id, question_id, request, current_user, db
    )


@router.post(
    "/{session_id}/complete",
    response_model=InterviewSessionResponse,
)
def finish_interview_session(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
) -> InterviewSessionResponse:
    try:
        return complete_interview(db, current_user.id, session_id)
    except InterviewSessionNotFound:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Interview session not found",
        ) from None
