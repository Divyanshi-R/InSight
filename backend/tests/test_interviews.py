from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.database.models import Answer, InterviewSession, JobProfile, JobQuestion


@pytest.fixture
def interview_context(
    auth_test_context: tuple[TestClient, sessionmaker[Session]],
) -> tuple[TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]]:
    client, session_factory = auth_test_context

    def create_user(email: str) -> tuple[int, str]:
        registration = client.post(
            "/api/auth/register",
            json={
                "name": "Interview Test Student",
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


def create_profile_with_questions(
    client: TestClient,
    session_factory: sessionmaker[Session],
    token: str,
    approved_count: int = 3,
    unapproved_count: int = 1,
) -> int:
    profile_resp = client.post(
        "/api/job-profiles",
        json={
            "job_title": "Backend Engineer",
            "job_description": "Build high-performance FastAPI applications.",
            "experience_level": "Mid-level",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert profile_resp.status_code == 201
    profile_id = profile_resp.json()["id"]

    with session_factory() as db:
        for i in range(approved_count):
            db.add(
                JobQuestion(
                    job_profile_id=profile_id,
                    question=f"Approved Question {i + 1}: How does FastAPI handle dependencies?",
                    question_type="TECHNICAL",
                    difficulty="MEDIUM",
                    skill_tags=["FastAPI", "Python"],
                    generation_model="test-model",
                    generation_prompt_version="job-profile-v1",
                    approved_by_student=True,
                )
            )
        for i in range(unapproved_count):
            db.add(
                JobQuestion(
                    job_profile_id=profile_id,
                    question=f"Unapproved Question {i + 1}: Explain bubble sort.",
                    question_type="TECHNICAL",
                    difficulty="EASY",
                    skill_tags=["Algorithms"],
                    generation_model="test-model",
                    generation_prompt_version="job-profile-v1",
                    approved_by_student=False,
                )
            )
        db.commit()

    return profile_id


def test_authenticated_student_can_start_interview_with_approved_questions(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    user_id, token = create_user("start-interview@example.com")
    profile_id = create_profile_with_questions(
        client, session_factory, token, approved_count=2, unapproved_count=1
    )

    response = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    data = response.json()
    assert data["job_profile_id"] == profile_id
    assert data["job_title"] == "Backend Engineer"
    assert data["user_id"] == user_id
    assert data["status"] == "IN_PROGRESS"
    assert data["completed_at"] is None
    assert data["total_questions"] == 2
    assert data["answered_count"] == 0
    assert len(data["questions"]) == 2
    assert all(q["answered"] is False for q in data["questions"])
    assert all(q["answer"] is None for q in data["questions"])


def test_unauthenticated_user_cannot_start_interview(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, _, _ = interview_context
    response = client.post("/api/interviews", json={"job_profile_id": 1})
    assert response.status_code == 401


def test_student_cannot_start_interview_for_another_student_job_profile(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, owner_token = create_user("owner@example.com")
    _, other_token = create_user("other@example.com")
    profile_id = create_profile_with_questions(client, session_factory, owner_token)

    response = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Job profile not found"


def test_only_approved_questions_are_included(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, token = create_user("approved-only@example.com")
    profile_id = create_profile_with_questions(
        client, session_factory, token, approved_count=3, unapproved_count=2
    )

    response = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    questions = response.json()["questions"]
    assert len(questions) == 3
    assert all("Approved Question" in q["question"] for q in questions)
    assert not any("Unapproved Question" in q["question"] for q in questions)


def test_no_approved_questions_returns_controlled_error(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, token = create_user("no-approved@example.com")
    profile_id = create_profile_with_questions(
        client, session_factory, token, approved_count=0, unapproved_count=2
    )

    response = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400
    assert "approved questions" in response.json()["detail"]


def test_interview_session_can_be_retrieved_by_its_owner(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, token = create_user("retrieve-owner@example.com")
    profile_id = create_profile_with_questions(client, session_factory, token)

    started = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    response = client.get(
        f"/api/interviews/{started['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == started["id"]
    assert data["job_title"] == "Backend Engineer"
    assert data["total_questions"] == 3


def test_another_student_cannot_retrieve_the_session(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, owner_token = create_user("session-owner@example.com")
    _, other_token = create_user("session-foreign@example.com")
    profile_id = create_profile_with_questions(client, session_factory, owner_token)

    started = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {owner_token}"},
    ).json()

    response = client.get(
        f"/api/interviews/{started['id']}",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Interview session not found"


def test_unauthenticated_user_cannot_retrieve_interview_session(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, token = create_user("unauth-get@example.com")
    profile_id = create_profile_with_questions(client, session_factory, token)

    started = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    response = client.get(f"/api/interviews/{started['id']}")
    assert response.status_code == 401


def test_answer_can_be_created_and_persisted(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, token = create_user("answer-create@example.com")
    profile_id = create_profile_with_questions(client, session_factory, token)

    started = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    q_id = started["questions"][0]["id"]

    answer_resp = client.put(
        f"/api/interviews/{started['id']}/answers/{q_id}",
        json={"answer_text": "FastAPI uses Starlette and Pydantic for fast async APIs."},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert answer_resp.status_code == 200
    assert answer_resp.json()["answered"] is True
    assert (
        answer_resp.json()["answer"]
        == "FastAPI uses Starlette and Pydantic for fast async APIs."
    )

    # Verify session retrieval reflects the answer
    retrieved = client.get(
        f"/api/interviews/{started['id']}",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    assert retrieved["answered_count"] == 1
    answered_q = next(q for q in retrieved["questions"] if q["id"] == q_id)
    assert answered_q["answered"] is True
    assert answered_q["answer"] == "FastAPI uses Starlette and Pydantic for fast async APIs."

    with session_factory() as db:
        saved_ans = db.scalar(
            select(Answer).where(
                Answer.session_id == started["id"],
                Answer.job_question_id == q_id,
            )
        )
        assert saved_ans is not None
        assert saved_ans.transcript == "FastAPI uses Starlette and Pydantic for fast async APIs."


def test_answer_can_be_updated(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, token = create_user("answer-update@example.com")
    profile_id = create_profile_with_questions(client, session_factory, token)

    started = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    q_id = started["questions"][0]["id"]

    client.put(
        f"/api/interviews/{started['id']}/answers/{q_id}",
        json={"answer_text": "Initial answer."},
        headers={"Authorization": f"Bearer {token}"},
    )
    update_resp = client.put(
        f"/api/interviews/{started['id']}/answers/{q_id}",
        json={"answer_text": "Refined and improved answer."},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert update_resp.status_code == 200
    assert update_resp.json()["answer"] == "Refined and improved answer."
    assert update_resp.json()["answered"] is True


def test_another_student_cannot_modify_answer(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, owner_token = create_user("ans-owner@example.com")
    _, other_token = create_user("ans-other@example.com")
    profile_id = create_profile_with_questions(client, session_factory, owner_token)

    started = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {owner_token}"},
    ).json()
    q_id = started["questions"][0]["id"]

    response = client.put(
        f"/api/interviews/{started['id']}/answers/{q_id}",
        json={"answer_text": "Malicious attempt."},
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Interview session not found"


def test_completed_interview_cannot_have_answers_modified(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, token = create_user("locked-session@example.com")
    profile_id = create_profile_with_questions(client, session_factory, token)

    started = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    q_id = started["questions"][0]["id"]

    # Finish the session
    client.post(
        f"/api/interviews/{started['id']}/complete",
        headers={"Authorization": f"Bearer {token}"},
    )

    # Attempt to modify an answer on completed session
    response = client.put(
        f"/api/interviews/{started['id']}/answers/{q_id}",
        json={"answer_text": "Post-completion modification."},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 400
    assert "completed" in response.json()["detail"].lower()


def test_interview_can_be_completed_by_its_owner(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, token = create_user("finish-owner@example.com")
    profile_id = create_profile_with_questions(client, session_factory, token)

    started = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    response = client.post(
        f"/api/interviews/{started['id']}/complete",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "COMPLETED"
    assert data["completed_at"] is not None


def test_another_student_cannot_complete_session(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, owner_token = create_user("finish-real@example.com")
    _, other_token = create_user("finish-thief@example.com")
    profile_id = create_profile_with_questions(client, session_factory, owner_token)

    started = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {owner_token}"},
    ).json()

    response = client.post(
        f"/api/interviews/{started['id']}/complete",
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Interview session not found"


def test_unauthenticated_user_cannot_complete_session(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, token = create_user("unauth-finish@example.com")
    profile_id = create_profile_with_questions(client, session_factory, token)

    started = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    response = client.post(f"/api/interviews/{started['id']}/complete")
    assert response.status_code == 401


def test_cannot_answer_question_not_in_interview_session(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, token = create_user("wrong-q@example.com")
    profile_id = create_profile_with_questions(client, session_factory, token)

    started = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    response = client.put(
        f"/api/interviews/{started['id']}/answers/99999",
        json={"answer_text": "Answer to nonexistent question."},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


def test_student_can_list_their_interview_sessions(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, token = create_user("list-sessions@example.com")
    profile_id = create_profile_with_questions(client, session_factory, token)

    client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    )

    response = client.get(
        "/api/interviews",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    sessions = response.json()
    assert len(sessions) == 2
    assert sessions[0]["job_title"] == "Backend Engineer"


def test_interview_session_reflects_in_dashboard_summary_and_recent(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, token = create_user("dashboard-cohesion@example.com")
    profile_id = create_profile_with_questions(client, session_factory, token)

    # Before starting
    summary_before = client.get(
        "/api/dashboard/summary",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    assert summary_before["total_sessions"] == 0
    assert summary_before["in_progress_sessions"] == 0

    # Start session
    session_data = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    summary_in_progress = client.get(
        "/api/dashboard/summary",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    assert summary_in_progress["total_sessions"] == 1
    assert summary_in_progress["in_progress_sessions"] == 1
    assert summary_in_progress["completed_sessions"] == 0

    recent_sessions = client.get(
        "/api/dashboard/recent",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    assert len(recent_sessions) == 1
    assert recent_sessions[0]["id"] == session_data["id"]
    assert recent_sessions[0]["status"] == "IN_PROGRESS"

    # Complete session
    client.post(
        f"/api/interviews/{session_data['id']}/complete",
        headers={"Authorization": f"Bearer {token}"},
    )

    summary_after = client.get(
        "/api/dashboard/summary",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    assert summary_after["total_sessions"] == 1
    assert summary_after["in_progress_sessions"] == 0
    assert summary_after["completed_sessions"] == 1


def test_speech_analysis_metrics_computation() -> None:
    from app.services.speech_analysis_service import (
        analyze_speech,
        calculate_words_per_minute,
        count_words,
        find_filler_words,
    )

    # Word count
    assert count_words("") == 0
    assert count_words("   ") == 0
    assert count_words("one two three") == 3

    # WPM
    assert calculate_words_per_minute(100, 60.0) == 100.0
    assert calculate_words_per_minute(60, 30.0) == 120.0
    assert calculate_words_per_minute(0, 30.0) is None
    assert calculate_words_per_minute(60, 0.0) is None
    assert calculate_words_per_minute(60, None) is None

    # Filler words - whole word regex matching (no substring false positives)
    text = "Um, I think that like, basically we should literally use it, you know? But summer is warm."
    fillers = find_filler_words(text)
    assert fillers.get("um") == 1
    assert fillers.get("like") == 1
    assert fillers.get("basically") == 1
    assert fillers.get("literally") == 1
    assert fillers.get("you know") == 1
    # 'summer' should NOT trigger 'um'
    assert fillers.get("um") == 1

    # Full analysis
    result = analyze_speech(
        "Um, FastAPI makes async endpoints very efficient, you know.",
        duration_seconds=15.0,
    )
    assert result["word_count"] == 9
    assert result["duration_seconds"] == 15.0
    assert result["words_per_minute"] == 36.0
    assert result["filler_words_count"] == 2
    assert "um" in result["filler_words"]
    assert "you know" in result["filler_words"]
    assert result["pause_analysis"] == "Pause analysis is not yet available"


def test_saving_answer_with_duration_persists_and_returns_speech_metrics(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    from decimal import Decimal

    client, create_user, session_factory = interview_context
    _, token = create_user("speech-answer@example.com")
    profile_id = create_profile_with_questions(client, session_factory, token)

    session_resp = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert session_resp.status_code == 201
    session_data = session_resp.json()
    first_q_id = session_data["questions"][0]["id"]

    answer_text = (
        "Um, FastAPI integrates with Pydantic for validation, and actually it is very fast."
    )
    save_resp = client.put(
        f"/api/interviews/{session_data['id']}/answers/{first_q_id}",
        json={"answer_text": answer_text, "duration_seconds": 25.5},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert save_resp.status_code == 200
    saved = save_resp.json()
    assert saved["question_id"] == first_q_id
    assert saved["answer"] == answer_text
    assert saved["answered"] is True
    assert saved["duration_seconds"] == 25.5

    metrics = saved["speech_metrics"]
    assert metrics is not None
    assert metrics["word_count"] == 13
    assert metrics["duration_seconds"] == 25.5
    assert metrics["words_per_minute"] == 30.6
    assert metrics["filler_words_count"] >= 2  # 'um', 'actually'
    assert metrics["pause_analysis"] == "Pause analysis is not yet available"

    # Verify persistence in MySQL / DB
    with session_factory() as db:
        answer_row = db.scalar(
            select(Answer).where(
                Answer.session_id == session_data["id"],
                Answer.job_question_id == first_q_id,
            )
        )
        assert answer_row is not None
        assert answer_row.transcript == answer_text
        assert answer_row.duration_seconds == Decimal("25.50")


def test_saving_answer_without_duration_remains_backward_compatible(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, token = create_user("backward-compat-answer@example.com")
    profile_id = create_profile_with_questions(client, session_factory, token)

    session_data = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    first_q_id = session_data["questions"][0]["id"]

    save_resp = client.put(
        f"/api/interviews/{session_data['id']}/answers/{first_q_id}",
        json={"answer_text": "Written text answer without voice recording duration."},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert save_resp.status_code == 200
    saved = save_resp.json()
    assert saved["duration_seconds"] is None
    assert saved["speech_metrics"]["duration_seconds"] is None
    assert saved["speech_metrics"]["words_per_minute"] is None
    assert saved["speech_metrics"]["word_count"] == 7


def test_get_interview_includes_speech_metrics_for_answered_questions(
    interview_context: tuple[
        TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]
    ],
) -> None:
    client, create_user, session_factory = interview_context
    _, token = create_user("interview-metrics-get@example.com")
    profile_id = create_profile_with_questions(client, session_factory, token)

    session_data = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    q_id = session_data["questions"][0]["id"]

    client.put(
        f"/api/interviews/{session_data['id']}/answers/{q_id}",
        json={
            "answer_text": "Like, we can use dependency injection to decouple components.",
            "duration_seconds": 12.0,
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    get_resp = client.get(
        f"/api/interviews/{session_data['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert get_resp.status_code == 200
    questions = get_resp.json()["questions"]
    answered_q = [q for q in questions if q["id"] == q_id][0]
    assert answered_q["duration_seconds"] == 12.0
    assert answered_q["speech_metrics"] is not None
    assert answered_q["speech_metrics"]["words_per_minute"] == 45.0
    assert answered_q["speech_metrics"]["filler_words_count"] >= 1
