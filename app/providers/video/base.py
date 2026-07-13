from __future__ import annotations

from abc import ABC, abstractmethod


class BaseVideoProvider(ABC):
    """Abstract base for video generation providers."""

    @abstractmethod
    async def generate_video(
        self,
        prompt: str,
        **kwargs,
    ) -> str:
        """Generate a video from a text prompt.

        Args:
            prompt: Text description of the desired video content.
            **kwargs: Additional provider-specific parameters.

        Returns:
            URL string pointing to the generated video file.
        """
        ...
