from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List, Optional

class Settings(BaseSettings):
    # ── App ─────────────────────────────────────────────────────────
    APP_HOST: str = Field(..., env="APP_HOST")
    APP_PORT: int = Field(..., env="APP_PORT")
    APP_DEBUG: bool = Field(..., env="APP_DEBUG")

    # ── Database ────────────────────────────────────────────────────
    MONGO_URI: str = Field(..., env="MONGO_URI")
    MONGO_DB: str = Field(default="hacking-health", env="MONGO_DB")

    # ── FCM ─────────────────────────────────────────────────────────
    FCM_PROJECT_ID: str = Field(..., env="FCM_PROJECT_ID")

settings = Settings()