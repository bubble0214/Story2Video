from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CreateCanvasReq(BaseModel):
    title: str = Field(default="Untitled Canvas", max_length=255)


class CanvasData(BaseModel):
    nodes: list[dict] = Field(default_factory=list)
    edges: list[dict] = Field(default_factory=list)
    viewport: dict | None = None


class UpdateCanvasReq(BaseModel):
    title: str | None = Field(None, max_length=255)
    data: CanvasData | None = None


class CanvasResp(BaseModel):
    id: UUID
    title: str
    data: CanvasData
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CanvasListItem(BaseModel):
    id: UUID
    title: str
    updated_at: datetime
