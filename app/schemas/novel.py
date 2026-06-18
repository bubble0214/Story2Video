from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ImportNovelReq(BaseModel):
    title: str = Field(..., min_length=1)
    author: str = Field(..., min_length=1)
    tags: str = Field(default="")
    summary: str = Field(..., min_length=1)


class SearchNovelReq(BaseModel):
    keywords: list[str] = Field(..., min_length=1)


class NovelResp(BaseModel):
    id: UUID
    title: str
    author: str
    tags: str
    summary: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SearchResultItem(BaseModel):
    id: UUID
    title: str
    score: float