from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.core.dependencies import CurrentUserId
from app.services.avatar import AvatarService

router = APIRouter()


def get_avatar_service() -> AvatarService:
    return AvatarService.from_settings(
        settings.avatar_provider,
        settings.avatar_api_key,
    )


@router.post(
    "/generate-video",
    status_code=status.HTTP_200_OK,
    summary="Generate a digital-human video",
)
async def generate_video(
    body: AvatarVideoReq,
    user_id: CurrentUserId,
    svc: AvatarService = Depends(get_avatar_service),
) -> AvatarVideoResp:
    """Generate a digital-human video from audio using the configured avatar provider."""
    try:
        video_url = await svc.generate_video(
            audio_url=body.audio_url,
            avatar_id=body.avatar_id,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    return AvatarVideoResp(video_url=video_url)


# ── Schemas (local to keep endpoints self-contained) ────────────────────


from pydantic import BaseModel, Field


class AvatarVideoReq(BaseModel):
    """Request to generate a digital-human video."""

    audio_url: str = Field(
        ..., min_length=1, description="URL of the pre-generated audio file"
    )
    avatar_id: str = Field(
        ..., min_length=1, description="Identifier of the digital-human avatar"
    )


class AvatarVideoResp(BaseModel):
    """Response containing the generated video URL."""

    video_url: str