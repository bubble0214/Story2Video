from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CreateTaskReq(BaseModel):
    """Request to create and start a new workflow task."""

    workflow_type: str = Field(
        ...,
        pattern=r"^(generate_novel|generate_long_novel|generate_script|generate_lyrics|generate_song|generate_image|generate_video)$",
        description="Workflow type to execute",
    )
    input_params: dict = Field(
        default_factory=dict,
        description="Input parameters for the workflow (e.g. title, theme, genre)",
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
