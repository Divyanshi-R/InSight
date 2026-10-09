from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    from app.database import models
    from app.database.base import Base

    _ = models
    Base.metadata.create_all(bind=engine)

    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())

    if "users" in existing_tables:
        user_columns = {column["name"] for column in insp.get_columns("users")}
        if "role" not in user_columns:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        "ALTER TABLE users "
                        "ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'STUDENT'"
                    )
                )

    if engine.dialect.name == "mysql":
        if "interview_sessions" in existing_tables:
            session_columns = {
                column["name"]
                for column in insp.get_columns("interview_sessions")
            }
            if "job_profile_id" not in session_columns:
                with engine.begin() as connection:
                    connection.execute(
                        text(
                            "ALTER TABLE interview_sessions "
                            "ADD COLUMN job_profile_id INT NULL"
                        )
                    )
                insp = inspect(engine)

            if "job_profiles" not in existing_tables:
                raise RuntimeError(
                    "Database migration cannot add foreign key fk_interview_sessions_job_profile: "
                    "referenced table 'job_profiles' does not exist."
                )

            session_fks = {
                fk["name"]
                for fk in insp.get_foreign_keys("interview_sessions")
                if fk.get("name") is not None
            }
            if "fk_interview_sessions_job_profile" not in session_fks:
                with engine.begin() as connection:
                    connection.execute(
                        text(
                            "ALTER TABLE interview_sessions "
                            "ADD CONSTRAINT fk_interview_sessions_job_profile "
                            "FOREIGN KEY (job_profile_id) REFERENCES job_profiles (id) ON DELETE SET NULL"
                        )
                    )
                insp = inspect(engine)

        if "answers" in existing_tables:
            answer_columns = {
                column["name"]: column
                for column in insp.get_columns("answers")
            }
            if "job_question_id" not in answer_columns:
                with engine.begin() as connection:
                    connection.execute(
                        text(
                            "ALTER TABLE answers "
                            "ADD COLUMN job_question_id INT NULL"
                        )
                    )
                insp = inspect(engine)
                answer_columns = {
                    column["name"]: column
                    for column in insp.get_columns("answers")
                }

            if "job_questions" not in existing_tables:
                raise RuntimeError(
                    "Database migration cannot add foreign key fk_answers_job_question: "
                    "referenced table 'job_questions' does not exist."
                )

            answer_fks = {
                fk["name"]
                for fk in insp.get_foreign_keys("answers")
                if fk.get("name") is not None
            }
            if "fk_answers_job_question" not in answer_fks:
                with engine.begin() as connection:
                    connection.execute(
                        text(
                            "ALTER TABLE answers "
                            "ADD CONSTRAINT fk_answers_job_question "
                            "FOREIGN KEY (job_question_id) REFERENCES job_questions (id) ON DELETE CASCADE"
                        )
                    )
                insp = inspect(engine)

            if "question_id" not in answer_columns:
                raise RuntimeError(
                    "Table 'answers' is missing required column 'question_id'; "
                    "cannot verify nullability for M6 schema support."
                )
            if not answer_columns["question_id"]["nullable"]:
                with engine.begin() as connection:
                    connection.execute(
                        text("ALTER TABLE answers MODIFY COLUMN question_id INT NULL")
                    )
                insp = inspect(engine)

            answer_uniques = {
                uc["name"]
                for uc in insp.get_unique_constraints("answers")
                if uc.get("name") is not None
            }
            if "uq_answers_session_job_question" not in answer_uniques:
                with engine.connect() as connection:
                    duplicates = connection.execute(
                        text(
                            "SELECT session_id, job_question_id, COUNT(*) AS cnt "
                            "FROM answers "
                            "WHERE job_question_id IS NOT NULL "
                            "GROUP BY session_id, job_question_id "
                            "HAVING cnt > 1"
                        )
                    ).fetchall()

                if duplicates:
                    dup_summary = ", ".join(
                        f"(session_id={row[0]}, job_question_id={row[1]}, count={row[2]})"
                        for row in duplicates
                    )
                    raise RuntimeError(
                        f"Cannot add unique constraint uq_answers_session_job_question: "
                        f"found duplicate (session_id, job_question_id) pairs in 'answers': {dup_summary}. "
                        "All records have been preserved."
                    )

                with engine.begin() as connection:
                    connection.execute(
                        text(
                            "ALTER TABLE answers "
                            "ADD CONSTRAINT uq_answers_session_job_question "
                            "UNIQUE (session_id, job_question_id)"
                        )
                    )
                insp = inspect(engine)
