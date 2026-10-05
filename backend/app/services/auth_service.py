from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import UserRole, create_access_token, hash_password, verify_password
from app.database.models import User
from app.schemas.auth import RegisterRequest


class DuplicateEmailError(Exception):
    pass


def register_user(db: Session, request: RegisterRequest) -> User:
    existing_user = db.scalar(select(User).where(User.email == request.email))
    if existing_user is not None:
        raise DuplicateEmailError

    user = User(
        name=request.name,
        email=request.email,
        password_hash=hash_password(request.password),
        role=UserRole.STUDENT.value,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        if db.scalar(select(User.id).where(User.email == request.email)) is not None:
            raise DuplicateEmailError from None
        raise
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(password, user.password_hash):
        return None
    return user


def create_user_access_token(user: User) -> str:
    return create_access_token(user.id, user.role)
