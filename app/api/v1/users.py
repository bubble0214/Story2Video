from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.dependencies import CurrentUserId, UserServiceDep
from app.schemas.auth import UserResp

router = APIRouter()


@router.get(
    "/me",
    response_model=UserResp,
    summary="Get current authenticated user",
)
async def get_me(
    user_id: CurrentUserId,
    svc: UserServiceDep,
) -> UserResp:
    try:
        entity = await svc.get_by_id(user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

    return UserResp(
        id=entity.id,
        email=entity.email,
        created_at=entity.created_at,
        updated_at=entity.updated_at,
    )
