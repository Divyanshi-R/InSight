# InSight - AI Interview Practice Platform

## Project overview

InSight is a web platform for practicing job interviews with AI-assisted
feedback. The project is being developed in milestones. The current scope is
the backend foundation and a frontend-to-backend health check only.

## Technology stack

- Frontend: React, Vite, JavaScript, and ESLint
- Backend: Python 3.14, FastAPI, and Uvicorn
- Backend foundations: SQLAlchemy, PyMySQL, and Pydantic Settings
- Testing: pytest and httpx
- Database: MySQL (application tables are not part of M1)

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
created without connecting, so MySQL does not need to be running to start the
M1 API.

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

## Current milestone: M1 - Project Foundation

M1 provides the FastAPI app, CORS configuration, environment settings,
SQLAlchemy engine/session foundation, and health endpoint/test. The frontend
can use the health endpoint to verify connectivity. Authentication, application
database tables, interview functionality, evaluation, reports, and deployment
are not included in this milestone.
