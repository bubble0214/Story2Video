from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CreateTaskReq(BaseModel):
    """Request to create and start a new workflow task."""

    workflow_type: str = Field(
        ...,
        pattern=r"^(generate_outline_only|generate_volume_outline_only|generate_character_rules_only|generate_script|generate_novel_tweet|generate_video_tweet|generate_storyboard|generate_lyrics|generate_song|generate_image|generate_video)$",
        description="Workflow type to execute",
    )
    input_params: dict = Field(
        default_factory=dict,
        description="Input parameters for the workflow (e.g. title, theme, genre)",
    )


class UpdateTaskResultReq(BaseModel):
    """Request to update specific fields of a task's result dict."""

    result: dict = Field(
        ...,
        description="Partial result fields to merge into the existing task result",
    )


class TaskResp(BaseModel):
    """Public response for a task."""

    id: UUID
    user_id: UUID
    workflow_type: str
    status: str
    progress: float
    current_step: str
    error_message: str
    result: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TaskProgressResp(BaseModel):
    """Lightweight progress-only response."""

    id: UUID
    status: str
    progress: float
    current_step: str
    error_message: str


class TaskListResp(BaseModel):
    """Paginated list of tasks."""

    items: list[TaskResp]
    total: int
    limit: int
    offset: int
