from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.providers.avatar import (
    AvatarFactory,
    BaseAvatarProvider,
    DIDProvider,
    HeyGenProvider,
)
from app.services.avatar import AvatarService


# ─── AvatarFactory ──────────────────────────────────────────────────────


class TestAvatarFactory:
    def test_create_heygen(self) -> None:
        provider = AvatarFactory.create("heygen", "sk-test")
        assert isinstance(provider, HeyGenProvider)
        assert provider._api_key == "sk-test"

    def test_create_did(self) -> None:
        provider = AvatarFactory.create("did", "basic-token")
        assert isinstance(provider, DIDProvider)
        assert provider._api_key == "basic-token"

    def test_create_with_custom_base_url(self) -> None:
        provider = AvatarFactory.create(
            "heygen", "sk-test", base_url="https://custom.api"
        )
        assert provider._base_url == "https://custom.api"

    def test_create_unknown_provider(self) -> None:
        with pytest.raises(ValueError, match="Unknown avatar provider"):
            AvatarFactory.create("unknown", "key")


# ─── HeyGen Provider ────────────────────────────────────────────────────


class TestHeyGenProvider:
    @patch("app.providers.avatar.heygen.httpx.AsyncClient")
    async def test_generate_video_success(self, mock_client: MagicMock) -> None:
        submit_response = MagicMock()
        submit_response.status_code = 200
        submit_response.json.return_value = {"id": "video-789"}

        poll_pending = MagicMock()
        poll_pending.status_code = 200
        poll_pending.json.return_value = {"status": "processing"}

        poll_completed = MagicMock()
        poll_completed.status_code = 200
        poll_completed.json.return_value = {
            "status": "completed",
            "video_url": "https://example.com/video.mp4",
        }

        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = submit_response
        instance.get.side_effect = [poll_pending, poll_completed]

        provider = HeyGenProvider("sk-test")
        result = await provider.generate_video(
            audio_url="https://example.com/audio.mp3",
            avatar_id="avatar-123",
        )
        assert result == "https://example.com/video.mp4"
        assert instance.post.call_count == 1
        assert instance.get.call_count == 2

    @patch("app.providers.avatar.heygen.httpx.AsyncClient")
    async def test_http_error(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = HeyGenProvider("bad-key")
        with pytest.raises(ValueError, match="HeyGen video generation failed"):
            await provider.generate_video(
                audio_url="https://example.com/audio.mp3",
                avatar_id="avatar-123",
            )

    @patch("app.providers.avatar.heygen.httpx.AsyncClient")
    async def test_poll_failure(self, mock_client: MagicMock) -> None:
        submit_response = MagicMock()
        submit_response.status_code = 200
        submit_response.json.return_value = {"id": "video-789"}

        poll_response = MagicMock()
        poll_response.status_code = 200
        poll_response.json.return_value = {"status": "failed", "error": "Bad audio"}

        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = submit_response
        instance.get.return_value = poll_response

        provider = HeyGenProvider("sk-test")
        with pytest.raises(ValueError, match="HeyGen generation failed with status 'failed'"):
            await provider.generate_video(
                audio_url="https://example.com/audio.mp3",
                avatar_id="avatar-123",
            )

    @patch("app.providers.avatar.heygen.httpx.AsyncClient")
    async def test_no_video_id(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = HeyGenProvider("sk-test")
        with pytest.raises(ValueError, match="did not return a video ID"):
            await provider.generate_video(
                audio_url="https://example.com/audio.mp3",
                avatar_id="avatar-123",
            )

    @patch("app.providers.avatar.heygen.httpx.AsyncClient")
    async def test_timeout(self, mock_client: MagicMock) -> None:
        submit_response = MagicMock()
        submit_response.status_code = 200
        submit_response.json.return_value = {"id": "video-789"}

        poll_response = MagicMock()
        poll_response.status_code = 200
        poll_response.json.return_value = {"status": "processing"}

        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = submit_response
        instance.get.return_value = poll_response

        provider = HeyGenProvider("sk-test")
        provider._max_polls = 1
        with pytest.raises(TimeoutError, match="HeyGen video generation timed out"):
            await provider.generate_video(
                audio_url="https://example.com/audio.mp3",
                avatar_id="avatar-123",
            )


# ─── D-ID Provider ──────────────────────────────────────────────────────


class TestDIDProvider:
    @patch("app.providers.avatar.did.httpx.AsyncClient")
    async def test_generate_video_success(self, mock_client: MagicMock) -> None:
        submit_response = MagicMock()
        submit_response.status_code = 200
        submit_response.json.return_value = {"id": "did-video-101"}

        poll_pending = MagicMock()
        poll_pending.status_code = 200
        poll_pending.json.return_value = {"status": "started"}

        poll_completed = MagicMock()
        poll_completed.status_code = 200
        poll_completed.json.return_value = {
            "status": "done",
            "result_url": "https://example.com/did_video.mp4",
        }

        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = submit_response
        instance.get.side_effect = [poll_pending, poll_completed]

        provider = DIDProvider("basic-token")
        result = await provider.generate_video(
            audio_url="https://example.com/audio.mp3",
            avatar_id="avatar-456",
        )
        assert result == "https://example.com/did_video.mp4"

    @patch("app.providers.avatar.did.httpx.AsyncClient")
    async def test_http_error(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.text = "Forbidden"
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = DIDProvider("bad-key")
        with pytest.raises(ValueError, match="D-ID video generation failed"):
            await provider.generate_video(
                audio_url="https://example.com/audio.mp3",
                avatar_id="avatar-456",
            )

    @patch("app.providers.avatar.did.httpx.AsyncClient")
    async def test_poll_rejected(self, mock_client: MagicMock) -> None:
        submit_response = MagicMock()
        submit_response.status_code = 200
        submit_response.json.return_value = {"id": "did-video-101"}

        poll_response = MagicMock()
        poll_response.status_code = 200
        poll_response.json.return_value = {"status": "rejected", "error": "Invalid avatar"}

        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = submit_response
        instance.get.return_value = poll_response

        provider = DIDProvider("basic-token")
        with pytest.raises(ValueError, match="D-ID generation failed with status 'rejected'"):
            await provider.generate_video(
                audio_url="https://example.com/audio.mp3",
                avatar_id="avatar-456",
            )

    @patch("app.providers.avatar.did.httpx.AsyncClient")
    async def test_no_video_id(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"msg": "no id"}
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = DIDProvider("basic-token")
        with pytest.raises(ValueError, match="did not return a video ID"):
            await provider.generate_video(
                audio_url="https://example.com/audio.mp3",
                avatar_id="avatar-456",
            )

    @patch("app.providers.avatar.did.httpx.AsyncClient")
    async def test_timeout(self, mock_client: MagicMock) -> None:
        submit_response = MagicMock()
        submit_response.status_code = 200
        submit_response.json.return_value = {"id": "did-video-101"}

        poll_response = MagicMock()
        poll_response.status_code = 200
        poll_response.json.return_value = {"status": "started"}

        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = submit_response
        instance.get.return_value = poll_response

        provider = DIDProvider("basic-token")
        provider._max_polls = 1
        with pytest.raises(TimeoutError, match="D-ID video generation timed out"):
            await provider.generate_video(
                audio_url="https://example.com/audio.mp3",
                avatar_id="avatar-456",
            )

    @patch("app.providers.avatar.did.httpx.AsyncClient")
    async def test_sends_basic_auth(self, mock_client: MagicMock) -> None:
        submit_response = MagicMock()
        submit_response.status_code = 200
        submit_response.json.return_value = {"id": "did-video-101"}

        poll_response = MagicMock()
        poll_response.status_code = 200
        poll_response.json.return_value = {"status": "done", "result_url": "https://ex.mp4"}

        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = submit_response
        instance.get.return_value = poll_response

        provider = DIDProvider("my-basic-token")
        await provider.generate_video(
            audio_url="https://example.com/audio.mp3",
            avatar_id="avatar-456",
        )

        # Verify Basic auth header was sent
        _, kwargs = instance.post.call_args
        assert kwargs["headers"]["Authorization"] == "Basic my-basic-token"

        _, get_kwargs = instance.get.call_args
        assert get_kwargs["headers"]["Authorization"] == "Basic my-basic-token"

    @patch("app.providers.avatar.did.httpx.AsyncClient")
    async def test_uses_source_url_and_driver_id(self, mock_client: MagicMock) -> None:
        submit_response = MagicMock()
        submit_response.status_code = 200
        submit_response.json.return_value = {"id": "did-video-101"}

        poll_response = MagicMock()
        poll_response.status_code = 200
        poll_response.json.return_value = {"status": "done", "result_url": "https://ex.mp4"}

        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = submit_response
        instance.get.return_value = poll_response

        provider = DIDProvider("basic-token")
        await provider.generate_video(
            audio_url="https://example.com/audio.mp3",
            avatar_id="avatar-456",
        )

        # Verify D-ID uses source_url and driver_id (not audio_url / avatar_id)
        call_json = instance.post.call_args.kwargs["json"]
        assert call_json["source_url"] == "https://example.com/audio.mp3"
        assert call_json["driver_id"] == "avatar-456"


# ─── AvatarService ──────────────────────────────────────────────────────


class TestAvatarService:
    async def test_generate_video_success(self) -> None:
        mock_provider = AsyncMock(spec=BaseAvatarProvider)
        mock_provider.generate_video.return_value = "https://example.com/video.mp4"

        svc = AvatarService(mock_provider)
        result = await svc.generate_video(
            audio_url="https://example.com/audio.mp3",
            avatar_id="avatar-123",
        )
        assert result == "https://example.com/video.mp4"
        mock_provider.generate_video.assert_called_once_with(
            audio_url="https://example.com/audio.mp3",
            avatar_id="avatar-123",
        )

    async def test_generate_video_empty_audio_url(self) -> None:
        mock_provider = AsyncMock(spec=BaseAvatarProvider)
        svc = AvatarService(mock_provider)
        with pytest.raises(ValueError, match="Audio URL cannot be empty"):
            await svc.generate_video(audio_url="  ", avatar_id="avatar-123")
        mock_provider.generate_video.assert_not_called()

    async def test_generate_video_empty_avatar_id(self) -> None:
        mock_provider = AsyncMock(spec=BaseAvatarProvider)
        svc = AvatarService(mock_provider)
        with pytest.raises(ValueError, match="Avatar ID cannot be empty"):
            await svc.generate_video(
                audio_url="https://example.com/audio.mp3",
                avatar_id="  ",
            )
        mock_provider.generate_video.assert_not_called()

    async def test_from_settings(self) -> None:
        svc = AvatarService.from_settings("heygen", "sk-test")
        assert isinstance(svc._provider, HeyGenProvider)
        assert svc._provider._api_key == "sk-test"
