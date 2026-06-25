from __future__ import annotations

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_name: str = "Story2Video"
    app_version: str = "1.0.0"
    debug: bool = False

    # PostgreSQL
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "story2video"
    postgres_user: str = "story2video"
    postgres_password: str = "change_me_in_production"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def database_url_sync(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: str = ""

    @field_validator("postgres_port", mode="before")
    @classmethod
    def force_postgres_port_in_docker(cls, v):
        # In Docker (POSTGRES_HOST=postgres), force 5432
        import os
        if os.environ.get("POSTGRES_HOST") == "postgres":
            return 5432
        return v

    @field_validator("redis_port", mode="before")
    @classmethod
    def force_redis_port_in_docker(cls, v):
        import os
        if os.environ.get("REDIS_HOST") == "redis":
            return 6379
        return v

    @field_validator("celery_broker_url", "celery_result_backend", mode="before")
    @classmethod
    def fix_celery_redis_url(cls, v, info):
        import os
        # Prefer uppercase Docker env variable over lowercase host env
        field_name = info.field_name
        docker_env = os.environ.get(field_name.upper())
        if docker_env:
            return docker_env
        # If the value is the Docker default, let pydantic-settings use the .env value
        return v

    @property
    def redis_url(self) -> str:
        if self.redis_password:
            return f"redis://:{self.redis_password}@{self.redis_host}:{self.redis_port}/{self.redis_db}"
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"

    # JWT
    jwt_secret_key: str = "change_me_in_production_jwt_secret_key_32chars"
    jwt_algorithm: str = "HS256"
    jwt_issuer: str = "story2video"
    jwt_audience: str = "story2video-web"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Encryption (AES-256 — must be 64 hex chars = 32 bytes)
    encryption_key: str = "change_me_in_production_enc_key_64_hex_chars_123456"

    # Embedding (openai, deepseek, qwen)
    embedding_provider: str = "openai"
    embedding_api_key: str = ""

    # LLM
    llm_provider: str = "openai"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o"

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:3004", "http://localhost:8001"]

    # Celery
    celery_broker_url: str = "redis://redis:6379/1"
    celery_result_backend: str = "redis://redis:6379/1"

    # Music Generation (supported: suno, udio, minimax)
    music_provider: str = "suno"
    music_api_key: str = ""

    # Avatar / Digital Human
    avatar_provider: str = "heygen"
    avatar_api_key: str = ""


settings = Settings()
