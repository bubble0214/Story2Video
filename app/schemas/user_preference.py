from __future__ import annotations

from uuid import UUID

from pydantic import BaseModel, Field


class UserPreferenceResp(BaseModel):
    embedding_provider: str | None = None


class UpdatePreferenceReq(BaseModel):
    embedding_provider: str = Field(..., min_length=1)
