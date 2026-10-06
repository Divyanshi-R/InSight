from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.database.models import JobProfile


@pytest.fixture
def job_profile_context(
    auth_test_context: tuple[TestClient, sessionmaker[Session]],
) -> tuple[TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]]:
    client, session_factory = auth_test_context

    def create_user(email: str) -> tuple[int, str]:
        registration = client.post(
            "/api/auth/register",
            json={
                "name": "Job Profile Student",
                "email": email,
                "password": "StrongPass123",
            },
        )
        assert registration.status_code == 201
        login = client.post(
            "/api/auth/login",
            json={"email": email, "password": "StrongPass123"},
        )
        assert login.status_code == 200
        return registration.json()["id"], login.json()["access_token"]

    return client, create_user, session_factory


def create_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "job_title": "Software Engineer",
        "job_description": "Build and maintain reliable software services.",
        "experience_level": "Entry level",
    }
    payload.update(overrides)
    return payload


def test_authenticated_user_can_create_profile_and_it_persists(
    job_profile_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, session_factory = job_profile_context
    user_id, token = create_user("create-profile@example.com")

    response = client.post(
        "/api/job-profiles",
        json=create_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    result = response.json()
    assert result["user_id"] == user_id
    assert result["job_title"] == "Software Engineer"
    assert result["experience_level"] == "Entry level"
    assert result["id"] > 0
    assert result["created_at"]
    assert result["updated_at"]

    with session_factory() as db:
        persisted = db.scalar(select(JobProfile).where(JobProfile.id == result["id"]))
        assert persisted is not None
        assert persisted.user_id == user_id
        assert persisted.job_description == "Build and maintain reliable software services."


def test_unauthenticated_user_cannot_create_profile(
    job_profile_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, _, _ = job_profile_context

    response = client.post("/api/job-profiles", json=create_payload())

    assert response.status_code == 401


def test_user_can_list_only_their_own_profiles(
    job_profile_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, _ = job_profile_context
    user_a_id, token_a = create_user("owner-a@example.com")
    _, token_b = create_user("owner-b@example.com")

    created_a = client.post(
        "/api/job-profiles",
        json=create_payload(job_title="Frontend Developer"),
        headers={"Authorization": f"Bearer {token_a}"},
    )
    created_b = client.post(
        "/api/job-profiles",
        json=create_payload(job_title="Backend Developer"),
        headers={"Authorization": f"Bearer {token_b}"},
    )
    assert created_a.status_code == created_b.status_code == 201

    response = client.get(
        "/api/job-profiles",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert response.status_code == 200
    assert [profile["id"] for profile in response.json()] == [created_a.json()["id"]]
    assert response.json()[0]["user_id"] == user_a_id


def test_user_can_retrieve_their_own_profile(
    job_profile_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, _ = job_profile_context
    _, token = create_user("retrieve-own@example.com")
    created = client.post(
        "/api/job-profiles",
        json=create_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )

    response = client.get(
        f"/api/job-profiles/{created.json()['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["job_title"] == "Software Engineer"


def test_user_cannot_retrieve_another_users_profile(
    job_profile_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, _ = job_profile_context
    _, token_a = create_user("retrieve-a@example.com")
    _, token_b = create_user("retrieve-b@example.com")
    created = client.post(
        "/api/job-profiles",
        json=create_payload(),
        headers={"Authorization": f"Bearer {token_b}"},
    )

    response = client.get(
        f"/api/job-profiles/{created.json()['id']}",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Job profile not found"


def test_user_can_delete_their_own_profile(
    job_profile_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, session_factory = job_profile_context
    _, token = create_user("delete-own@example.com")
    created = client.post(
        "/api/job-profiles",
        json=create_payload(),
        headers={"Authorization": f"Bearer {token}"},
    )
    profile_id = created.json()["id"]

    response = client.delete(
        f"/api/job-profiles/{profile_id}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 204
    with session_factory() as db:
        assert db.get(JobProfile, profile_id) is None


def test_user_cannot_delete_another_users_profile(
    job_profile_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, session_factory = job_profile_context
    _, token_a = create_user("delete-a@example.com")
    _, token_b = create_user("delete-b@example.com")
    created = client.post(
        "/api/job-profiles",
        json=create_payload(),
        headers={"Authorization": f"Bearer {token_b}"},
    )
    profile_id = created.json()["id"]

    response = client.delete(
        f"/api/job-profiles/{profile_id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert response.status_code == 404
    with session_factory() as db:
        assert db.get(JobProfile, profile_id) is not None


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("job_title", "   "),
        ("job_description", " \n\t "),
    ],
)
def test_blank_title_and_description_are_rejected(
    job_profile_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
    field: str,
    value: str,
) -> None:
    client, create_user, _ = job_profile_context
    _, token = create_user(f"invalid-{field}@example.com")
    payload = create_payload(**{field: value})

    response = client.post(
        "/api/job-profiles",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422


def test_experience_level_is_optional(
    job_profile_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, _ = job_profile_context
    _, token = create_user("optional-experience@example.com")
    payload = create_payload()
    del payload["experience_level"]

    response = client.post(
        "/api/job-profiles",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    assert response.json()["experience_level"] is None


def test_user_id_cannot_be_overridden_in_create_request(
    job_profile_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, _ = job_profile_context
    _, token = create_user("no-owner-override@example.com")

    response = client.post(
        "/api/job-profiles",
        json=create_payload(user_id=99999),
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422
