# InSight Frontend

The React and Vite frontend provides the complete candidate experience for interview preparation, practice, and performance evaluation:

## Core Routes
- `/login` — sign in using the backend authentication API.
- `/register` — create a student account.
- `/dashboard` — protected user-scoped session summary, overall evaluated score average, and recent practice sessions.
- `/interview/new` — setup experience for job profiles, format, length, resume upload/paste, and camera/mic device tests.
- `/interview/:sessionId` — full AI interview practice room with avatar, audio playback, speech-to-text recording, manual transcript editor, and verbal pacing metrics.
- `/interview/:sessionId/report` — comprehensive evaluation report displaying rubric scores, answer feedback, strengths, and actionable improvements.
- `/reports` — paginated history of all sessions with "Load more" capability and session report links.
- `/job-profiles` — manage student job profiles.

## Local Development

Set `VITE_API_BASE_URL` in `.env` to the backend origin, for example `http://127.0.0.1:8000`. Do not commit `.env`.

From the `frontend` directory:
```powershell
npm install
npm run dev
```

Start the backend separately from `backend` with `python -m uvicorn app.main:app --reload`.

Authentication state is persisted in browser local storage (`insight.auth`) and automatically restored and verified against `/api/auth/me` on startup.

## Testing & Quality Commands
- `npm run lint` — run ESLint across all components and scripts.
- `npm run build` — compile production Vite bundle into `frontend/dist`.
