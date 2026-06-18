from __future__ import annotations

from abc import ABC, abstractmethod


class BaseAvatarProvider(ABC):
    """Abstract base for digital-human / avatar video providers."""

    @abstractmethod
    async def generate_video(
        self,
        audio_url: str,
        avatar_id: str,
        **kwargs,
    ) -> str:
        """Generate a video with a digital human from audio and avatar ID.

        Args:
            audio_url: URL of the pre-generated audio file.
            avatar_id: Identifier for the digital human avatar to use.
            **kwargs: Additional provider-specific parameters (e.g. background,
                      caption, aspect_ratio).

        Returns:
            URL string pointing to the generated video file.
        """
        ...
