import json
import logging
from pathlib import Path
from typing import List, Union, Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("uvicorn.error")

SERVER_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = SERVER_DIR.parent

ENV_FILES = (
    str(SERVER_DIR / ".env"),
    str(ROOT_DIR / ".env"),
    ".env",
)

class Settings(BaseSettings):
    APP_NAME: str = "Flat Expense & Payment Manager"
    APP_ENV: str = "development" # "development", "test", "production"
    
    # Database
    DATABASE_URL: str = "sqlite:///./flat_expenses.db"

    # Authentication & Session Security
    AUTH_SECRET: str = ""
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440  # 24 hours default
    
    # Google OAuth
    GOOGLE_CLIENT_ID: Optional[str] = None

    # CORS
    CORS_ORIGINS: Union[str, List[str]] = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:8000,http://127.0.0.1:8000,"
        "https://flat-expense-tracker-frontend.onrender.com,"
        "https://flat-expense-tracker-backend.onrender.com,"
        "https://flat-payment-tracker.onrender.com"
    )

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, list):
            return [str(item).strip() for item in v if str(item).strip()]
        if isinstance(v, str):
            clean_v = v.strip()
            if not clean_v:
                return ["*"]
            if clean_v.startswith("[") and clean_v.endswith("]"):
                try:
                    parsed = json.loads(clean_v)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except Exception:
                    pass
            return [part.strip() for part in clean_v.split(",") if part.strip()]
        return ["*"]

    @property
    def cors_origins_list(self) -> List[str]:
        if isinstance(self.CORS_ORIGINS, list):
            return self.CORS_ORIGINS
        return [s.strip() for s in str(self.CORS_ORIGINS).split(",") if s.strip()]

    @property
    def sync_database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+psycopg2://", 1)
        elif url.startswith("postgresql://") and not url.startswith("postgresql+"):
            url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
        return url

    def get_auth_secret(self) -> str:
        """Returns the auth secret, providing an ephemeral dev secret in non-production environments."""
        if self.APP_ENV == "production":
            if not self.AUTH_SECRET or len(self.AUTH_SECRET) < 32:
                raise RuntimeError(
                    "CRITICAL: AUTH_SECRET must be configured with at least 32 characters in production. "
                    "Application startup aborted."
                )
            return self.AUTH_SECRET
        if self.AUTH_SECRET and len(self.AUTH_SECRET) >= 16:
            return self.AUTH_SECRET
        # Safe default for local development and automated testing only
        return "dev-local-jwt-secret-session-key-32chars-min!!"

    model_config = SettingsConfigDict(
        env_file=ENV_FILES,
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
