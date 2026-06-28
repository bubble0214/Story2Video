from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class CreateDraftReq(BaseModel):
    title: str = Field(default="未命名", max_length=255)
    workflow_type: str = Field(default="novel", max_length=50)
    draft_group_id: str | None = Field(default=None, description="UUID string for grouping related drafts")


class UpsertDraftReq(BaseModel):
    title: str = Field(default="未命名", max_length=255)
    workflow_type: str = Field(default="novel", max_length=50)
    current_step: str = Field(default="prompt", max_length=50)
    step_data: dict = Field(default_factory=lambda: {"schema_version": 1})


class UpdateDraftReq(BaseModel):
    title: str | None = Field(None, max_length=255)
    status: str | None = Field(None, max_length=20)
    current_step: str | None = Field(None, max_length=50)
    step_data: dict | None = None


class DraftResp(BaseModel):
    id: UUID
    title: str
    workflow_type: str
    draft_group_id: UUID | None = None
    status: str
    current_step: str
    step_data: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DraftListItem(BaseModel):
    id: UUID
    title: str
    workflow_type: str
    draft_group_id: UUID | None = None
    status: str
    current_step: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class GenerateChapterReq(BaseModel):
    gen_model: str | None = Field(
        None, description="Model override, e.g. 'claude::claude-sonnet-4-20250514'"
    )
    chapter_num: int | None = Field(
        None, description="Specific chapter number to regenerate (1-based). If omitted, generates the next chapter."
    )


class VolumeReviewReport(BaseModel):
    review_text: str
    decision: str
    parsed_decision: str
    analysis_summary: str = ""


class VolumeReviewResp(BaseModel):
    volume_review_report: VolumeReviewReport
    chapter_count: int
    total_chapters: int
    volume_2_outline: str | None = None
    revised_chapters: list[dict] | None = None


class FinalReviewResp(BaseModel):
    report: str
    chapter_count: int
    total_chapters: int
    revised_chapters: list[dict] | None = None


class GenerateChapterResp(BaseModel):
    chapter_num: int
    chapter_title: str
    chapter_content: str
    total_chapters: int
    draft: DraftResp
    quality_check_needed: bool = False
    volume_review: VolumeReviewResp | None = None
    final_review: FinalReviewResp | None = None


class VolumeReviewDecisionReq(BaseModel):
    decision: str = Field(
        ..., description="One of: 续写第二卷, 修改后继续, 收束结局"
    )
    apply_revisions: bool = Field(
        default=False, description="Whether to apply chapter revisions from the review"
    )


class SubmitVolumeDecisionResp(BaseModel):
    message: str
    volume_2_outline: str | None = None
    new_total_chapters: int
    draft: DraftResp


class FinalNovelDecisionReq(BaseModel):
    apply_revisions: bool = Field(
        default=False, description="Whether to apply revisions from the final review"
    )
    mark_complete: bool = Field(
        default=True, description="Whether to mark the novel as complete"
    )


class FinalNovelDecisionResp(BaseModel):
    message: str
    draft: DraftResp
