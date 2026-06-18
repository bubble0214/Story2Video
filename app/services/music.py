from __future__ import annotations

import logging

from app.providers.music import BaseMusicProvider, MusicFactory

logger = logging.getLogger(__name__)


class MusicService:
    """Service layer for music/song generation."""

    def __init__(self, provider: BaseMusicProvider) -> None:
        self._provider = provider

    @classmethod
    def from_settings(
        cls,
        provider_name: str,
        api_key: str,
    ) -> MusicService:
        """Create a MusicService from config settings."""
        provider = MusicFactory.create(provider_name, api_key)
        return cls(provider)

    async def generate_song(
        self,
        lyrics: str,
        style: str = "",
        **kwargs,
    ) -> str:
        """Generate a song and return the audio URL."""
        if not lyrics or not lyrics.strip():
            raise ValueError("Lyrics cannot be empty")
        return await self._provider.generate_song(
            lyrics=lyrics.strip(),
            style=style,
            **kwargs,
        )
