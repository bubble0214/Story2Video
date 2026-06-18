from app.providers.music.base import BaseMusicProvider
from app.providers.music.suno import SunoProvider
from app.providers.music.udio import UdioProvider
from app.providers.music.minimax import MiniMaxMusicProvider

_PROVIDER_CLASSES: dict[str, type[BaseMusicProvider]] = {
    "suno": SunoProvider,
    "udio": UdioProvider,
    "minimax": MiniMaxMusicProvider,
}


class MusicFactory:
    """Factory that creates music provider instances based on configuration."""

    @staticmethod
    def create(
        provider: str,
        api_key: str,
        base_url: str | None = None,
    ) -> BaseMusicProvider:
        """Create a music provider by name.

        Args:
            provider: Provider name (suno, udio).
            api_key: API key for the provider.
            base_url: Optional custom base URL for the provider API.

        Returns:
            An instance of a BaseMusicProvider subclass.
        """
        key = provider.lower()
        cls = _PROVIDER_CLASSES.get(key)
        if cls is None:
            raise ValueError(
                f"Unknown music provider: {provider}. "
                f"Available: {', '.join(sorted(_PROVIDER_CLASSES))}"
            )
        return cls(api_key=api_key, base_url=base_url)


__all__ = [
    "BaseMusicProvider",
    "MusicFactory",
    "SunoProvider",
    "UdioProvider",
    "MiniMaxMusicProvider",
]
