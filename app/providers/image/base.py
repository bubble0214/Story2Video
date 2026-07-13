from __future__ import annotations

from abc import ABC, abstractmethod


class BaseImageProvider(ABC):
    """Abstract base for image generation providers."""

    @abstractmethod
    async def generate_image(
        self,
        prompt: str,
        **kwargs,
    ) -> str:
        """Generate an image from a text prompt.

        Args:
            prompt: Text description of the desired image.
            **kwargs: Additional provider-specific parameters.

        Returns:
            URL string pointing to the generated image file.
        """
        ...
