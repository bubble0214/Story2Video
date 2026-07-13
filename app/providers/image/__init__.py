from app.providers.image.base import BaseImageProvider
from app.providers.image.coze import CozeImageProvider

_PROVIDER_CLASSES: dict[str, type[BaseImageProvider]] = {
    "coze": CozeImageProvider,
}


class ImageFactory:
    """Factory that creates image provider instances based on configuration."""

    @staticmethod
    def create(
        provider: str,
        api_key: str,
        base_url: str | None = None,
        billing_project_id: str | None = None,
        space_id: str | None = None,
    ) -> BaseImageProvider:
        """Create an image provider by name.

        Args:
            provider: Provider name (coze).
            api_key: API key for the provider.
            base_url: Optional custom base URL for the provider API.
            billing_project_id: Coze billing project ID for API quota.
            space_id: Coze space ID.

        Returns:
            An instance of a BaseImageProvider subclass.
        """
        key = provider.lower()
        cls = _PROVIDER_CLASSES.get(key)
        if cls is None:
            raise ValueError(
                f"Unknown image provider: {provider}. "
                f"Available: {', '.join(sorted(_PROVIDER_CLASSES))}"
            )
        return cls(
            api_key=api_key,
            base_url=base_url,
            billing_project_id=billing_project_id,
            space_id=space_id,
        )


__all__ = [
    "BaseImageProvider",
    "ImageFactory",
    "CozeImageProvider",
]
