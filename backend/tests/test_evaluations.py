import json
from decimal import Decimal
from unittest.mock import MagicMock, patch

from pydantic import SecretStr
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.database.models import Answer, Evaluation, InterviewSession, JobProfile, JobQuestion
from app.schemas.evaluation import AnswerEvaluationResult
from app.services.evaluation_service import (
    AnswerEvaluator,
    AnswerNotFound,
    EvaluationAnswerEmpty,
    EvaluationServiceError,
    EvaluationServiceUnavailable,
    OpenAICompatibleAnswerEvaluator,
    calculate_overall_score,
)


@pytest.fixture
def eval_context(
    auth_test_context: tuple[TestClient, sessionmaker[Session]],
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[TestClient, sessionmaker[Session], str, int, int]:
    """Sets up an authenticated candidate with a profile, 2 questions, and a started interview."""
    monkeypatch.setattr(settings, "AI_API_KEY", SecretStr("test-secret-key-eval"))
    monkeypatch.setattr(settings, "AI_PROVIDER", "openai_compatible")

    client, session_factory = auth_test_context

    reg = client.post(
        "/api/auth/register",
        json={"name": "Eval Candidate", "email": "candidate@insight.test", "password": "Password123"},
    )
    assert reg.status_code == 201

    login = client.post(
        "/api/auth/login",
        json={"email": "candidate@insight.test", "password": "Password123"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]

    prof_resp = client.post(
        "/api/job-profiles",
        json={
            "job_title": "Full Stack Engineer",
            "job_description": "React, Python, SQL development.",
            "experience_level": "Mid-level",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert prof_resp.status_code == 201
    profile_id = prof_resp.json()["id"]

    with session_factory() as db:
        q1 = JobQuestion(
            job_profile_id=profile_id,
            question="Describe how you structure a scalable REST API.",
            question_type="TECHNICAL",
            difficulty="MEDIUM",
            skill_tags=["FastAPI", "Python"],
            generation_model="test-model",
            generation_prompt_version="job-profile-v1",
            approved_by_student=True,
        )
        q2 = JobQuestion(
            job_profile_id=profile_id,
            question="Tell me about a time you handled a production outage.",
            question_type="SCENARIO",
            difficulty="HARD",
            skill_tags=["DevOps", "Incident Management"],
            generation_model="test-model",
            generation_prompt_version="job-profile-v1",
            approved_by_student=True,
        )

        db.add_all([q1, q2])
        db.commit()
        db.refresh(q1)
        db.refresh(q2)
        q1_id = q1.id
        q2_id = q2.id

    start_resp = client.post(
        "/api/interviews",
        json={"job_profile_id": profile_id},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert start_resp.status_code == 201
    session_id = start_resp.json()["id"]

    return client, session_factory, token, session_id, q1_id


def test_rubric_aggregation_formula():
    """Verify exact weighted rubric calculation: 30% relevance, 25% completeness, 25% clarity, 20% structure."""
    score = calculate_overall_score(
        relevance=Decimal("85.00"),
        completeness=Decimal("80.00"),
        clarity=Decimal("90.00"),
        structure=Decimal("75.00"),
    )
    # 0.30 * 85 + 0.25 * 80 + 0.25 * 90 + 0.20 * 75 = 25.5 + 20 + 22.5 + 15 = 83.00
    assert score == Decimal("83.00")

    # Min boundary
    assert calculate_overall_score(Decimal(0), Decimal(0), Decimal(0), Decimal(0)) == Decimal("0.00")
    # Max boundary
    assert calculate_overall_score(Decimal(100), Decimal(100), Decimal(100), Decimal(100)) == Decimal("100.00")


def test_evaluate_single_answer_success(eval_context):
    client, session_factory, token, session_id, q1_id = eval_context

    # Save a candidate answer
    save_resp = client.put(
        f"/api/interviews/{session_id}/answers/{q1_id}",
        json={
            "answer_text": "I design APIs by separating routing, business services, and database layers, using OpenAPI contracts.",
            "duration_seconds": 45.0,
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert save_resp.status_code == 200

    mock_llm_output = {
        "choices": [
            {
                "message": {
                    "content": json.dumps({
                        "relevance_score": 88,
                        "completeness_score": 84,
                        "clarity_score": 92,
                        "structure_score": 80,
                        "feedback": "Candidate explicitly noted 'separating routing, business services, and database layers' which demonstrates modular architecture principles.",
                        "strengths": "Clear architectural separation and mention of OpenAPI contracts.",
                        "improvements": "Discuss database transaction boundaries and error handling protocols.",
                    })
                }
            }
        ]
    }

    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps(mock_llm_output).encode("utf-8")
    mock_response.__enter__.return_value = mock_response

    with patch("app.services.evaluation_service.urlopen", return_value=mock_response):
        eval_resp = client.post(
            f"/api/interviews/{session_id}/answers/{q1_id}/evaluate",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert eval_resp.status_code == 200
    data = eval_resp.json()
    assert float(data["relevance_score"]) == 88.0
    assert float(data["completeness_score"]) == 84.0
    assert float(data["clarity_score"]) == 92.0
    assert float(data["structure_score"]) == 80.0
    # Expected overall: 0.30*88 + 0.25*84 + 0.25*92 + 0.20*80 = 26.4 + 21 + 23 + 16 = 86.40
    assert float(data["overall_score"]) == 86.40
    assert "separating routing" in data["feedback"]
    assert "architectural separation" in data["strengths"]
    assert "error handling" in data["improvements"]

    # Verify database persistence
    with session_factory() as db:
        eval_record = db.scalar(select(Evaluation))
        assert eval_record is not None
        assert eval_record.overall_score == Decimal("86.40")


def test_evaluate_session_success_and_score_aggregation(eval_context):
    client, session_factory, token, session_id, q1_id = eval_context

    with session_factory() as db:
        answers = db.scalars(select(Answer).where(Answer.session_id == session_id)).all()
        q2_id = [a.job_question_id for a in answers if a.job_question_id != q1_id][0]

    # Save answers for both questions
    client.put(
        f"/api/interviews/{session_id}/answers/{q1_id}",
        json={"answer_text": "Answer for question 1 on API design.", "duration_seconds": 30.0},
        headers={"Authorization": f"Bearer {token}"},
    )
    client.put(
        f"/api/interviews/{session_id}/answers/{q2_id}",
        json={"answer_text": "Answer for question 2 on incident management.", "duration_seconds": 40.0},
        headers={"Authorization": f"Bearer {token}"},
    )

    responses = [
        # Call 1 for Q1 (overall: 80.00)
        {
            "choices": [{
                "message": {
                    "content": json.dumps({
                        "relevance_score": 80,
                        "completeness_score": 80,
                        "clarity_score": 80,
                        "structure_score": 80,
                        "feedback": "Direct answer regarding API design.",
                        "strengths": "Solid understanding of endpoints.",
                        "improvements": "Elaborate on pagination.",
                    })
                }
            }]
        },
        # Call 2 for Q2 (overall: 90.00)
        {
            "choices": [{
                "message": {
                    "content": json.dumps({
                        "relevance_score": 90,
                        "completeness_score": 90,
                        "clarity_score": 90,
                        "structure_score": 90,
                        "feedback": "Exemplary incident resolution explanation.",
                        "strengths": "Calm root-cause troubleshooting.",
                        "improvements": "Discuss post-mortem automation.",
                    })
                }
            }]
        },
    ]

    mock_resp1 = MagicMock()
    mock_resp1.read.return_value = json.dumps(responses[0]).encode("utf-8")
    mock_resp1.__enter__.return_value = mock_resp1

    mock_resp2 = MagicMock()
    mock_resp2.read.return_value = json.dumps(responses[1]).encode("utf-8")
    mock_resp2.__enter__.return_value = mock_resp2

    with patch("app.services.evaluation_service.urlopen", side_effect=[mock_resp1, mock_resp2]):
        eval_resp = client.post(
            f"/api/interviews/{session_id}/evaluate",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert eval_resp.status_code == 200
    session_eval = eval_resp.json()
    assert session_eval["evaluated_count"] == 2
    # Mean of 80.00 and 90.00 is 85.00
    assert float(session_eval["average_score"]) == 85.00

    # Verify GET /api/interviews/{session_id} includes session score and individual evaluations
    session_details = client.get(
        f"/api/interviews/{session_id}",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    assert float(session_details["score"]) == 85.00
    assert session_details["questions"][0]["evaluation"] is not None
    assert session_details["questions"][1]["evaluation"] is not None

    # Verify GET /api/interviews/{session_id}/evaluation endpoint
    summary_eval = client.get(
        f"/api/interviews/{session_id}/evaluation",
        headers={"Authorization": f"Bearer {token}"},
    ).json()
    assert float(summary_eval["average_score"]) == 85.00
    assert len(summary_eval["evaluations"]) == 2


def test_re_evaluation_updates_existing_record_without_duplicate(eval_context):
    client, session_factory, token, session_id, q1_id = eval_context

    client.put(
        f"/api/interviews/{session_id}/answers/{q1_id}",
        json={"answer_text": "First iteration answer.", "duration_seconds": 25.0},
        headers={"Authorization": f"Bearer {token}"},
    )

    out1 = {
        "choices": [{
            "message": {
                "content": json.dumps({
                    "relevance_score": 60, "completeness_score": 60, "clarity_score": 60, "structure_score": 60,
                    "feedback": "Initial feedback.", "strengths": "Initial strengths.", "improvements": "Initial improvements.",
                })
            }
        }]
    }
    out2 = {
        "choices": [{
            "message": {
                "content": json.dumps({
                    "relevance_score": 95, "completeness_score": 95, "clarity_score": 95, "structure_score": 95,
                    "feedback": "Refined feedback.", "strengths": "Refined strengths.", "improvements": "Refined improvements.",
                })
            }
        }]
    }

    mock_resp1 = MagicMock()
    mock_resp1.read.return_value = json.dumps(out1).encode("utf-8")
    mock_resp1.__enter__.return_value = mock_resp1

    mock_resp2 = MagicMock()
    mock_resp2.read.return_value = json.dumps(out2).encode("utf-8")
    mock_resp2.__enter__.return_value = mock_resp2

    with patch("app.services.evaluation_service.urlopen", side_effect=[mock_resp1, mock_resp2]):
        resp1 = client.post(
            f"/api/interviews/{session_id}/answers/{q1_id}/evaluate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp1.status_code == 200
        assert float(resp1.json()["overall_score"]) == 60.0

        resp2 = client.post(
            f"/api/interviews/{session_id}/answers/{q1_id}/evaluate",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp2.status_code == 200
        assert float(resp2.json()["overall_score"]) == 95.0

    with session_factory() as db:
        records = db.scalars(select(Evaluation)).all()
        assert len(records) == 1
        assert records[0].overall_score == Decimal("95.00")


def test_malformed_ai_output_rejected(eval_context):
    client, session_factory, token, session_id, q1_id = eval_context

    client.put(
        f"/api/interviews/{session_id}/answers/{q1_id}",
        json={"answer_text": "A valid answer.", "duration_seconds": 15.0},
        headers={"Authorization": f"Bearer {token}"},
    )

    # Output missing feedback field
    bad_output = {
        "choices": [{
            "message": {
                "content": json.dumps({
                    "relevance_score": 75,
                    "completeness_score": 75,
                    "clarity_score": 75,
                    "structure_score": 75,
                    # missing feedback, strengths, improvements
                })
            }
        }]
    }

    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(bad_output).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("app.services.evaluation_service.urlopen", return_value=mock_resp):
        resp = client.post(
            f"/api/interviews/{session_id}/answers/{q1_id}/evaluate",
            headers={"Authorization": f"Bearer {token}"},
        )

    # 502 Bad Gateway when provider returns malformed response
    assert resp.status_code == 502
    assert "invalid evaluation response" in resp.json()["detail"].lower()

    # Nothing persisted
    with session_factory() as db:
        assert db.scalar(select(Evaluation)) is None


def test_score_bounds_validation(eval_context):
    client, session_factory, token, session_id, q1_id = eval_context

    client.put(
        f"/api/interviews/{session_id}/answers/{q1_id}",
        json={"answer_text": "Another test answer.", "duration_seconds": 20.0},
        headers={"Authorization": f"Bearer {token}"},
    )

    out_of_bounds = {
        "choices": [{
            "message": {
                "content": json.dumps({
                    "relevance_score": 150,  # Invalid: > 100
                    "completeness_score": 80,
                    "clarity_score": 80,
                    "structure_score": 80,
                    "feedback": "This score is out of bounds.",
                    "strengths": "Some strengths.",
                    "improvements": "Some improvements.",
                })
            }
        }]
    }

    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(out_of_bounds).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("app.services.evaluation_service.urlopen", return_value=mock_resp):
        resp = client.post(
            f"/api/interviews/{session_id}/answers/{q1_id}/evaluate",
            headers={"Authorization": f"Bearer {token}"},
        )

    assert resp.status_code == 502
    with session_factory() as db:
        assert db.scalar(select(Evaluation)) is None


def test_empty_answer_rejected(eval_context):
    client, _, token, session_id, q1_id = eval_context

    # Don't save an answer (empty)
    resp = client.post(
        f"/api/interviews/{session_id}/answers/{q1_id}/evaluate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400
    assert "transcript is empty" in resp.json()["detail"].lower()

    # Evaluating a session where no answers are given
    sess_resp = client.post(
        f"/api/interviews/{session_id}/evaluate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert sess_resp.status_code == 400
    assert "no answered questions" in sess_resp.json()["detail"].lower()


def test_user_ownership_security(eval_context):
    client, _, token1, session_id, q1_id = eval_context

    # Register candidate 2
    client.post(
        "/api/auth/register",
        json={"name": "Candidate Two", "email": "candidate2@insight.test", "password": "Password123"},
    )
    login2 = client.post(
        "/api/auth/login",
        json={"email": "candidate2@insight.test", "password": "Password123"},
    )
    token2 = login2.json()["access_token"]

    # Candidate 2 cannot evaluate Candidate 1's answer or session
    resp1 = client.post(
        f"/api/interviews/{session_id}/answers/{q1_id}/evaluate",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert resp1.status_code == 404

    resp2 = client.post(
        f"/api/interviews/{session_id}/evaluate",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert resp2.status_code == 404

    resp3 = client.get(
        f"/api/interviews/{session_id}/evaluation",
        headers={"Authorization": f"Bearer {token2}"},
    )
    assert resp3.status_code == 404


def test_speech_delivery_metrics_remain_separate(eval_context):
    """Confirm speech delivery metrics (WPM, fillers) are computed independently from evaluation scores."""
    client, _, token, session_id, q1_id = eval_context

    client.put(
        f"/api/interviews/{session_id}/answers/{q1_id}",
        json={
            "answer_text": "Um, basically, like, I write Python code um every single day.",
            "duration_seconds": 10.0,
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    mock_llm_output = {
        "choices": [{
            "message": {
                "content": json.dumps({
                    "relevance_score": 70,
                    "completeness_score": 60,
                    "clarity_score": 65,
                    "structure_score": 60,
                    "feedback": "Candidate mentioned writing Python code daily.",
                    "strengths": "Daily programming practice.",
                    "improvements": "Elaborate with concrete projects.",
                })
            }
        }]
    }

    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(mock_llm_output).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("app.services.evaluation_service.urlopen", return_value=mock_resp):
        client.post(
            f"/api/interviews/{session_id}/answers/{q1_id}/evaluate",
            headers={"Authorization": f"Bearer {token}"},
        )

    session_details = client.get(
        f"/api/interviews/{session_id}",
        headers={"Authorization": f"Bearer {token}"},
    ).json()

    q_data = session_details["questions"][0]
    # Speech delivery metrics are independent:
    assert q_data["speech_metrics"] is not None
    assert q_data["speech_metrics"]["filler_words_count"] >= 3
    assert q_data["speech_metrics"]["words_per_minute"] is not None

    # Semantic evaluation is separate:
    assert q_data["evaluation"] is not None
    assert float(q_data["evaluation"]["overall_score"]) == 64.25


def test_evaluator_unavailable_when_unconfigured(eval_context, monkeypatch):
    client, _, token, session_id, q1_id = eval_context
    client.put(
        f"/api/interviews/{session_id}/answers/{q1_id}",
        json={"answer_text": "Valid response text.", "duration_seconds": 15.0},
        headers={"Authorization": f"Bearer {token}"},
    )
    monkeypatch.setattr(settings, "AI_API_KEY", None)
    resp = client.post(
        f"/api/interviews/{session_id}/answers/{q1_id}/evaluate",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 503
    assert "not configured" in resp.json()["detail"].lower()


def test_dashboard_and_history_reflect_real_scores(eval_context):
    client, _, token, session_id, q1_id = eval_context

    # Initially no evaluations exist
    dash_resp = client.get("/api/dashboard/summary", headers={"Authorization": f"Bearer {token}"})
    assert dash_resp.status_code == 200
    assert dash_resp.json()["average_score"] is None

    recents = client.get("/api/dashboard/recent", headers={"Authorization": f"Bearer {token}"}).json()
    assert len(recents) >= 1
    assert recents[0]["score"] is None

    # Save and evaluate answer
    client.put(
        f"/api/interviews/{session_id}/answers/{q1_id}",
        json={"answer_text": "Valid API architecture response.", "duration_seconds": 30.0},
        headers={"Authorization": f"Bearer {token}"},
    )

    mock_llm_output = {
        "choices": [{
            "message": {
                "content": json.dumps({
                    "relevance_score": 90,
                    "completeness_score": 90,
                    "clarity_score": 90,
                    "structure_score": 90,
                    "feedback": "Comprehensive and structured response.",
                    "strengths": "Great domain knowledge.",
                    "improvements": "Provide more metric indicators.",
                })
            }
        }]
    }
    mock_resp = MagicMock()
    mock_resp.read.return_value = json.dumps(mock_llm_output).encode("utf-8")
    mock_resp.__enter__.return_value = mock_resp

    with patch("app.services.evaluation_service.urlopen", return_value=mock_resp):
        client.post(
            f"/api/interviews/{session_id}/answers/{q1_id}/evaluate",
            headers={"Authorization": f"Bearer {token}"},
        )

    # After evaluation, dashboard reflects real score
    dash_resp2 = client.get("/api/dashboard/summary", headers={"Authorization": f"Bearer {token}"})
    assert dash_resp2.status_code == 200
    assert float(dash_resp2.json()["average_score"]) == 90.0

    recents2 = client.get("/api/dashboard/recent", headers={"Authorization": f"Bearer {token}"}).json()
    assert float(recents2[0]["score"]) == 90.0

