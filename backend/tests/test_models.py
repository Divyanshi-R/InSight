import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import configure_mappers

from app.database import models
from app.database.base import Base


REQUIRED_TABLES = {
    "users",
    "questions",
    "interview_sessions",
    "answers",
    "evaluations",
    "visual_metrics",
}


def test_all_database_models_import_and_register() -> None:
    configure_mappers()

    assert models.User.__tablename__ == "users"
    assert models.Question.__tablename__ == "questions"
    assert models.InterviewSession.__tablename__ == "interview_sessions"
    assert models.Answer.__tablename__ == "answers"
    assert models.Evaluation.__tablename__ == "evaluations"
    assert models.VisualMetric.__tablename__ == "visual_metrics"
    assert REQUIRED_TABLES <= set(Base.metadata.tables)


def test_model_relationships_are_configured() -> None:
    configure_mappers()

    assert models.User.interview_sessions.property.back_populates == "user"
    assert models.InterviewSession.answers.property.back_populates == "interview_session"
    assert models.Answer.evaluation.property.uselist is False
    assert models.Answer.visual_metric.property.uselist is False
    assert models.Question.answers.property.back_populates == "question"


def test_required_primary_and_foreign_keys_are_present() -> None:
    for table_name in REQUIRED_TABLES:
        table = Base.metadata.tables[table_name]
        assert len(table.primary_key.columns) == 1
        assert table.primary_key.columns[0].name == "id"

    expected_foreign_keys = {
        "interview_sessions": {"user_id": "users.id"},
        "answers": {
            "session_id": "interview_sessions.id",
            "question_id": "questions.id",
        },
        "evaluations": {"answer_id": "answers.id"},
        "visual_metrics": {"answer_id": "answers.id"},
    }
    for table_name, columns in expected_foreign_keys.items():
        table = Base.metadata.tables[table_name]
        for column_name, target in columns.items():
            assert next(iter(table.c[column_name].foreign_keys)).target_fullname == target


def test_user_email_is_unique_and_indexed() -> None:
    email = Base.metadata.tables["users"].c.email

    assert email.unique is True
    assert email.index is True


def test_evaluation_and_visual_metric_are_one_to_one() -> None:
    for table_name in ("evaluations", "visual_metrics"):
        answer_id = Base.metadata.tables[table_name].c.answer_id
        assert any(
            isinstance(constraint, UniqueConstraint)
            and list(constraint.columns.keys()) == ["answer_id"]
            for constraint in Base.metadata.tables[table_name].constraints
        )
        assert answer_id.nullable is False


def test_application_import_does_not_connect_to_database() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    environment = os.environ.copy()
    environment["DATABASE_URL"] = "mysql+pymysql://user:pass@127.0.0.1:1/insight_db"

    result = subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=backend_dir,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0, result.stderr
