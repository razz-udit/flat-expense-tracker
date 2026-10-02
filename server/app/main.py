from contextlib import asynccontextmanager
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.services.seed_service import seed_initial_data
from app.routers import (
    auth_router,
    categories_router,
    dashboard_router,
    expenses_router,
    members_router,
    payments_router,
    recurring_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()

    yield


app = FastAPI(
    title=settings.APP_NAME,
    description="Flat Expense & Payment Manager",
    version="1.0.0",
    lifespan=lifespan,
)


# CORS is completely environment-driven through CORS_ORIGINS.
cors_origins = settings.cors_origins_list
allow_all_origins = "*" in cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if allow_all_origins else cors_origins,
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(auth_router)
app.include_router(members_router)
app.include_router(categories_router)
app.include_router(expenses_router)
app.include_router(payments_router)
app.include_router(recurring_router)
app.include_router(dashboard_router)


# Serve the compiled React application when client/dist exists.
client_dist = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "client", "dist")
)

if os.path.exists(client_dist):
    assets_dir = os.path.join(client_dist, "assets")

    if os.path.exists(assets_dir):
        app.mount(
            "/assets",
            StaticFiles(directory=assets_dir),
            name="assets",
        )

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = os.path.join(client_dist, full_path)

        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)

        return FileResponse(os.path.join(client_dist, "index.html"))

else:

    @app.get("/")
    def root():
        return {
            "app": settings.APP_NAME,
            "status": "online",
            "docs_url": "/docs",
            "api_prefix": "/api",
        }
