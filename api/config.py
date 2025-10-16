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

    # ── Food AI ────────────────────────────────────────────────────
    OPENAI_API_KEY: str = Field(..., env="OPENAI_API_KEY")

    # -- AWS ────────────────────────────────────────────────────────
    AWS_ACCESS_KEY_ID: str = Field(..., env="AWS_ACCESS_KEY_ID")
    AWS_SECRET_ACCESS_KEY: str = Field(..., env="AWS_SECRET_ACCESS_KEY")
    AWS_S3_BUCKET: str = Field(..., env="AWS_S3_BUCKET")

settings = Settings()