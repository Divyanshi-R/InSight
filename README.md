# InSight — AI Interview Practice Platform

InSight is a full-stack web application designed for students and job candidates to practice technical and behavioral interviews with structured AI-assisted evaluation and realistic delivery feedback.

---

## 1. Architecture & Tech Stack

* **Frontend**: React 18, Vite, React Router 6, Web Speech API (for voice transcription and question read-aloud), custom responsive dark/light design system.
* **Backend**: Python 3.11+ / 3.14, FastAPI, Uvicorn, SQLAlchemy 2.0, PyMySQL, Pydantic v2 Settings.
* **Authentication**: Password hashing with BCrypt, stateless JWT bearer tokens (HS256), student role-based authorization.
* **Database**: MySQL 8.0 with SQLAlchemy ORM and schema migration routines.
* **Testing & Quality**: pytest, httpx, ESLint, Vite production bundler.

---

## 2. Prerequisites

Before setting up the project, ensure the following are installed:

* **Node.js** (v18.0.0 or higher) & **npm**
* **Python** (3.11 to 3.14)
* **MySQL Server 8.0+** running locally or accessible via network

---

## 3. Getting Started & Setup Instructions

### Step 1: Database Setup
Create an empty database in your MySQL server:
```sql
CREATE DATABASE insight_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### Step 2: Backend Setup
Open a terminal in the project root:

```powershell
# Navigate to backend
cd backend

# Create Python virtual environment
python -m venv .venv

# Activate virtual environment (Windows PowerShell)
.\.venv\Scripts\Activate.ps1
# (On macOS/Linux: source .venv/bin/activate)

# Install Python dependencies
python -m pip install -r requirements.txt

# Configure environment variables
Copy-Item .env.example .env
```

Edit `backend/.env` with your MySQL credentials and JWT secret (see [Environment Variables](#4-environment-variables)).

Initialize database tables and seed the base question bank:
```powershell
python -m app.database.init_db
python -m app.database.seed_questions
```

Start the FastAPI backend server:
```powershell
python -m uvicorn app.main:app --reload --port 8000
```
The backend API and health check will be live at `http://127.0.0.1:8000/api/health`.

### Step 3: Frontend Setup
Open a second terminal in the project root:

```powershell
# Navigate to frontend
cd frontend

# Install Node dependencies
npm install

# Configure environment variables
Copy-Item .env.example .env

# Start Vite development server
npm run dev
```
The frontend application will be live at `http://localhost:5173`.

---

## 4. Environment Variables

### Backend (`backend/.env`)
| Variable | Description | Default / Example |
|---|---|---|
| `DATABASE_URL` | SQLAlchemy connection URL for MySQL database | `mysql+pymysql://user:password@localhost:3306/insight_db` |
| `SECRET_KEY` | Secret key used for signing JWT bearer tokens | Random secret string |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiration lifetime in minutes | `30` |
| `FRONTEND_URL` | Frontend origin permitted for CORS requests | `http://localhost:5173` |
| `AI_PROVIDER` | AI provider adapter type (optional) | `openai_compatible` |
| `AI_API_KEY` | API key for AI provider (backend-only, optional for mock tests) | Provider API key |
| `AI_MODEL` | LLM model identifier | `gpt-4o-mini` |
| `AI_API_URL` | Chat completions endpoint URL | `https://api.openai.com/v1/chat/completions` |

> **Security Note**: `AI_API_KEY` is strictly backend-only and stored as a Pydantic `SecretStr`. It is never transmitted to, bundled in, or accessible by the frontend.

### Frontend (`frontend/.env`)
| Variable | Description | Default / Example |
|---|---|---|
| `VITE_API_BASE_URL` | Base URL of the backend API origin | `http://127.0.0.1:8000` |

---

## 5. Verification & Test Commands

### Run Backend Unit & Integration Tests (99 tests)
From the repository root:
```powershell
$env:PYTHONPATH='backend'
.\backend\.venv\Scripts\python.exe -m pytest backend/tests
```

### Run Frontend Linter (ESLint)
From the `frontend` directory:
```powershell
npm run lint
```

### Run Frontend Production Build
From the `frontend` directory:
```powershell
npm run build
```

---

## 6. Core Features Implemented

1. **Authentication & Session Security**:
   * User registration, login, and current-user verification (`/api/auth/*`).
   * Password hashing via BCrypt, JWT expiration enforcement, and role attribution (`STUDENT`).
   * Protected routes with automatic session restoration and cross-user data isolation.
2. **Student Dashboard (`/dashboard`)**:
   * Summary metrics computed strictly from real sessions: total sessions, completed sessions, and overall average evaluation score.
   * Recent sessions list with direct links to view or resume interviews.
3. **Interview Setup (`/interview/new`)**:
   * Role and company inputs, interview format (Behavioral, Technical, System Design), and duration (15 min, 25 min, 45 min).
   * Resume upload (with 5MB file-size validation and text extraction) or manual text entry.
   * Pre-flight device checks: real-time microphone volume level meter and local webcam preview toggle.
4. **Interactive AI Interview Room (`/interview/:sessionId`)**:
   * Turn-based question progression with conversational AI assistant avatar.
   * Question read-aloud via Web Speech API synthesis.
   * Speech-to-text recording with real-time word counting, speaking pace (Words Per Minute), filler-words counter, and answer duration timer.
   * Accessible manual transcript editor permitting keyboard typing fallback when microphone is unavailable.
5. **AI Answer Evaluation (`/interview/:sessionId/report`)**:
   * Multi-dimensional rubric scoring (0–100 scale): Relevance, Factual/Technical Accuracy, Completeness & Depth, Clarity & Articulation, and Structure.
   * Evidence-backed analysis citing direct excerpts from candidate responses.
   * Actionable strengths and improvement recommendations.
6. **Reports & History (`/reports`)**:
   * Comprehensive history of all candidate sessions.
   * Clean pagination (`PAGE_SIZE = 10`) with dynamic "Load more" button revealing all historical sessions without duplicates.
   * Strict user isolation preventing access to other students' sessions or evaluations.

---

## 7. Known Limitations & Operational Considerations

1. **Unsupported Gaze / Eye Tracking**:
   * The webcam video feed is a local client-side presence preview designed to assist candidates with their on-camera confidence.
   * Computer vision gaze estimation, pupil tracking, and emotion recognition are **not measured or claimed**. This is explicitly labeled in the UI.
2. **Web Speech API Browser Support**:
   * Live voice transcription relies on the browser's native `webkitSpeechRecognition` / `SpeechRecognition` API.
   * Best supported in **Google Chrome** and **Microsoft Edge**. If voice recognition is unavailable or blocked, candidates can type their answers directly using the transcript editor.
3. **External AI Provider Connectivity**:
   * Dynamic question generation and answer evaluation communicate with the configured OpenAI-compatible API.
   * If the external provider is offline, rate-limited, or unconfigured, the application returns controlled HTTP 502/503 errors and displays clear feedback rather than failing silently or presenting fabricated scores.
