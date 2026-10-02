import json
from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


SERVER_DIR = Path(__file__).resolve().parent.parent
ROOT_DIR = SERVER_DIR.parent

ENV_FILES = (
    str(SERVER_DIR / ".env"),
    str(ROOT_DIR / ".env"),
    ".env",
)


class Settings(BaseSettings):
    APP_NAME: str = "Flat Expense & Payment Manager"

    # REQUIRED in production. Set through the hosting provider or server/.env.
    DATABASE_URL: str

    # REQUIRED in production. Comma-separated HTTPS origins.
    CORS_ORIGINS: str

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str) -> str:
        if isinstance(v, str):
            clean_v = v.strip()

            if not clean_v:
                raise ValueError("CORS_ORIGINS cannot be empty.")

            # Also accept JSON arrays:
            # ["http://localhost:5173", "https://example.com"]
            if clean_v.startswith("[") and clean_v.endswith("]"):
                try:
                    parsed = json.loads(clean_v)
                    if isinstance(parsed, list):
                        return [
                            str(item).strip()
                            for item in parsed
                            if str(item).strip()
                        ]
                except json.JSONDecodeError:
                    pass

            return clean_v

        raise ValueError("CORS_ORIGINS must be a string.")

    @property
    def cors_origins_list(self) -> List[str]:
        return [
            origin.strip()
            for origin in str(self.CORS_ORIGINS).split(",")
            if origin.strip()
        ]

    @property
    def sync_database_url(self) -> str:
        """Normalize PostgreSQL URLs for SQLAlchemy + psycopg2."""
        url = self.DATABASE_URL.strip()

        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+psycopg2://", 1)

        if url.startswith("postgresql://") and not url.startswith("postgresql+"):
            return url.replace("postgresql://", "postgresql+psycopg2://", 1)

        return url

    model_config = SettingsConfigDict(
        env_file=ENV_FILES,
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
