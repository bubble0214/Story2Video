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
    "coze",
    "suno",
    "udio",
    "minimax",
    "heygen",
    "d-id",
    "custom",
]
PROVIDER_PATTERN = r"^(?:openai|claude|gemini|deepseek|qwen|glm|coze|suno|udio|minimax|heygen|d-id|custom)$"


class CreateApiKeyReq(BaseModel):
    provider: str = Field(..., pattern=PROVIDER_PATTERN)
    key: str = Field(..., min_length=1)
    base_url: str | None = Field(None, max_length=256)
    model_name: str | None = Field(None, max_length=128)
    coze_space_id: str | None = Field(None, max_length=50)
    coze_billing_project_id: str | None = Field(None, max_length=50)


class UpdateApiKeyReq(BaseModel):
    key: str = Field(..., min_length=1)
    base_url: str | None = Field(None, max_length=256)
    model_name: str | None = Field(None, max_length=128)
    coze_space_id: str | None = Field(None, max_length=50)
    coze_billing_project_id: str | None = Field(None, max_length=50)


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
    coze_space_id: str | None = None
    coze_billing_project_id: str | None = None
    created_at: datetime


class TestApiKeyResp(BaseModel):
    success: bool
    message: str


# ── Coze auto-discovery ───────────────────────────────────────────────


class CozeDiscoverReq(BaseModel):
    api_key: str = Field(..., min_length=1)
    base_url: str | None = None


class CozeBotInfo(BaseModel):
    bot_id: str
    name: str
    is_published: bool = False


class CozeWorkspaceInfo(BaseModel):
    space_id: str
    name: str
    billing_project_id: str | None = None
    bots: list[CozeBotInfo] = Field(default_factory=list)


class CozeDiscoverResp(BaseModel):
    workspaces: list[CozeWorkspaceInfo]


class CozeCreateBotReq(BaseModel):
    api_key: str = Field(..., min_length=1)
    space_id: str = Field(..., min_length=1)
    name: str = Field(..., min_length=1, max_length=64)
    description: str = Field("", max_length=512)
    base_url: str | None = None


class CozeCreateBotResp(BaseModel):
    bot_id: str
    name: str
    is_published: bool = True
