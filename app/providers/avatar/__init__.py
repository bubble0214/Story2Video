from app.providers.avatar.base import BaseAvatarProvider
from app.providers.avatar.heygen import HeyGenProvider
from app.providers.avatar.did import DIDProvider

_PROVIDER_CLASSES: dict[str, type[BaseAvatarProvider]] = {
    "heygen": HeyGenProvider,
    "did": DIDProvider,
}


class AvatarFactory:
    """Factory that creates avatar/digital-human provider instances."""

    @staticmethod
    def create(
        provider: str,
        api_key: str,
        base_url: str | None = None,
    ) -> BaseAvatarProvider:
        """Create an avatar provider by name.

        Args:
            provider: Provider name (heygen, did).
            api_key: API key for the provider.
            base_url: Optional custom base URL for the provider API.

        Returns:
            An instance of a BaseAvatarProvider subclass.
        """
        key = provider.lower()
        cls = _PROVIDER_CLASSES.get(key)
        if cls is None:
            raise ValueError(
                f"Unknown avatar provider: {provider}. "
                f"Available: {', '.join(sorted(_PROVIDER_CLASSES))}"
            )
        return cls(api_key=api_key, base_url=base_url)


__all__ = [
    "BaseAvatarProvider",
    "AvatarFactory",
    "HeyGenProvider",
    "DIDProvider",
]
