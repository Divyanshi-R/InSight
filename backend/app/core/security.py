from datetime import datetime, timedelta, timezone
from enum import Enum

import bcrypt
from jose import jwt

from app.core.config import settings

ALGORITHM = "HS256"


class UserRole(str, Enum):
    STUDENT = "STUDENT"
    ADMIN = "ADMIN"


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("ascii"))
    except (ValueError, UnicodeEncodeError):
        return False


def create_access_token(
    user_id: int,
    role: str,
    expires_delta: timedelta | None = None,
) -> str:
    expires_at = datetime.now(timezone.utc) + (
        expires_delta
        if expires_delta is not None
        else timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return jwt.encode(
        {"sub": str(user_id), "role": role, "exp": expires_at},
        settings.SECRET_KEY,
        algorithm=ALGORITHM,
    )


def decode_access_token(token: str) -> dict[str, object]:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])


__all__ = [
    "UserRole",
    "create_access_token",
    "decode_access_token",
    "hash_password",
    "verify_password",
]
