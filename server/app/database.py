import logging

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings


logger = logging.getLogger("uvicorn.error")
db_url = settings.sync_database_url


def init_engine(url: str):
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args, echo=False)


engine = init_engine(db_url)

if not db_url.startswith("sqlite"):
    try:
        with engine.connect():
            pass

        logger.info(
            "Connected to configured database successfully: %s",
            engine.url.render_as_string(hide_password=True),
        )
    except Exception as exc:
        logger.exception(
            "Could not connect to configured DATABASE_URL. "
            "The application will not silently fall back to SQLite."
        )
        raise RuntimeError("Database connection failed. Check DATABASE_URL.") from exc


SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
