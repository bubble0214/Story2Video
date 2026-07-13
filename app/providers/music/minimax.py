from __future__ import annotations

import logging

import httpx

from app.providers.music.base import BaseMusicProvider

logger = logging.getLogger(__name__)


class MiniMaxMusicProvider(BaseMusicProvider):
    """MiniMax Music-2.6 (T2M-2.6) music generation provider.

    API reference: https://platform.minimaxi.com/documentation/Music%20Generation

    The API is synchronous — the audio URL is returned directly in the
    response body (no polling required).

    Success response::

        {
          "data": { "audio": "https://...mp3", "status": 2, ... },
          "base_resp": { "status_code": 0, "status_msg": "success" }
        }
    """

    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self._api_key = api_key
        self._base_url = (base_url or "https://api.minimaxi.com").rstrip("/")

    async def generate_song(
        self,
        lyrics: str,
        style: str = "",
        **kwargs,
    ) -> str:
        """Generate a song via MiniMax Music API (synchronous, no polling).

        Args:
            lyrics: Full lyrics text.
            style: Fallback style descriptor when ``prompt`` is not provided
                via ``**kwargs``.  The API field is named ``prompt``.
            **kwargs: Additional parameters forwarded to the API.  Supported
                keys include ``prompt`` (overrides ``style``), ``model``
                (default ``"music-2.6"``), and ``output_format`` (default
                ``"url"``).

        Returns:
            The audio URL of the generated song.

        Raises:
            ValueError: If the API returns a non-zero status code or the
                response is missing the audio URL.
        """
        prompt = kwargs.pop("prompt", "") or style

        payload: dict = {
            "model": kwargs.pop("model", "music-2.6"),
            "prompt": prompt or "pop",
            "lyrics": lyrics,
            "output_format": kwargs.pop("output_format", "url"),
        }
        # Forward any remaining provider-specific params
        payload.update(kwargs)

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                f"{self._base_url}/v1/music_generation",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if resp.status_code != 200:
            raise ValueError(
                f"MiniMax API returned HTTP {resp.status_code}: {resp.text}"
            )

        body = resp.json()

        # Check for API-level errors
        base_resp = body.get("base_resp", {})
        status_code = base_resp.get("status_code", -1)
        if status_code != 0:
            status_msg = base_resp.get("status_msg", "unknown error")
            raise ValueError(
                f"MiniMax API error (code {status_code}): {status_msg}"
            )

        # Extract audio URL from data
        data = body.get("data", {})
        if isinstance(data, dict):
            audio_url = data.get("audio") or data.get("audio_url", "")
        else:
            audio_url = ""
        if not audio_url:
            raise ValueError(
                f"MiniMax response missing audio/audio_url in data: {body}"
            )

        logger.info(
            "Song generated successfully (duration=%.1fs, size=%s bytes)",
            (data.get("music_duration", 0) or 0) / 1000,
            data.get("music_size", "?"),
        )
        return audio_url
