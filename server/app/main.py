from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import engine, Base, SessionLocal
from app.services.seed_service import seed_initial_data
from app.routers import (
    members_router,
    categories_router,
    expenses_router,
    payments_router,
    recurring_router,
    dashboard_router,
    auth_router
)

from sqlalchemy import text

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize tables
    Base.metadata.create_all(bind=engine)
    try:
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS google_id VARCHAR(100);"))
            conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);"))
            conn.commit()
    except Exception:
        pass
    # Seed default members and categories if table is fresh
    db = SessionLocal()
    try:
        seed_initial_data(db)
    finally:
        db.close()
    yield

app = FastAPI(
    title=settings.APP_NAME,
    description="Flat Expense & Payment Manager for 6 flat members",
    version="1.0.0",
    lifespan=lifespan
)

# CORS setup dynamically configured from .env / environment settings
cors_origins = settings.cors_origins_list
has_wildcard = "*" in cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if has_wildcard else cors_origins,
    allow_origin_regex=r"https://.*\.onrender\.com|https://.*\.loca\.lt" if not has_wildcard else None,
    allow_credentials=not has_wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Include routers
app.include_router(auth_router)
app.include_router(members_router)
app.include_router(categories_router)
app.include_router(expenses_router)
app.include_router(payments_router)
app.include_router(recurring_router)
app.include_router(dashboard_router)

# Mount compiled React frontend for unified deployment
client_dist = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "client", "dist"))
if os.path.exists(client_dist):
    assets_dir = os.path.join(client_dist, "assets")
    if os.path.exists(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        if full_path.startswith("api") or full_path.startswith("docs") or full_path.startswith("openapi.json"):
            return None
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
            "api_prefix": "/api"
        }
