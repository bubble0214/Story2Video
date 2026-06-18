from __future__ import annotations

import asyncio
import json
import logging

import httpx

from app.providers.avatar.base import BaseAvatarProvider

logger = logging.getLogger(__name__)


class DIDProvider(BaseAvatarProvider):
    """D-ID (D-ID) digital-human video generation provider.

    Uses D-ID's API to generate avatar videos from audio.
    API reference: https://docs.d-id.com/
    """

    def __init__(self, api_key: str, base_url: str | None = None) -> None:
        self._api_key = api_key
        # D-ID uses a different auth scheme: basic auth with the API key as password
        self._base_url = (base_url or "https://api.d-id.com").rstrip("/")
        self._poll_interval = 5.0
        self._max_polls = 120

    async def generate_video(
        self,
        audio_url: str,
        avatar_id: str,
        **kwargs,
    ) -> str:
        """Generate a talking-head video via D-ID API."""
        async with httpx.AsyncClient(timeout=30) as client:
            # Step 1: Submit video generation request
            payload: dict = {
                "source_url": audio_url,
                "driver_id": avatar_id,
                **kwargs,
            }
            resp = await client.post(
                f"{self._base_url}/v1/videos",
                headers={
                    "Authorization": f"Basic {self._api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if resp.status_code != 200:
                raise ValueError(
                    f"D-ID video generation failed: HTTP {resp.status_code} "
                    f"{resp.text}"
                )
            data = resp.json()
            video_id = data.get("id") or ""

            if not video_id:
                raise ValueError(
                    f"D-ID did not return a video ID: {data}"
                )

            # Step 2: Poll for completion
            for _ in range(self._max_polls):
                await asyncio.sleep(self._poll_interval)
                poll_resp = await client.get(
                    f"{self._base_url}/v1/videos/{video_id}",
                    headers={"Authorization": f"Basic {self._api_key}"},
                )
                if poll_resp.status_code != 200:
                    raise ValueError(
                        f"D-ID poll failed: HTTP {poll_resp.status_code} "
                        f"{poll_resp.text}"
                    )
                status_data = poll_resp.json()
                status = status_data.get("status", "").lower()

                if status == "done":
                    video_url = (
                        status_data.get("video_url")
                        or status_data.get("result_url")
                        or ""
                    )
                    if not video_url:
                        raise ValueError(
                            f"D-ID completed but no video URL in response: "
                            f"{status_data}"
                        )
                    return video_url

                if status in ("failed", "error", "rejected"):
                    raise ValueError(
                        f"D-ID generation failed with status '{status}': "
                        f"{status_data.get('error', '')}"
                    )

            raise TimeoutError(
                f"D-ID video generation timed out after "
                f"{self._poll_interval * self._max_polls}s"
            )
