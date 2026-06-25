from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUserId, get_db
from app.repositories.draft import DraftRepository
from app.schemas.draft import (
    CreateDraftReq,
    DraftListItem,
    DraftResp,
    FinalNovelDecisionReq,
    FinalNovelDecisionResp,
    GenerateChapterReq,
    GenerateChapterResp,
    SubmitVolumeDecisionResp,
    UpdateDraftReq,
    VolumeReviewDecisionReq,
)
from app.services.draft import DraftService

router = APIRouter()


def get_draft_service(db: AsyncSession = Depends(get_db)) -> DraftService:
    return DraftService(DraftRepository(db))


@router.post(
    "/create",
    response_model=DraftResp,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new draft",
)
async def create_draft(
    body: CreateDraftReq,
    user_id: CurrentUserId,
    svc: DraftService = Depends(get_draft_service),
) -> DraftResp:
    draft = await svc.create(
        user_id=UUID(user_id),
        title=body.title,
        workflow_type=body.workflow_type,
    )
    return DraftResp.model_validate(draft)


@router.get(
    "/list",
    response_model=list[DraftListItem],
    summary="List user's drafts",
)
async def list_drafts(
    user_id: CurrentUserId,
    svc: DraftService = Depends(get_draft_service),
    workflow_type: str | None = Query(None, max_length=50),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[DraftListItem]:
    drafts = await svc.list_user_drafts(
        user_id=UUID(user_id),
        workflow_type=workflow_type,
        limit=limit,
        offset=offset,
    )
    return [DraftListItem.model_validate(d) for d in drafts]


@router.get(
    "/{draft_id}",
    response_model=DraftResp,
    summary="Get full draft with step data",
)
async def get_draft(
    draft_id: UUID,
    user_id: CurrentUserId,
    svc: DraftService = Depends(get_draft_service),
) -> DraftResp:
    draft = await svc.get(draft_id)
    if draft is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Draft not found",
        )
    if str(draft.user_id) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Draft does not belong to this user",
        )
    return DraftResp.model_validate(draft)


@router.put(
    "/{draft_id}",
    response_model=DraftResp,
    summary="Update draft",
)
async def update_draft(
    draft_id: UUID,
    body: UpdateDraftReq,
    user_id: CurrentUserId,
    svc: DraftService = Depends(get_draft_service),
) -> DraftResp:
    existing = await svc.get(draft_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Draft not found",
        )
    if str(existing.user_id) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Draft does not belong to this user",
        )

    draft = await svc.update(
        draft_id=draft_id,
        title=body.title,
        status=body.status,
        current_step=body.current_step,
        step_data=body.step_data,
    )
    if draft is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Draft not found",
        )
    return DraftResp.model_validate(draft)


@router.delete(
    "/{draft_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a draft",
)
async def delete_draft(
    draft_id: UUID,
    user_id: CurrentUserId,
    svc: DraftService = Depends(get_draft_service),
) -> Response:
    existing = await svc.get(draft_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Draft not found",
        )
    if str(existing.user_id) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Draft does not belong to this user",
        )
    await svc.delete(draft_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{draft_id}/generate-chapter",
    response_model=GenerateChapterResp,
    summary="Generate the next chapter interactively (novel only)",
)
async def generate_next_chapter(
    draft_id: UUID,
    body: GenerateChapterReq,
    user_id: CurrentUserId,
    svc: DraftService = Depends(get_draft_service),
) -> GenerateChapterResp:
    existing = await svc.get(draft_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Draft not found",
        )
    if str(existing.user_id) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Draft does not belong to this user",
        )

    try:
        result = await svc.generate_next_chapter(
            draft_id=draft_id,
            user_id=UUID(user_id),
            gen_model=body.gen_model,
            chapter_num=body.chapter_num,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    return GenerateChapterResp(
        chapter_num=result["chapter_num"],
        chapter_title=result["chapter_title"],
        chapter_content=result["chapter_content"],
        total_chapters=result["total_chapters"],
        draft=DraftResp.model_validate(result["draft"]),
        quality_check_needed=result.get("quality_check_needed", False),
        volume_review=result.get("volume_review"),
    )


@router.post(
    "/{draft_id}/volume-decision",
    response_model=GenerateChapterResp | SubmitVolumeDecisionResp,
    summary="Submit user's decision after volume 1 review (interactive mode)",
)
async def submit_volume_decision(
    draft_id: UUID,
    body: VolumeReviewDecisionReq,
    user_id: CurrentUserId,
    svc: DraftService = Depends(get_draft_service),
) -> GenerateChapterResp | SubmitVolumeDecisionResp:
    """After viewing the volume 1 review report, the user picks a direction.

    - 续写第二卷: generates volume 2 outline + first chapter 31
    - 修改后继续: applies revisions and marks as complete
    - 收束结局: generates first closing chapter 31
    """
    existing = await svc.get(draft_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Draft not found",
        )
    if str(existing.user_id) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Draft does not belong to this user",
        )

    try:
        result = await svc.submit_volume_decision(
            draft_id=draft_id,
            user_id=UUID(user_id),
            decision=body.decision,
            apply_revisions=body.apply_revisions,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    if "chapter_num" in result:
        return GenerateChapterResp(
            chapter_num=result["chapter_num"],
            chapter_title=result["chapter_title"],
            chapter_content=result["chapter_content"],
            total_chapters=result["total_chapters"],
            draft=DraftResp.model_validate(result["draft"]),
        )

    return SubmitVolumeDecisionResp(
        message=result.get("message", ""),
        volume_2_outline=result.get("volume_2_outline"),
        new_total_chapters=result.get("new_total_chapters", 0),
        draft=DraftResp.model_validate(result["draft"]),
    )


@router.post(
    "/{draft_id}/final-decision",
    response_model=FinalNovelDecisionResp,
    summary="Submit user's decision after the final novel review",
)
async def submit_final_decision(
    draft_id: UUID,
    body: FinalNovelDecisionReq,
    user_id: CurrentUserId,
    svc: DraftService = Depends(get_draft_service),
) -> FinalNovelDecisionResp:
    """After the final comprehensive novel review, the user can:
    - Apply revisions and/or mark the novel as complete.
    """
    existing = await svc.get(draft_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Draft not found",
        )
    if str(existing.user_id) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Draft does not belong to this user",
        )

    try:
        result = await svc.submit_final_decision(
            draft_id=draft_id,
            user_id=UUID(user_id),
            apply_revisions=body.apply_revisions,
            mark_complete=body.mark_complete,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    return FinalNovelDecisionResp(
        message=result.get("message", ""),
        draft=DraftResp.model_validate(result["draft"]),
    )
