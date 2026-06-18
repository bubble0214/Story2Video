from __future__ import annotations

import asyncio
import json
import logging

import httpx

from app.providers.music.base import BaseMusicProvider

logger = logging.getLogger(__name__)


class UdioProvider(BaseMusicProvider):
    """Udio music generation provider.

    Uses Udio's API to generate songs from lyrics.
    API reference: https://www.udio.com/api/docs
    """

    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self._api_key = api_key
        self._base_url = (base_url or "https://api.udio.ai").rstrip("/")
        self._poll_interval = 5.0
        self._max_polls = 60

    async def generate_song(
        self,
        lyrics: str,
        style: str = "",
        **kwargs,
    ) -> str:
        """Generate a song via Udio API (create → poll → return audio URL)."""
        async with httpx.AsyncClient(timeout=30) as client:
            # Step 1: Submit generation request
            payload: dict = {
                "lyrics": lyrics,
                "style": style or "pop",
                **kwargs,
            }
            resp = await client.post(
                f"{self._base_url}/v1/generate",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if resp.status_code != 200:
                raise ValueError(
                    f"Udio generation failed: HTTP {resp.status_code} {resp.text}"
                )
            data = resp.json()
            generation_id = data.get("id") or data.get("generation_id", "")

            if not generation_id:
                raise ValueError(
                    f"Udio did not return a generation ID: {data}"
                )

            # Step 2: Poll for completion
            for _ in range(self._max_polls):
                await asyncio.sleep(self._poll_interval)
                poll_resp = await client.get(
                    f"{self._base_url}/v1/generate/{generation_id}",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
                if poll_resp.status_code != 200:
                    raise ValueError(
                        f"Udio poll failed: HTTP {poll_resp.status_code} "
                        f"{poll_resp.text}"
                    )
                status_data = poll_resp.json()
                status = status_data.get("status", "").lower()

                if status == "completed":
                    audio_url = (
                        status_data.get("audio_url")
                        or status_data.get("download_url")
                        or ""
                    )
                    if not audio_url:
                        raise ValueError(
                            f"Udio completed but no audio URL in response: "
                            f"{status_data}"
                        )
                    return audio_url

                if status in ("failed", "error"):
                    raise ValueError(
                        f"Udio generation failed with status '{status}': "
                        f"{status_data.get('error', '')}"
                    )

            raise TimeoutError(
                f"Udio generation timed out after "
                f"{self._poll_interval * self._max_polls}s"
            )
