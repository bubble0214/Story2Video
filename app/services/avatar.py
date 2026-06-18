from __future__ import annotations

import logging

from app.providers.avatar import AvatarFactory, BaseAvatarProvider

logger = logging.getLogger(__name__)


class AvatarService:
    """Service layer for digital-human video generation."""

    def __init__(self, provider: BaseAvatarProvider) -> None:
        self._provider = provider

    @classmethod
    def from_settings(
        cls,
        provider_name: str,
        api_key: str,
    ) -> AvatarService:
        """Create an AvatarService from config settings."""
        provider = AvatarFactory.create(provider_name, api_key)
        return cls(provider)

    async def generate_video(
        self,
        audio_url: str,
        avatar_id: str,
        **kwargs,
    ) -> str:
        """Generate a digital-human video and return the video URL."""
        if not audio_url or not audio_url.strip():
            raise ValueError("Audio URL cannot be empty")
        if not avatar_id or not avatar_id.strip():
            raise ValueError("Avatar ID cannot be empty")
        return await self._provider.generate_video(
            audio_url=audio_url.strip(),
            avatar_id=avatar_id.strip(),
            **kwargs,
        )
