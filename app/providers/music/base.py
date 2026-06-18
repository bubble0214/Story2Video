from __future__ import annotations

from abc import ABC, abstractmethod


class BaseMusicProvider(ABC):
    """Abstract base for music/song generation providers (Suno, Udio)."""

    @abstractmethod
    async def generate_song(
        self,
        lyrics: str,
        style: str = "",
        **kwargs,
    ) -> str:
        """Generate a song from lyrics and return the audio URL.

        Args:
            lyrics: The lyrics text for the song.
            style: Musical style or genre (e.g. pop, rock, cinematic).
            **kwargs: Additional provider-specific parameters.

        Returns:
            URL string pointing to the generated audio (mp3) file.
        """
        ...
