from __future__ import annotations

import asyncio
import json
import logging

import httpx

from app.providers.avatar.base import BaseAvatarProvider

logger = logging.getLogger(__name__)


class HeyGenProvider(BaseAvatarProvider):
    """HeyGen digital-human video generation provider.

    Uses HeyGen's API to generate avatar videos from audio.
    API reference: https://docs.heygen.com/
    """

    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self._api_key = api_key
        self._base_url = (base_url or "https://api.heygen.com").rstrip("/")
        self._poll_interval = 5.0
        self._max_polls = 120

    async def generate_video(
        self,
        audio_url: str,
        avatar_id: str,
        **kwargs,
    ) -> str:
        """Generate a video via HeyGen API (create → poll → return video URL)."""
        async with httpx.AsyncClient(timeout=30) as client:
            # Step 1: Submit video generation request
            payload: dict = {
                "audio_url": audio_url,
                "avatar_id": avatar_id,
                **kwargs,
            }
            resp = await client.post(
                f"{self._base_url}/v1/video.generate",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if resp.status_code != 200:
                raise ValueError(
                    f"HeyGen video generation failed: HTTP {resp.status_code} "
                    f"{resp.text}"
                )
            data = resp.json()
            video_id = data.get("id") or data.get("video_id", "")

            if not video_id:
                raise ValueError(
                    f"HeyGen did not return a video ID: {data}"
                )

            # Step 2: Poll for completion
            for _ in range(self._max_polls):
                await asyncio.sleep(self._poll_interval)
                poll_resp = await client.get(
                    f"{self._base_url}/v1/video.status/{video_id}",
                    headers={"Authorization": f"Bearer {self._api_key}"},
                )
                if poll_resp.status_code != 200:
                    raise ValueError(
                        f"HeyGen poll failed: HTTP {poll_resp.status_code} "
                        f"{poll_resp.text}"
                    )
                status_data = poll_resp.json()
                status = status_data.get("status", "").lower()

                if status == "completed":
                    video_url = (
                        status_data.get("video_url")
                        or status_data.get("download_url")
                        or ""
                    )
                    if not video_url:
                        raise ValueError(
                            f"HeyGen completed but no video URL in response: "
                            f"{status_data}"
                        )
                    return video_url

                if status in ("failed", "error"):
                    raise ValueError(
                        f"HeyGen generation failed with status '{status}': "
                        f"{status_data.get('error', '')}"
                    )

            raise TimeoutError(
                f"HeyGen video generation timed out after "
                f"{self._poll_interval * self._max_polls}s"
            )
