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
            is_sqlite = "sqlite" in str(engine.url)
            if is_sqlite:
                m_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(members);")).fetchall()]
                if "google_id" not in m_cols:
                    conn.execute(text("ALTER TABLE members ADD COLUMN google_id VARCHAR(100);"))
                if "avatar_url" not in m_cols:
                    conn.execute(text("ALTER TABLE members ADD COLUMN avatar_url VARCHAR(500);"))
                if "is_admin" not in m_cols:
                    conn.execute(text("ALTER TABLE members ADD COLUMN is_admin BOOLEAN DEFAULT 0 NOT NULL;"))
                if "token_version" not in m_cols:
                    conn.execute(text("ALTER TABLE members ADD COLUMN token_version INTEGER DEFAULT 1 NOT NULL;"))

                e_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(expenses);")).fetchall()]
                if "receipt_url" not in e_cols:
                    conn.execute(text("ALTER TABLE expenses ADD COLUMN receipt_url TEXT;"))
                if "payment_method" not in e_cols:
                    conn.execute(text("ALTER TABLE expenses ADD COLUMN payment_method VARCHAR(50) DEFAULT 'UPI';"))
                if "verification_status" not in e_cols:
                    conn.execute(text("ALTER TABLE expenses ADD COLUMN verification_status VARCHAR(50) DEFAULT 'Pending Confirmation';"))
                if "confirmed_by" not in e_cols:
                    conn.execute(text("ALTER TABLE expenses ADD COLUMN confirmed_by TEXT;"))
                if "recurring_id" not in e_cols:
                    conn.execute(text("ALTER TABLE expenses ADD COLUMN recurring_id INTEGER;"))

                if "claim_token_hash" not in m_cols:
                    conn.execute(text("ALTER TABLE members ADD COLUMN claim_token_hash VARCHAR(255);"))
                if "claim_token_expires_at" not in m_cols:
                    conn.execute(text("ALTER TABLE members ADD COLUMN claim_token_expires_at DATETIME;"))

                e_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(expenses);")).fetchall()]
                if "receipt_url" not in e_cols:
                    conn.execute(text("ALTER TABLE expenses ADD COLUMN receipt_url TEXT;"))
                if "payment_method" not in e_cols:
                    conn.execute(text("ALTER TABLE expenses ADD COLUMN payment_method VARCHAR(50) DEFAULT 'UPI';"))
                if "verification_status" not in e_cols:
                    conn.execute(text("ALTER TABLE expenses ADD COLUMN verification_status VARCHAR(50) DEFAULT 'Pending Confirmation';"))
                if "confirmed_by" not in e_cols:
                    conn.execute(text("ALTER TABLE expenses ADD COLUMN confirmed_by TEXT;"))
                if "recurring_id" not in e_cols:
                    conn.execute(text("ALTER TABLE expenses ADD COLUMN recurring_id INTEGER;"))
                if "disputed_by" not in e_cols:
                    conn.execute(text("ALTER TABLE expenses ADD COLUMN disputed_by INTEGER;"))
                if "dispute_reason" not in e_cols:
                    conn.execute(text("ALTER TABLE expenses ADD COLUMN dispute_reason TEXT;"))
                if "disputed_at" not in e_cols:
                    conn.execute(text("ALTER TABLE expenses ADD COLUMN disputed_at DATETIME;"))
                if "resolved_by" not in e_cols:
                    conn.execute(text("ALTER TABLE expenses ADD COLUMN resolved_by INTEGER;"))
                if "resolution_notes" not in e_cols:
                    conn.execute(text("ALTER TABLE expenses ADD COLUMN resolution_notes TEXT;"))
                if "resolved_at" not in e_cols:
                    conn.execute(text("ALTER TABLE expenses ADD COLUMN resolved_at DATETIME;"))

                s_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(expense_splits);")).fetchall()]
                if "shares" not in s_cols:
                    conn.execute(text("ALTER TABLE expense_splits ADD COLUMN shares NUMERIC(10, 2);"))
                if "percentage" not in s_cols:
                    conn.execute(text("ALTER TABLE expense_splits ADD COLUMN percentage NUMERIC(5, 2);"))

                r_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(recurring_expenses);")).fetchall()]
                if "last_generated_period" not in r_cols:
                    conn.execute(text("ALTER TABLE recurring_expenses ADD COLUMN last_generated_period VARCHAR(20);"))
                if "start_date" not in r_cols:
                    conn.execute(text("ALTER TABLE recurring_expenses ADD COLUMN start_date DATE;"))
                if "next_due_date" not in r_cols:
                    conn.execute(text("ALTER TABLE recurring_expenses ADD COLUMN next_due_date DATE;"))
            else:
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS google_id VARCHAR(100);"))
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(500);"))
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE NOT NULL;"))
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 1 NOT NULL;"))
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS claim_token_hash VARCHAR(255);"))
                conn.execute(text("ALTER TABLE members ADD COLUMN IF NOT EXISTS claim_token_expires_at TIMESTAMP;"))
                conn.execute(text("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_url TEXT;"))
                conn.execute(text("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'UPI';"))
                conn.execute(text("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) DEFAULT 'Pending Confirmation';"))
                conn.execute(text("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS confirmed_by TEXT;"))
                conn.execute(text("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurring_id INTEGER;"))
                conn.execute(text("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS disputed_by INTEGER;"))
                conn.execute(text("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS dispute_reason TEXT;"))
                conn.execute(text("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMP;"))
                conn.execute(text("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS resolved_by INTEGER;"))
                conn.execute(text("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS resolution_notes TEXT;"))
                conn.execute(text("ALTER TABLE expenses ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP;"))
                conn.execute(text("ALTER TABLE expense_splits ADD COLUMN IF NOT EXISTS shares NUMERIC(10, 2);"))
                conn.execute(text("ALTER TABLE expense_splits ADD COLUMN IF NOT EXISTS percentage NUMERIC(5, 2);"))
                conn.execute(text("ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS last_generated_period VARCHAR(20);"))
                conn.execute(text("ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS start_date DATE;"))
                conn.execute(text("ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS next_due_date DATE;"))
            conn.commit()

            # Ensure at least one admin exists if members are present
            from app.models.member import Member
            db_session = SessionLocal()
            try:
                admin_exists = db_session.query(Member).filter(Member.is_admin == True, Member.is_active == True).first()
                if not admin_exists:
                    first_member = db_session.query(Member).filter(Member.is_active == True).order_by(Member.id).first()
                    if first_member:
                        first_member.is_admin = True
                        db_session.commit()
            finally:
                db_session.close()
    except Exception as e:
        import logging
        logging.getLogger("uvicorn.error").error(f"Database migration failure: {e}")
        if settings.APP_ENV == "production":
            raise RuntimeError(f"FATAL: Production database migration failed: {e}")
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
