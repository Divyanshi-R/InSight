# InSight - AI Interview Practice Platform

## Project overview

InSight is a web platform for practicing job interviews with AI-assisted
feedback. The current implemented scope includes the backend foundation,
MySQL data models, and authentication.

## Technology stack

- Frontend: React, Vite, JavaScript, and ESLint
- Backend: Python 3.14, FastAPI, and Uvicorn
- Backend foundations: SQLAlchemy, PyMySQL, and Pydantic Settings
- Testing: pytest and httpx
- Database: MySQL 8.0 with SQLAlchemy 2.x and PyMySQL

## Backend setup

Run these commands from the repository root in PowerShell:

```powershell
cd backend
py -3.14 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

If PowerShell blocks activation, run the environment's Python directly, for
example `.\.venv\Scripts\python.exe -m pip install -r requirements.txt`.

## Environment variables

Copy the example file to `.env` and update its placeholder values as needed:

```powershell
Copy-Item .env.example .env
```

The settings are `DATABASE_URL`, `SECRET_KEY`,
`ACCESS_TOKEN_EXPIRE_MINUTES`, and `FRONTEND_URL`. The example credentials and
secret are placeholders, not production values. The SQLAlchemy engine is
created without connecting, so MySQL does not need to be running to start or
import the API.

## Start FastAPI

From the `backend` directory with the virtual environment active:

```powershell
python -m uvicorn app.main:app --reload
```

The health endpoint is available at `http://127.0.0.1:8000/api/health`.

## Run tests

From the `backend` directory with the virtual environment active:

```powershell
python -m pytest
```

## Initialize the development database

From the `backend` directory, with `.env` configured and MySQL available, run:

```powershell
python -m app.database.init_db
python -m app.database.seed_questions
```

Initialization creates missing tables with SQLAlchemy metadata and does not
drop or reset existing tables. The seed command inserts the development
question bank only when a question with the same text is not already present;
re-running it is safe. The seed command also initializes missing tables.
`get_db` is available as a FastAPI dependency and closes each session after use.
After upgrading an existing M2 database to M3, run
`python -m app.database.init_db` once to add the non-null `users.role` column.
Existing users receive the `STUDENT` role; no tables or rows are dropped.

## Authentication

The M3 authentication endpoints are:

- `POST /api/auth/register` — accepts `name`, `email`, and `password`;
  normalizes email and returns a safe user response with HTTP 201. New users
  receive the `STUDENT` role.
- `POST /api/auth/login` — accepts `email` and `password`; returns a bearer
  access token and safe user response.
- `GET /api/auth/me` — returns the authenticated user's safe profile.

Passwords are stored as bcrypt hashes. Login tokens are signed with HS256
using `SECRET_KEY` and expire after `ACCESS_TOKEN_EXPIRE_MINUTES`. Send the
token to protected endpoints in the standard header:

```http
Authorization: Bearer <access_token>
```

Supported roles are `STUDENT` and `ADMIN`. Public registration cannot set the
role; role-based authorization is available through the reusable
`require_admin` dependency. No admin-only application endpoint is introduced
in M3.

## Student dashboard

The authenticated dashboard API provides:

- `GET /api/dashboard/summary` — returns session counts and the average
  available evaluation score for the authenticated user. `average_score` is
  `null` until evaluation data exists.
- `GET /api/dashboard/recent` — returns up to five of that user's latest
  interview sessions, newest first. It returns an empty list when no sessions
  exist.

Both endpoints require `Authorization: Bearer <access_token>`. Their queries
are scoped to the authenticated user's ID. No sessions or evaluations are
created as placeholder data.

## Student job profiles

Authenticated students can create and manage their own job profiles:

- `POST /api/job-profiles` — create a profile with `job_title`,
  `job_description`, and optional `experience_level`.
- `GET /api/job-profiles` — list the current user's profiles.
- `GET /api/job-profiles/{job_profile_id}` — retrieve an owned profile.
- `DELETE /api/job-profiles/{job_profile_id}` — delete an owned profile
  (returns HTTP 204).

All routes require `Authorization: Bearer <access_token>`. Profile ownership
is derived from the authenticated user; requests cannot specify an owner.
Foreign-owned or missing profile IDs return HTTP 404. The profile data is
stored for future personalization.

## AI-generated interview questions

Question generation is optional and performed only by the backend. Configure
`AI_PROVIDER` (`openai_compatible`), `AI_API_KEY`, `AI_MODEL`, and optionally
`AI_API_URL` in the backend environment. The API key is only required when
generating questions; the application, database initialization, and tests can
run without it. No key is sent to or stored by the frontend.

- `POST /api/job-profiles/{job_profile_id}/questions/generate` — generate and
  save up to 10 validated questions for an owned job profile.
- `GET /api/job-profiles/{job_profile_id}/questions` — list saved questions
  for an owned profile.
- `PATCH /api/job-profiles/{job_profile_id}/questions/{question_id}` — update
  only `approved_by_student`.

All question routes require `Authorization: Bearer <access_token>`. Missing
and foreign-owned profiles return HTTP 404. Generation requires a configured
provider and returns a controlled error when configuration or the provider is
unavailable. Automated tests use a fake generator and never call an external
AI API.

The frontend provides `/login`, `/register`, and a protected `/dashboard`.
From the repository root, run the backend with
`cd backend; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload` and
the frontend with `cd frontend; npm run dev`. Configure
`VITE_API_BASE_URL` in the frontend environment file to point to the backend.
The dashboard displays available session totals, evaluated average when
present, and a clear empty state otherwise. Logout clears the local client
session; it does not call a backend logout endpoint.

## Current milestones

### M2 - Database Layer

M2 provides the SQLAlchemy models, database session dependency, explicit
development table initialization, and an idempotent question-bank seed
command.

### M3 - Authentication & Authorization

M3 provides registration, login, current-user retrieval, bcrypt password
hashing, JWT access tokens, and reusable role-based authorization
dependencies.

### M4 - Student Dashboard

M4 provides the authenticated dashboard summary and recent-session endpoints,
plus frontend login, registration, session persistence, protected routing, and
the student dashboard. Interview functionality, evaluation processing,
reports, and deployment are not included in this milestone.

### M5-A - Student Job Profiles

M5-A provides a user-owned job-profile table, validation schemas, service
operations, and protected REST endpoints for creating, listing, retrieving,
and deleting profiles. AI analysis and question generation are not included.

### M5-C - AI-Generated Interview Questions

M5-C adds the `job_questions` table, an optional OpenAI-compatible provider
adapter, validated owner-scoped generation and retrieval, and student
approval updates. It does not add an interview interface or expose AI
credentials to the frontend.

### M1 - Project Foundation

M1 provides the FastAPI app, CORS configuration, environment settings,
SQLAlchemy engine/session foundation, and health endpoint/test. The frontend
can use the health endpoint to verify connectivity.
