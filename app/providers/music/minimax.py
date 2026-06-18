from __future__ import annotations

import asyncio
import logging

import httpx

from app.providers.music.base import BaseMusicProvider

logger = logging.getLogger(__name__)


class MiniMaxMusicProvider(BaseMusicProvider):
    """MiniMax Music-2.6 (T2M-2.6) music generation provider.

    API reference: https://platform.minimaxi.com/documentation/Music%20Generation
    """

    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self._api_key = api_key
        self._base_url = (base_url or "https://api.minimaxi.com").rstrip("/")
        self._poll_interval = 5.0
        self._max_polls = 60

    async def generate_song(
        self,
        lyrics: str,
        style: str = "",
        **kwargs,
    ) -> str:
        """Generate a song via MiniMax Music API (create task -> poll -> return audio URL)."""
        async with httpx.AsyncClient(timeout=30) as client:
            # Step 1: Submit generation task
            payload: dict = {
                "model": "music-2.6",
                "lyrics": lyrics,
                "style": style or "pop",
                **kwargs,
            }
            resp = await client.post(
                f"{self._base_url}/v1/music",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if resp.status_code != 200:
                raise ValueError(
                    f"MiniMax music generation failed: HTTP {resp.status_code} {resp.text}"
                )
            data = resp.json()
            task_id = data.get("task_id", "")

            if not task_id:
                raise ValueError(
                    f"MiniMax did not return a task ID: {data}"
                )

            # Step 2: Poll for completion
            for _ in range(self._max_polls):
                await asyncio.sleep(self._poll_interval)
                poll_resp = await client.get(
                    f"{self._base_url}/v1/music/{task_id}",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
                if poll_resp.status_code != 200:
                    raise ValueError(
                        f"MiniMax poll failed: HTTP {poll_resp.status_code} "
                        f"{poll_resp.text}"
                    )
                status_data = poll_resp.json()
                status = status_data.get("status", "").lower()

                if status == "completed":
                    items = status_data.get("data", [])
                    if not items:
                        raise ValueError(
                            f"MiniMax completed but no data array in response: "
                            f"{status_data}"
                        )
                    audio_url = items[0].get("audio_url", "")
                    if not audio_url:
                        raise ValueError(
                            f"MiniMax completed but no audio_url in data[0]: "
                            f"{status_data}"
                        )
                    return audio_url

                if status in ("failed", "error"):
                    raise ValueError(
                        f"MiniMax generation failed with status '{status}': "
                        f"{status_data.get('error', '')}"
                    )

                # Still "pending" or "running" — continue polling

            raise TimeoutError(
                f"MiniMax generation timed out after "
                f"{self._poll_interval * self._max_polls}s"
            )
