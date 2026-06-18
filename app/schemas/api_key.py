from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# Supported providers
PROVIDERS = [
    "openai",
    "claude",
    "gemini",
    "deepseek",
    "qwen",
    "glm",
    "suno",
    "udio",
    "heygen",
    "d-id",
    "custom",
]
PROVIDER_PATTERN = r"^(?:openai|claude|gemini|deepseek|qwen|glm|suno|udio|heygen|d-id|custom)$"


class CreateApiKeyReq(BaseModel):
    provider: str = Field(..., pattern=PROVIDER_PATTERN)
    key: str = Field(..., min_length=1)
    base_url: str | None = Field(None, max_length=256)
    model_name: str | None = Field(None, max_length=128)


class UpdateApiKeyReq(BaseModel):
    key: str = Field(..., min_length=1)
    base_url: str | None = Field(None, max_length=256)
    model_name: str | None = Field(None, max_length=128)


class TestApiKeyReq(BaseModel):
    provider: str = Field(..., pattern=PROVIDER_PATTERN)
    key: str = Field("", min_length=0)
    base_url: str | None = Field(None, max_length=256)
    model_name: str | None = Field(None, max_length=128)


class ApiKeyResp(BaseModel):
    id: UUID
    provider: str
    base_url: str | None = None
    model_name: str | None = None
    created_at: datetime


class TestApiKeyResp(BaseModel):
    success: bool
    message: str
