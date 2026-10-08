import json
import os
import subprocess
import sys
from collections.abc import Callable
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.dependencies import get_ai_question_generator
from app.database.models import JobProfile, JobQuestion
from app.schemas.job_question import GeneratedQuestion, GeneratedQuestionData
from app.services.ai_question_generator import AIQuestionGenerator
from app.services.ai_question_generator import (
    OpenAICompatibleQuestionGenerator,
    QuestionGeneratorError,
)


class FakeQuestionGenerator(AIQuestionGenerator):
    def __init__(
        self,
        result: list[GeneratedQuestionData] | None = None,
        error: Exception | None = None,
    ) -> None:
        self.result = result or [
            GeneratedQuestion(
                question="How would you design a reliable REST API?",
                question_type="TECHNICAL",
                difficulty="MEDIUM",
                skill_tags=["API design", "Reliability"],
            ),
            GeneratedQuestion(
                question="Describe a time you resolved a production issue.",
                question_type="BEHAVIORAL",
                difficulty="MEDIUM",
                skill_tags=["Communication"],
            ),
        ]
        self.error = error
        self.received_profile: dict[str, str | None] | None = None

    def generate_questions(
        self,
        *,
        job_title: str,
        job_description: str,
        experience_level: str | None,
    ) -> list[GeneratedQuestionData]:
        self.received_profile = {
            "job_title": job_title,
            "job_description": job_description,
            "experience_level": experience_level,
        }
        if self.error is not None:
            raise self.error
        return self.result


@pytest.fixture
def job_question_context(
    auth_test_context: tuple[TestClient, sessionmaker[Session]],
) -> tuple[TestClient, Callable[[str], tuple[int, str]], sessionmaker[Session]]:
    client, session_factory = auth_test_context

    def create_user(email: str) -> tuple[int, str]:
        registration = client.post(
            "/api/auth/register",
            json={
                "name": "Question Test Student",
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


def create_profile(client: TestClient, token: str) -> dict[str, object]:
    response = client.post(
        "/api/job-profiles",
        json={
            "job_title": "Backend Engineer",
            "job_description": "Build secure and reliable Python APIs.",
            "experience_level": "Junior",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 201
    return response.json()


def install_generator(client: TestClient, generator: AIQuestionGenerator) -> None:
    client.app.dependency_overrides[get_ai_question_generator] = lambda: generator


def test_owner_can_generate_questions_from_their_profile_and_persist_them(
    job_question_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, session_factory = job_question_context
    user_id, token = create_user("generate-owner@example.com")
    profile = create_profile(client, token)
    generator = FakeQuestionGenerator()
    install_generator(client, generator)

    response = client.post(
        f"/api/job-profiles/{profile['id']}/questions/generate",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    questions = response.json()["questions"]
    assert len(questions) == 2
    assert questions[0]["job_profile_id"] == profile["id"]
    assert questions[0]["question_type"] == "TECHNICAL"
    assert questions[0]["difficulty"] == "MEDIUM"
    assert questions[0]["skill_tags"] == ["API design", "Reliability"]
    assert questions[0]["approved_by_student"] is False
    assert questions[0]["generation_prompt_version"] == "job-profile-v1"
    assert generator.received_profile == {
        "job_title": "Backend Engineer",
        "job_description": "Build secure and reliable Python APIs.",
        "experience_level": "Junior",
    }
    with session_factory() as db:
        persisted = db.scalars(
            select(JobQuestion).where(JobQuestion.job_profile_id == profile["id"])
        ).all()
        assert len(persisted) == 2
        owner = db.get(JobProfile, profile["id"])
        assert owner is not None and owner.user_id == user_id


def test_unauthenticated_generation_is_rejected(
    job_question_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, _ = job_question_context
    _, token = create_user("unauth-generate@example.com")
    profile = create_profile(client, token)
    install_generator(client, FakeQuestionGenerator())

    response = client.post(f"/api/job-profiles/{profile['id']}/questions/generate")

    assert response.status_code == 401


def test_foreign_profile_cannot_generate_questions(
    job_question_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, _ = job_question_context
    _, owner_token = create_user("foreign-owner@example.com")
    _, other_token = create_user("foreign-other@example.com")
    profile = create_profile(client, owner_token)
    generator = FakeQuestionGenerator()
    install_generator(client, generator)

    response = client.post(
        f"/api/job-profiles/{profile['id']}/questions/generate",
        headers={"Authorization": f"Bearer {other_token}"},
    )

    assert response.status_code == 404
    assert generator.received_profile is None


def test_missing_profile_returns_not_found(
    job_question_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, _ = job_question_context
    _, token = create_user("missing-profile@example.com")
    install_generator(client, FakeQuestionGenerator())

    response = client.post(
        "/api/job-profiles/99999/questions/generate",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 404


def test_generated_questions_can_be_retrieved_only_by_profile_owner(
    job_question_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, _ = job_question_context
    _, owner_token = create_user("retrieve-questions-owner@example.com")
    _, other_token = create_user("retrieve-questions-other@example.com")
    profile = create_profile(client, owner_token)
    install_generator(client, FakeQuestionGenerator())
    generated = client.post(
        f"/api/job-profiles/{profile['id']}/questions/generate",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    assert generated.status_code == 201

    owner_response = client.get(
        f"/api/job-profiles/{profile['id']}/questions",
        headers={"Authorization": f"Bearer {owner_token}"},
    )
    foreign_response = client.get(
        f"/api/job-profiles/{profile['id']}/questions",
        headers={"Authorization": f"Bearer {other_token}"},
    )

    assert owner_response.status_code == 200
    assert len(owner_response.json()["questions"]) == 2
    assert foreign_response.status_code == 404


def test_unauthenticated_question_retrieval_is_rejected(
    job_question_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, _ = job_question_context
    _, token = create_user("unauth-retrieve@example.com")
    profile = create_profile(client, token)

    response = client.get(f"/api/job-profiles/{profile['id']}/questions")

    assert response.status_code == 401


def test_owner_can_approve_and_reject_a_question(
    job_question_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, _ = job_question_context
    _, token = create_user("approve-question@example.com")
    profile = create_profile(client, token)
    install_generator(client, FakeQuestionGenerator())
    generated = client.post(
        f"/api/job-profiles/{profile['id']}/questions/generate",
        headers={"Authorization": f"Bearer {token}"},
    ).json()["questions"][0]

    approved = client.patch(
        f"/api/job-profiles/{profile['id']}/questions/{generated['id']}",
        json={"approved_by_student": True},
        headers={"Authorization": f"Bearer {token}"},
    )
    rejected = client.patch(
        f"/api/job-profiles/{profile['id']}/questions/{generated['id']}",
        json={"approved_by_student": False},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert approved.status_code == 200
    assert approved.json()["approved_by_student"] is True
    assert rejected.status_code == 200
    assert rejected.json()["approved_by_student"] is False


def test_foreign_user_cannot_modify_question_approval(
    job_question_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, _ = job_question_context
    _, owner_token = create_user("approval-owner@example.com")
    _, other_token = create_user("approval-other@example.com")
    profile = create_profile(client, owner_token)
    install_generator(client, FakeQuestionGenerator())
    generated = client.post(
        f"/api/job-profiles/{profile['id']}/questions/generate",
        headers={"Authorization": f"Bearer {owner_token}"},
    ).json()["questions"][0]

    response = client.patch(
        f"/api/job-profiles/{profile['id']}/questions/{generated['id']}",
        json={"approved_by_student": True},
        headers={"Authorization": f"Bearer {other_token}"},
    )

    assert response.status_code == 404


def test_approval_request_cannot_change_other_question_fields(
    job_question_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, _ = job_question_context
    _, token = create_user("approval-validation@example.com")
    profile = create_profile(client, token)
    install_generator(client, FakeQuestionGenerator())
    generated = client.post(
        f"/api/job-profiles/{profile['id']}/questions/generate",
        headers={"Authorization": f"Bearer {token}"},
    ).json()["questions"][0]

    response = client.patch(
        f"/api/job-profiles/{profile['id']}/questions/{generated['id']}",
        json={"approved_by_student": True, "question": "Client override"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 422


def test_unauthenticated_user_cannot_change_question_approval(
    job_question_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, _ = job_question_context
    _, token = create_user("unauth-approval@example.com")
    profile = create_profile(client, token)
    install_generator(client, FakeQuestionGenerator())
    generated = client.post(
        f"/api/job-profiles/{profile['id']}/questions/generate",
        headers={"Authorization": f"Bearer {token}"},
    ).json()["questions"][0]

    response = client.patch(
        f"/api/job-profiles/{profile['id']}/questions/{generated['id']}",
        json={"approved_by_student": True},
    )

    assert response.status_code == 401


def test_duplicate_questions_within_generation_and_existing_profile_are_skipped(
    job_question_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, session_factory = job_question_context
    _, token = create_user("duplicate-question@example.com")
    profile = create_profile(client, token)
    duplicate = GeneratedQuestion(
        question="  Explain Python's   GIL. ",
        question_type="CONCEPTUAL",
        difficulty="EASY",
        skill_tags=["Python"],
    )
    generator = FakeQuestionGenerator(
        result=[
            duplicate,
            GeneratedQuestion(
                question="Explain Python's GIL.",
                question_type="CONCEPTUAL",
                difficulty="EASY",
                skill_tags=["Concurrency"],
            ),
            GeneratedQuestion(
                question="What is a Python context manager?",
                question_type="TECHNICAL",
                difficulty="MEDIUM",
                skill_tags=["Python"],
            ),
        ]
    )
    install_generator(client, generator)
    first = client.post(
        f"/api/job-profiles/{profile['id']}/questions/generate",
        headers={"Authorization": f"Bearer {token}"},
    )
    second = client.post(
        f"/api/job-profiles/{profile['id']}/questions/generate",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert first.status_code == second.status_code == 201
    assert len(first.json()["questions"]) == 2
    assert second.json()["questions"] == []
    with session_factory() as db:
        stored = db.scalars(
            select(JobQuestion).where(JobQuestion.job_profile_id == profile["id"])
        ).all()
        assert len(stored) == 2


def test_generation_rejects_more_than_ten_questions(
    job_question_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, _ = job_question_context
    _, token = create_user("too-many-questions@example.com")
    profile = create_profile(client, token)
    question = GeneratedQuestion(
        question="How do you approach testing software?",
        question_type="TECHNICAL",
        difficulty="EASY",
        skill_tags=["Testing"],
    )
    install_generator(client, FakeQuestionGenerator(result=[question] * 11))

    response = client.post(
        f"/api/job-profiles/{profile['id']}/questions/generate",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 502


def test_malformed_ai_output_returns_controlled_error_and_is_not_saved(
    job_question_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    client, create_user, session_factory = job_question_context
    _, token = create_user("malformed-output@example.com")
    profile = create_profile(client, token)
    install_generator(
        client,
        FakeQuestionGenerator(
            result=[
                {
                    "question": "  ",
                    "question_type": "UNSAFE",
                    "difficulty": "EASY",
                    "skill_tags": [],
                }
            ]
        ),
    )

    response = client.post(
        f"/api/job-profiles/{profile['id']}/questions/generate",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 502
    assert "api_key" not in response.text.lower()
    with session_factory() as db:
        assert db.scalars(select(JobQuestion)).all() == []


def test_provider_failure_returns_controlled_error(
    job_question_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
) -> None:
    from app.services.ai_question_generator import QuestionGeneratorError

    client, create_user, _ = job_question_context
    _, token = create_user("provider-error@example.com")
    profile = create_profile(client, token)
    install_generator(
        client,
        FakeQuestionGenerator(error=QuestionGeneratorError("private API details")),
    )

    response = client.post(
        f"/api/job-profiles/{profile['id']}/questions/generate",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 502
    assert response.json()["detail"] == "AI question generation failed"
    assert "private API details" not in response.text


def test_provider_http_error_is_logged_with_secrets_redacted(
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    from app.services import ai_question_generator

    api_key = "test-gemini-key-do-not-log"
    access_token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue"
    error_body = (
        '{"error":{"message":"Model is unavailable. Authorization: Bearer '
        f'{access_token}; key={api_key}; password=do-not-log-password"}}'
    ).encode()
    provider_error = HTTPError(
        url="https://provider.invalid/chat/completions",
        code=400,
        msg="Bad Request",
        hdrs=None,
        fp=BytesIO(error_body),
    )

    def raise_provider_error(*args: object, **kwargs: object) -> None:
        raise provider_error

    monkeypatch.setattr(settings, "AI_API_KEY", SecretStr(api_key))
    monkeypatch.setattr(ai_question_generator, "urlopen", raise_provider_error)

    with caplog.at_level("WARNING", logger=ai_question_generator.__name__):
        with pytest.raises(QuestionGeneratorError):
            OpenAICompatibleQuestionGenerator().generate_questions(
                job_title="Software Engineer",
                job_description="Build APIs",
                experience_level=None,
            )

    assert "HTTP 400" in caplog.text
    assert "Model is unavailable" in caplog.text
    assert api_key not in caplog.text
    assert access_token not in caplog.text
    assert "do-not-log-password" not in caplog.text
    assert "Authorization: Bearer [REDACTED]" in caplog.text


def test_provider_retries_http_503_then_succeeds(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import ai_question_generator

    attempts = 0
    delays: list[int] = []

    def fake_urlopen(*args: object, **kwargs: object) -> BytesIO:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise HTTPError(
                url="https://provider.invalid/chat/completions",
                code=503,
                msg="Service Unavailable",
                hdrs=None,
                fp=BytesIO(b'{"error":"temporarily unavailable"}'),
            )
        content = json.dumps(
            {
                "questions": [
                    {
                        "question": "How would you design a resilient API?",
                        "question_type": "TECHNICAL",
                        "difficulty": "MEDIUM",
                        "skill_tags": ["API design"],
                    }
                ]
            }
        )
        return BytesIO(
            json.dumps(
                {"choices": [{"message": {"content": content}}]}
            ).encode()
        )

    monkeypatch.setattr(settings, "AI_API_KEY", SecretStr("test-key"))
    monkeypatch.setattr(ai_question_generator, "urlopen", fake_urlopen)
    monkeypatch.setattr(ai_question_generator.time, "sleep", delays.append)

    questions = OpenAICompatibleQuestionGenerator().generate_questions(
        job_title="Software Engineer",
        job_description="Build APIs",
        experience_level=None,
    )

    assert attempts == 2
    assert delays == [1]
    assert questions[0].question == "How would you design a resilient API?"


def test_provider_stops_after_three_http_503_attempts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import ai_question_generator

    attempts = 0
    delays: list[int] = []

    def fake_urlopen(*args: object, **kwargs: object) -> None:
        nonlocal attempts
        attempts += 1
        raise HTTPError(
            url="https://provider.invalid/chat/completions",
            code=503,
            msg="Service Unavailable",
            hdrs=None,
            fp=BytesIO(b'{"error":"temporarily unavailable"}'),
        )

    monkeypatch.setattr(settings, "AI_API_KEY", SecretStr("test-key"))
    monkeypatch.setattr(ai_question_generator, "urlopen", fake_urlopen)
    monkeypatch.setattr(ai_question_generator.time, "sleep", delays.append)

    with pytest.raises(QuestionGeneratorError):
        OpenAICompatibleQuestionGenerator().generate_questions(
            job_title="Software Engineer",
            job_description="Build APIs",
            experience_level=None,
        )

    assert attempts == 3
    assert delays == [1, 2]


def test_provider_does_not_retry_http_400(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import ai_question_generator

    attempts = 0
    delays: list[int] = []

    def fake_urlopen(*args: object, **kwargs: object) -> None:
        nonlocal attempts
        attempts += 1
        raise HTTPError(
            url="https://provider.invalid/chat/completions",
            code=400,
            msg="Bad Request",
            hdrs=None,
            fp=BytesIO(b'{"error":"invalid request"}'),
        )

    monkeypatch.setattr(settings, "AI_API_KEY", SecretStr("test-key"))
    monkeypatch.setattr(ai_question_generator, "urlopen", fake_urlopen)
    monkeypatch.setattr(ai_question_generator.time, "sleep", delays.append)

    with pytest.raises(QuestionGeneratorError):
        OpenAICompatibleQuestionGenerator().generate_questions(
            job_title="Software Engineer",
            job_description="Build APIs",
            experience_level=None,
        )

    assert attempts == 1
    assert delays == []


def test_missing_ai_key_does_not_prevent_startup_and_generation_is_disabled(
    job_question_context: tuple[
        TestClient,
        Callable[[str], tuple[int, str]],
        sessionmaker[Session],
    ],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    client, create_user, _ = job_question_context
    _, token = create_user("no-ai-key@example.com")
    profile = create_profile(client, token)
    monkeypatch.setattr(settings, "AI_API_KEY", None)
    client.app.dependency_overrides.pop(get_ai_question_generator, None)

    response = client.post(
        f"/api/job-profiles/{profile['id']}/questions/generate",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 503


def test_application_imports_without_ai_key() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    environment = os.environ.copy()
    environment.pop("AI_API_KEY", None)
    result = subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=backend_dir,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
