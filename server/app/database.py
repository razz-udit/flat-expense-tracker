import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

logger = logging.getLogger("uvicorn.error")

db_url = settings.sync_database_url

def init_engine(url: str):
    if url.startswith("sqlite"):
        return create_engine(url, connect_args={"check_same_thread": False}, echo=False)
    return create_engine(
        url,
        pool_pre_ping=True,
        pool_recycle=300,
        echo=False
    )

try:
    engine = init_engine(db_url)
    if not db_url.startswith("sqlite"):
        with engine.connect() as conn:
            pass
        logger.info(f"Connected to remote database successfully: {engine.url.render_as_string(hide_password=True)}")
except Exception as e:
    logger.warning(
        f"Could not connect to configured DATABASE_URL ({db_url.split('@')[-1] if '@' in db_url else db_url}). "
        f"Reason: {e}. Falling back to local SQLite database (sqlite:///./flat_expenses.db)."
    )
    db_url = "sqlite:///./flat_expenses.db"
    engine = init_engine(db_url)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
