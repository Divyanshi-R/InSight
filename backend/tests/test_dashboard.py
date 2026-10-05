from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.core.security import create_access_token
from app.database.models import Answer, Evaluation, InterviewSession, Question, User


@pytest.fixture
def dashboard_client(
    auth_test_context: tuple[TestClient, sessionmaker[Session]],
) -> TestClient:
    return auth_test_context[0]


@pytest.fixture
def dashboard_session_factory(
    auth_test_context: tuple[TestClient, sessionmaker[Session]],
) -> sessionmaker[Session]:
    return auth_test_context[1]


def create_user(client: TestClient, email: str) -> tuple[int, str]:
    response = client.post(
        "/api/auth/register",
        json={"name": "Dashboard Student", "email": email, "password": "StrongPass123"},
    )
    assert response.status_code == 201
    user_id = response.json()["id"]
    token = client.post(
        "/api/auth/login",
        json={"email": email, "password": "StrongPass123"},
    ).json()["access_token"]
    return user_id, token


def add_session(
    session_factory: sessionmaker[Session],
    user_id: int,
    started_at: datetime,
    status: str = "IN_PROGRESS",
    score: Decimal | None = None,
) -> InterviewSession:
    with session_factory() as db:
        interview_session = InterviewSession(
            user_id=user_id,
            started_at=started_at,
            status=status,
        )
        db.add(interview_session)
        if score is not None:
            question = Question(
                category="Testing",
                question_type="TECHNICAL",
                question_text=f"Dashboard score question {started_at.isoformat()}",
                difficulty="EASY",
            )
            answer = Answer(question=question)
            answer.evaluation = Evaluation(overall_score=score)
            interview_session.answers.append(answer)
            db.add(question)
        db.commit()
        db.refresh(interview_session)
        return interview_session


def test_empty_dashboard_has_zero_counts_null_average_and_no_recent_sessions(
    dashboard_client: TestClient,
) -> None:
    _, token = create_user(dashboard_client, "empty@example.com")
    headers = {"Authorization": f"Bearer {token}"}

    summary = dashboard_client.get("/api/dashboard/summary", headers=headers)
    recent = dashboard_client.get("/api/dashboard/recent", headers=headers)

    assert summary.status_code == 200
    assert summary.json() == {
        "total_sessions": 0,
        "completed_sessions": 0,
        "in_progress_sessions": 0,
        "average_score": None,
    }
    assert recent.status_code == 200
    assert recent.json() == []


@pytest.mark.parametrize("endpoint", ["/api/dashboard/summary", "/api/dashboard/recent"])
def test_dashboard_endpoints_require_authentication(
    dashboard_client: TestClient,
    endpoint: str,
) -> None:
    response = dashboard_client.get(endpoint)

    assert response.status_code == 401


def test_dashboard_summary_is_scoped_to_authenticated_user(
    dashboard_client: TestClient,
    dashboard_session_factory: sessionmaker[Session],
) -> None:
    user_a_id, token_a = create_user(dashboard_client, "user-a@example.com")
    user_b_id, _ = create_user(dashboard_client, "user-b@example.com")
    now = datetime(2026, 1, 1, 12, 0)
    add_session(dashboard_session_factory, user_a_id, now, "COMPLETED", Decimal("88.50"))
    add_session(dashboard_session_factory, user_b_id, now + timedelta(minutes=1))

    response = dashboard_client.get(
        "/api/dashboard/summary",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert response.status_code == 200
    result = response.json()
    assert {
        "total_sessions": result["total_sessions"],
        "completed_sessions": result["completed_sessions"],
        "in_progress_sessions": result["in_progress_sessions"],
    } == {
        "total_sessions": 1,
        "completed_sessions": 1,
        "in_progress_sessions": 0,
    }
    assert Decimal(result["average_score"]) == Decimal("88.50")


def test_recent_sessions_are_user_scoped_and_ordered_newest_first(
    dashboard_client: TestClient,
    dashboard_session_factory: sessionmaker[Session],
) -> None:
    user_a_id, token_a = create_user(dashboard_client, "recent-a@example.com")
    user_b_id, _ = create_user(dashboard_client, "recent-b@example.com")
    base_time = datetime(2026, 2, 1, 9, 0)
    older = add_session(dashboard_session_factory, user_a_id, base_time)
    newer = add_session(dashboard_session_factory, user_a_id, base_time + timedelta(hours=1))
    add_session(dashboard_session_factory, user_b_id, base_time + timedelta(hours=2))

    response = dashboard_client.get(
        "/api/dashboard/recent",
        headers={"Authorization": f"Bearer {token_a}"},
    )

    assert response.status_code == 200
    sessions = response.json()
    assert [session["id"] for session in sessions] == [newer.id, older.id]
    assert [session["status"] for session in sessions] == [
        "IN_PROGRESS",
        "IN_PROGRESS",
    ]


def test_average_score_is_null_when_user_sessions_have_no_evaluations(
    dashboard_client: TestClient,
    dashboard_session_factory: sessionmaker[Session],
) -> None:
    user_id, token = create_user(dashboard_client, "no-score@example.com")
    add_session(dashboard_session_factory, user_id, datetime(2026, 3, 1, 9, 0))

    response = dashboard_client.get(
        "/api/dashboard/summary",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["average_score"] is None
    assert response.json()["total_sessions"] == 1
