from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.security import (
    ALGORITHM,
    UserRole,
    create_access_token,
    hash_password,
    verify_password,
)
from app.database.models import User


@pytest.fixture
def auth_client(
    auth_test_context: tuple[TestClient, sessionmaker[Session]],
) -> TestClient:
    return auth_test_context[0]


@pytest.fixture
def test_session_factory(
    auth_test_context: tuple[TestClient, sessionmaker[Session]],
) -> sessionmaker[Session]:
    return auth_test_context[1]


def register_user(
    client: TestClient,
    email: str = "student@example.com",
    password: str = "StrongPass123",
) -> dict[str, object]:
    response = client.post(
        "/api/auth/register",
        json={"name": "Test Student", "email": email, "password": password},
    )
    assert response.status_code == 201
    return response.json()


def test_registration_hashes_password_and_returns_safe_student(
    auth_client: TestClient,
    test_session_factory: sessionmaker[Session],
) -> None:
    response = auth_client.post(
        "/api/auth/register",
        json={
            "name": "Test Student",
            "email": "  STUDENT@EXAMPLE.COM ",
            "password": "StrongPass123",
        },
    )

    assert response.status_code == 201
    user = response.json()
    assert user["email"] == "student@example.com"
    assert user["role"] == UserRole.STUDENT.value
    assert "password_hash" not in user
    assert "password" not in user
    with test_session_factory() as db:
        user = db.query(User).filter_by(email="student@example.com").one()
        assert user.password_hash != "StrongPass123"
        assert verify_password("StrongPass123", user.password_hash)


def test_registration_rejects_duplicate_email_case_insensitively(
    auth_client: TestClient,
) -> None:
    register_user(auth_client)

    response = auth_client.post(
        "/api/auth/register",
        json={
            "name": "Another Student",
            "email": "STUDENT@example.com",
            "password": "AnotherStrong123",
        },
    )

    assert response.status_code == 409


def test_registration_cannot_assign_an_admin_role(auth_client: TestClient) -> None:
    response = auth_client.post(
        "/api/auth/register",
        json={
            "name": "Test Student",
            "email": "student@example.com",
            "password": "StrongPass123",
            "role": UserRole.ADMIN.value,
        },
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("email", "password"),
    [
        ("not-an-email", "StrongPass123"),
        ("valid@example.com", "short"),
        ("valid@example.com", "é" * 37),
    ],
)
def test_registration_rejects_invalid_email_or_password(
    auth_client: TestClient,
    email: str,
    password: str,
) -> None:
    response = auth_client.post(
        "/api/auth/register",
        json={"name": "Test", "email": email, "password": password},
    )

    assert response.status_code == 422


def test_login_returns_token_with_required_claims(auth_client: TestClient) -> None:
    user = register_user(auth_client)

    response = auth_client.post(
        "/api/auth/login",
        json={"email": " STUDENT@example.com ", "password": "StrongPass123"},
    )

    assert response.status_code == 200
    result = response.json()
    assert result["token_type"] == "bearer"
    assert "password_hash" not in result["user"]
    claims = jwt.decode(result["access_token"], settings.SECRET_KEY, algorithms=[ALGORITHM])
    assert claims["sub"] == str(user["id"])
    assert claims["role"] == UserRole.STUDENT.value
    assert "exp" in claims


@pytest.mark.parametrize(
    ("email", "password"),
    [
        ("student@example.com", "WrongPassword123"),
        ("missing@example.com", "StrongPass123"),
    ],
)
def test_login_rejects_invalid_credentials(
    auth_client: TestClient,
    email: str,
    password: str,
) -> None:
    register_user(auth_client)

    response = auth_client.post(
        "/api/auth/login",
        json={"email": email, "password": password},
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password"


def test_me_accepts_valid_token_without_exposing_hash(auth_client: TestClient) -> None:
    register_user(auth_client)
    login = auth_client.post(
        "/api/auth/login",
        json={"email": "student@example.com", "password": "StrongPass123"},
    )

    response = auth_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {login.json()['access_token']}"},
    )

    assert response.status_code == 200
    assert response.json()["email"] == "student@example.com"
    assert "password_hash" not in response.json()


@pytest.mark.parametrize("authorization", [None, "Bearer malformed"])
def test_me_rejects_missing_and_malformed_token(
    auth_client: TestClient,
    authorization: str | None,
) -> None:
    headers = {} if authorization is None else {"Authorization": authorization}

    response = auth_client.get("/api/auth/me", headers=headers)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_me_rejects_expired_token(auth_client: TestClient) -> None:
    user = register_user(auth_client)
    token = create_access_token(
        int(user["id"]),
        UserRole.STUDENT.value,
        expires_delta=timedelta(seconds=-1),
    )

    response = auth_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_me_rejects_token_with_invalid_signature(auth_client: TestClient) -> None:
    user = register_user(auth_client)
    token = jwt.encode(
        {"sub": str(user["id"]), "role": UserRole.STUDENT.value},
        "not-the-configured-key",
        algorithm=ALGORITHM,
    )

    response = auth_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_me_rejects_token_without_expiration(auth_client: TestClient) -> None:
    user = register_user(auth_client)
    token = jwt.encode(
        {"sub": str(user["id"]), "role": UserRole.STUDENT.value},
        settings.SECRET_KEY,
        algorithm=ALGORITHM,
    )

    response = auth_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_me_rejects_token_with_role_different_from_database(
    auth_client: TestClient,
) -> None:
    user = register_user(auth_client)
    token = create_access_token(int(user["id"]), UserRole.ADMIN.value)

    response = auth_client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401


def test_student_is_forbidden_and_admin_is_authorized(
    auth_client: TestClient,
    test_session_factory: sessionmaker[Session],
) -> None:
    register_user(auth_client)
    student_token = auth_client.post(
        "/api/auth/login",
        json={"email": "student@example.com", "password": "StrongPass123"},
    ).json()["access_token"]

    student_response = auth_client.get(
        "/_test/admin",
        headers={"Authorization": f"Bearer {student_token}"},
    )
    assert student_response.status_code == 403

    with test_session_factory() as db:
        admin = User(
            name="Test Admin",
            email="admin@example.com",
            password_hash=hash_password("AdminPassword123"),
            role=UserRole.ADMIN.value,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        admin_id = admin.id

    admin_token = create_access_token(admin_id, UserRole.ADMIN.value)
    admin_response = auth_client.get(
        "/_test/admin",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert admin_response.status_code == 200
    assert admin_response.json() == {"user_id": admin_id}
