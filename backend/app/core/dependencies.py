from collections.abc import Generator

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.security import UserRole, decode_access_token
from app.database.database import SessionLocal
from app.database.models import User
from app.services.ai_question_generator import (
    AIQuestionGenerator,
    OpenAICompatibleQuestionGenerator,
)


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_ai_question_generator() -> AIQuestionGenerator:
    return OpenAICompatibleQuestionGenerator()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if token is None:
        raise unauthorized

    try:
        payload = decode_access_token(token)
        subject = payload.get("sub")
        role = payload.get("role")
        if (
            not isinstance(subject, str)
            or not subject.isdecimal()
            or not isinstance(payload.get("exp"), int)
        ):
            raise unauthorized
        if role not in {member.value for member in UserRole}:
            raise unauthorized
        user_id = int(subject)
    except (JWTError, ValueError):
        raise unauthorized from None

    user = db.get(User, user_id)
    if user is None or user.role != role:
        raise unauthorized
    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    return current_user


def require_admin(
    current_user: User = Depends(get_current_active_user),
) -> User:
    if current_user.role != UserRole.ADMIN.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return current_user
