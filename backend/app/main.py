from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.routers.auth import router as auth_router
from app.routers.dashboard import router as dashboard_router

app = FastAPI(
    title="InSight - AI Interview Practice Platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(
        dict.fromkeys(
            [
                settings.FRONTEND_URL,
                "http://localhost:5173",
                "http://127.0.0.1:5173",
            ]
        )
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(dashboard_router)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {
        "status": "ok",
        "service": "AI Interview Practice Platform",
        "version": "1.0.0",
    }
