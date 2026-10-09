from collections.abc import Generator

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.dependencies import get_db, require_admin
from app.database import models
from app.database.base import Base
from app.database.models import User
from app.routers.auth import router as auth_router
from app.routers.dashboard import router as dashboard_router
from app.routers.interviews import router as interviews_router
from app.routers.job_profiles import router as job_profiles_router


@pytest.fixture
def auth_test_context() -> Generator[tuple[TestClient, sessionmaker[Session]], None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    test_session_local = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=engine,
    )
    Base.metadata.create_all(bind=engine)

    test_app = FastAPI()
    test_app.include_router(auth_router)
    test_app.include_router(dashboard_router)
    test_app.include_router(interviews_router)
    test_app.include_router(job_profiles_router)

    def override_get_db() -> Generator[Session, None, None]:
        db = test_session_local()
        try:
            yield db
        finally:
            db.close()

    @test_app.get("/_test/admin")
    def test_admin_route(
        current_user: User = Depends(require_admin),
    ) -> dict[str, int]:
        return {"user_id": current_user.id}

    test_app.dependency_overrides[get_db] = override_get_db

    try:
        yield TestClient(test_app), test_session_local
    finally:
        test_app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
