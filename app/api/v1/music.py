from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.config import settings
from app.core.dependencies import CurrentUserId
from app.services.music import MusicService

router = APIRouter()


def get_music_service() -> MusicService:
    return MusicService.from_settings(
        settings.music_provider,
        settings.music_api_key,
    )


@router.post(
    "/generate",
    status_code=status.HTTP_200_OK,
    summary="Generate a song from lyrics",
)
async def generate_song(
    body: MusicGenerateReq,
    user_id: CurrentUserId,
    svc: MusicService = Depends(get_music_service),
) -> MusicGenerateResp:
    """Generate a song using the configured music provider and return the audio URL."""
    try:
        audio_url = await svc.generate_song(
            lyrics=body.lyrics,
            style=body.style,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    return MusicGenerateResp(audio_url=audio_url)


# ── Schemas (local to keep endpoints self-contained) ────────────────────


from pydantic import BaseModel, Field


class MusicGenerateReq(BaseModel):
    """Request to generate a song from lyrics."""

    lyrics: str = Field(..., min_length=1, description="Lyrics text for the song")
    style: str = Field(default="pop", description="Musical style or genre")


class MusicGenerateResp(BaseModel):
    """Response containing the generated audio URL."""

    audio_url: str