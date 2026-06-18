from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUserId, get_db
from app.repositories.user_preference import UserPreferenceRepository
from app.schemas.user_preference import (
    UpdatePreferenceReq,
    UserPreferenceResp,
)
from app.services.user_preference import UserPreferenceService

router = APIRouter()


def get_preference_service(
    db: AsyncSession = Depends(get_db),
) -> UserPreferenceService:
    return UserPreferenceService(UserPreferenceRepository(db))


@router.get(
    "",
    response_model=UserPreferenceResp,
    summary="Get current user's preferences",
)
async def get_preferences(
    user_id: CurrentUserId,
    svc: UserPreferenceService = Depends(get_preference_service),
) -> UserPreferenceResp:
    data = await svc.get(user_id)
    return UserPreferenceResp(**data)


@router.put(
    "",
    response_model=UserPreferenceResp,
    summary="Update user preferences",
)
async def update_preferences(
    body: UpdatePreferenceReq,
    user_id: CurrentUserId,
    svc: UserPreferenceService = Depends(get_preference_service),
) -> UserPreferenceResp:
    data = await svc.update_embedding_provider(user_id, body.embedding_provider)
    return UserPreferenceResp(**data)
