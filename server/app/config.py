import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "Flat Expense & Payment Manager"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./flat_expenses.db")
    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000"]

    @property
    def sync_database_url(self) -> str:
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql://", 1)
        return url

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()
