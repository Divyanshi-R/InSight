# InSight frontend

The React and Vite frontend provides the M4 authentication and student
dashboard routes:

- `/login` — sign in using the backend authentication API.
- `/register` — create a student account.
- `/dashboard` — protected user-scoped session summary and recent sessions.
- `/job-profiles` — protected list/create/delete experience for the current
  user's saved job profiles.
- `/job-profiles/:jobProfileId` — view one of the current user's saved profiles.

## Local development

Set `VITE_API_BASE_URL` in `.env` to the backend origin, for example
`http://127.0.0.1:8000`. Do not commit `.env`.

From the frontend directory, run:

```powershell
npm install
npm run dev
```

Start the backend separately from `backend` with
`.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload`.

Authentication state is stored in browser local storage so a page refresh can
restore the session. The frontend verifies the stored token with `/api/auth/me`
when it starts; logout clears the saved user and token. Dashboard data comes
from the authenticated summary and recent-session endpoints. Empty sessions
and unavailable evaluation scores are shown as empty/`N/A`, not fabricated.

Run `npm run build` to create the production bundle and `npm run lint` to run
ESLint.
