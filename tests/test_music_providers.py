from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.providers.music import (
    BaseMusicProvider,
    MusicFactory,
    SunoProvider,
    UdioProvider,
)
from app.services.music import MusicService


# ─── MusicFactory ───────────────────────────────────────────────────────


class TestMusicFactory:
    def test_create_suno(self) -> None:
        provider = MusicFactory.create("suno", "sk-test")
        assert isinstance(provider, SunoProvider)
        assert provider._api_key == "sk-test"

    def test_create_udio(self) -> None:
        provider = MusicFactory.create("udio", "sk-test")
        assert isinstance(provider, UdioProvider)
        assert provider._api_key == "sk-test"

    def test_create_with_custom_base_url(self) -> None:
        provider = MusicFactory.create("suno", "sk-test", base_url="https://custom.api")
        assert provider._base_url == "https://custom.api"

    def test_create_unknown_provider(self) -> None:
        with pytest.raises(ValueError, match="Unknown music provider"):
            MusicFactory.create("unknown", "key")


# ─── Suno Provider ──────────────────────────────────────────────────────


class TestSunoProvider:
    @patch("app.providers.music.suno.httpx.AsyncClient")
    async def test_generate_song_success(self, mock_client: MagicMock) -> None:
        # Mock submit response
        submit_response = MagicMock()
        submit_response.status_code = 200
        submit_response.json.return_value = {"id": "job-123"}

        # Mock poll responses (first pending, then completed)
        poll_pending = MagicMock()
        poll_pending.status_code = 200
        poll_pending.json.return_value = {"status": "pending"}

        poll_completed = MagicMock()
        poll_completed.status_code = 200
        poll_completed.json.return_value = {
            "status": "completed",
            "audio_url": "https://example.com/song.mp3",
        }

        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = submit_response
        instance.get.side_effect = [poll_pending, poll_completed]

        provider = SunoProvider("sk-test", base_url="https://suno.api")
        result = await provider.generate_song(
            lyrics="Hello world", style="pop"
        )
        assert result == "https://example.com/song.mp3"
        assert instance.post.call_count == 1
        assert instance.get.call_count == 2

    @patch("app.providers.music.suno.httpx.AsyncClient")
    async def test_generate_song_no_job_id(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"message": "no id here"}
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = SunoProvider("sk-test")
        with pytest.raises(ValueError, match="did not return a job ID"):
            await provider.generate_song(lyrics="test", style="pop")

    @patch("app.providers.music.suno.httpx.AsyncClient")
    async def test_http_error(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = SunoProvider("bad-key")
        with pytest.raises(ValueError, match="Suno generation failed"):
            await provider.generate_song(lyrics="test", style="pop")

    @patch("app.providers.music.suno.httpx.AsyncClient")
    async def test_poll_failure_status(self, mock_client: MagicMock) -> None:
        submit_response = MagicMock()
        submit_response.status_code = 200
        submit_response.json.return_value = {"id": "job-123"}

        poll_response = MagicMock()
        poll_response.status_code = 200
        poll_response.json.return_value = {"status": "failed", "error": "Bad lyrics"}

        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = submit_response
        instance.get.return_value = poll_response

        provider = SunoProvider("sk-test")
        with pytest.raises(ValueError, match="Suno generation failed with status 'failed'"):
            await provider.generate_song(lyrics="test", style="pop")

    @patch("app.providers.music.suno.httpx.AsyncClient")
    async def test_timeout(self, mock_client: MagicMock) -> None:
        submit_response = MagicMock()
        submit_response.status_code = 200
        submit_response.json.return_value = {"id": "job-123"}

        poll_response = MagicMock()
        poll_response.status_code = 200
        poll_response.json.return_value = {"status": "running"}

        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = submit_response
        instance.get.return_value = poll_response

        provider = SunoProvider("sk-test")
        provider._max_polls = 1  # Short-circuit timeout
        with pytest.raises(TimeoutError, match="Suno generation timed out"):
            await provider.generate_song(lyrics="test", style="pop")


# ─── Udio Provider ──────────────────────────────────────────────────────


class TestUdioProvider:
    @patch("app.providers.music.udio.httpx.AsyncClient")
    async def test_generate_song_success(self, mock_client: MagicMock) -> None:
        submit_response = MagicMock()
        submit_response.status_code = 200
        submit_response.json.return_value = {"id": "gen-456"}

        poll_pending = MagicMock()
        poll_pending.status_code = 200
        poll_pending.json.return_value = {"status": "running"}

        poll_completed = MagicMock()
        poll_completed.status_code = 200
        poll_completed.json.return_value = {
            "status": "completed",
            "audio_url": "https://example.com/udio_song.mp3",
        }

        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = submit_response
        instance.get.side_effect = [poll_pending, poll_completed]

        provider = UdioProvider("sk-test")
        result = await provider.generate_song(
            lyrics="Test lyrics", style="rock"
        )
        assert result == "https://example.com/udio_song.mp3"

    @patch("app.providers.music.udio.httpx.AsyncClient")
    async def test_http_error(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 402
        mock_response.text = "Payment required"
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = UdioProvider("bad-key")
        with pytest.raises(ValueError, match="Udio generation failed"):
            await provider.generate_song(lyrics="test", style="pop")

    @patch("app.providers.music.udio.httpx.AsyncClient")
    async def test_poll_failure(self, mock_client: MagicMock) -> None:
        submit_response = MagicMock()
        submit_response.status_code = 200
        submit_response.json.return_value = {"id": "gen-456"}

        poll_response = MagicMock()
        poll_response.status_code = 200
        poll_response.json.return_value = {"status": "error", "error": "API error"}

        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = submit_response
        instance.get.return_value = poll_response

        provider = UdioProvider("sk-test")
        with pytest.raises(ValueError, match="Udio generation failed with status 'error'"):
            await provider.generate_song(lyrics="test", style="pop")

    @patch("app.providers.music.udio.httpx.AsyncClient")
    async def test_no_generation_id(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {}
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = UdioProvider("sk-test")
        with pytest.raises(ValueError, match="did not return a generation ID"):
            await provider.generate_song(lyrics="test", style="pop")


# ─── MusicService ───────────────────────────────────────────────────────


class TestMusicService:
    async def test_generate_song_success(self) -> None:
        mock_provider = AsyncMock(spec=BaseMusicProvider)
        mock_provider.generate_song.return_value = "https://example.com/song.mp3"

        svc = MusicService(mock_provider)
        result = await svc.generate_song(lyrics="Hello world", style="jazz")
        assert result == "https://example.com/song.mp3"
        mock_provider.generate_song.assert_called_once_with(
            lyrics="Hello world", style="jazz"
        )

    async def test_generate_song_empty_lyrics(self) -> None:
        mock_provider = AsyncMock(spec=BaseMusicProvider)
        svc = MusicService(mock_provider)
        with pytest.raises(ValueError, match="Lyrics cannot be empty"):
            await svc.generate_song(lyrics="  ", style="pop")
        mock_provider.generate_song.assert_not_called()

    async def test_from_settings(self) -> None:
        svc = MusicService.from_settings("suno", "sk-test")
        assert isinstance(svc._provider, SunoProvider)
        assert svc._provider._api_key == "sk-test"
