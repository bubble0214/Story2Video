from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUserId, get_db
from app.repositories.canvas import CanvasRepository
from app.schemas.canvas import (
    CanvasListItem,
    CanvasResp,
    CreateCanvasReq,
    UpdateCanvasReq,
)
from app.services.canvas import CanvasService

router = APIRouter()


def get_canvas_service(db: AsyncSession = Depends(get_db)) -> CanvasService:
    return CanvasService(CanvasRepository(db))


@router.post(
    "/create",
    response_model=CanvasResp,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new empty canvas",
)
async def create_canvas(
    body: CreateCanvasReq,
    user_id: CurrentUserId,
    svc: CanvasService = Depends(get_canvas_service),
) -> CanvasResp:
    canvas = await svc.create(user_id=UUID(user_id), title=body.title)
    return CanvasResp.model_validate(canvas)


@router.get(
    "/list",
    response_model=list[CanvasListItem],
    summary="List user's canvases",
)
async def list_canvases(
    user_id: CurrentUserId,
    svc: CanvasService = Depends(get_canvas_service),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[CanvasListItem]:
    canvases = await svc.list_user_canvases(
        user_id=UUID(user_id),
        limit=limit,
        offset=offset,
    )
    return [CanvasListItem.model_validate(c) for c in canvases]


@router.get(
    "/{canvas_id}",
    response_model=CanvasResp,
    summary="Get full canvas with data",
)
async def get_canvas(
    canvas_id: UUID,
    user_id: CurrentUserId,
    svc: CanvasService = Depends(get_canvas_service),
) -> CanvasResp:
    canvas = await svc.get(canvas_id)
    if canvas is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found",
        )
    if str(canvas.user_id) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Canvas does not belong to this user",
        )
    return CanvasResp.model_validate(canvas)


@router.put(
    "/{canvas_id}",
    response_model=CanvasResp,
    summary="Update canvas title and/or data",
)
async def update_canvas(
    canvas_id: UUID,
    body: UpdateCanvasReq,
    user_id: CurrentUserId,
    svc: CanvasService = Depends(get_canvas_service),
) -> CanvasResp:
    # Verify ownership
    existing = await svc.get(canvas_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found",
        )
    if str(existing.user_id) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Canvas does not belong to this user",
        )

    data_dict = body.data.model_dump() if body.data is not None else None
    canvas = await svc.update(
        canvas_id=canvas_id,
        title=body.title,
        data=data_dict,
    )
    if canvas is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found",
        )
    return CanvasResp.model_validate(canvas)


@router.delete(
    "/{canvas_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a canvas",
)
async def delete_canvas(
    canvas_id: UUID,
    user_id: CurrentUserId,
    svc: CanvasService = Depends(get_canvas_service),
) -> Response:
    # Verify ownership
    existing = await svc.get(canvas_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Canvas not found",
        )
    if str(existing.user_id) != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Canvas does not belong to this user",
        )
    await svc.delete(canvas_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
