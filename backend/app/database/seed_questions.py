from sqlalchemy import select

from app.database.database import SessionLocal, init_db
from app.database.models import Question

SEED_QUESTIONS: tuple[dict[str, str], ...] = (
    {
        "category": "HR",
        "question_type": "HR",
        "difficulty": "EASY",
        "question_text": "Tell me about yourself and your background.",
    },
    {
        "category": "HR",
        "question_type": "HR",
        "difficulty": "EASY",
        "question_text": "What are your greatest strengths, and what is one area you are working to improve?",
    },
    {
        "category": "HR",
        "question_type": "HR",
        "difficulty": "MEDIUM",
        "question_text": "Describe a time you worked effectively as part of a team.",
    },
    {
        "category": "HR",
        "question_type": "HR",
        "difficulty": "MEDIUM",
        "question_text": "Tell me about a conflict or difficult problem you faced and how you resolved it.",
    },
    {
        "category": "Software Development",
        "question_type": "TECHNICAL",
        "difficulty": "MEDIUM",
        "question_text": "Walk me through the main stages of a software development lifecycle.",
    },
    {
        "category": "Object-Oriented Programming",
        "question_type": "TECHNICAL",
        "difficulty": "EASY",
        "question_text": "What are the four main principles of object-oriented programming? Give a brief example of each.",
    },
    {
        "category": "DBMS",
        "question_type": "TECHNICAL",
        "difficulty": "MEDIUM",
        "question_text": "What is the difference between a primary key and a foreign key, and how do they support relational data?",
    },
    {
        "category": "Operating Systems",
        "question_type": "TECHNICAL",
        "difficulty": "MEDIUM",
        "question_text": "How does a process differ from a thread in an operating system?",
    },
    {
        "category": "Computer Networks",
        "question_type": "TECHNICAL",
        "difficulty": "MEDIUM",
        "question_text": "What happens at a high level when a browser requests a webpage over HTTPS?",
    },
    {
        "category": "Data Structures and Algorithms",
        "question_type": "TECHNICAL",
        "difficulty": "MEDIUM",
        "question_text": "How would you find whether an array contains a pair of values that sum to a target, and what is the time complexity of your approach?",
    },
)


def seed_questions() -> int:
    init_db()
    session = SessionLocal()
    try:
        with session.begin():
            existing_texts = set(
                session.scalars(select(Question.question_text)).all()
            )
            new_questions = [
                Question(**question)
                for question in SEED_QUESTIONS
                if question["question_text"] not in existing_texts
            ]
            session.add_all(new_questions)
            inserted_count = len(new_questions)
        return inserted_count
    finally:
        session.close()


if __name__ == "__main__":
    inserted_count = seed_questions()
    print(f"Inserted {inserted_count} development questions.")
