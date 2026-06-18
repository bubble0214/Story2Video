from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.providers.llm import (
    ClaudeProvider,
    DeepSeekProvider,
    GeminiProvider,
    LLMFactory,
    OpenAIProvider,
    QwenProvider,
    default_model,
    resolve_model,
)
from app.providers.prompt import LyricsPromptBuilder, NovelPromptBuilder


# ─── Model registry ─────────────────────────────────────────────────────────


class TestModelRegistry:
    def test_resolve_known_model(self) -> None:
        assert resolve_model("gpt-4.1") == "openai"
        assert resolve_model("claude-sonnet-4") == "claude"
        assert resolve_model("gemini-2.0-flash") == "gemini"
        assert resolve_model("deepseek-v3") == "deepseek"
        assert resolve_model("qwen-plus") == "qwen"

    def test_resolve_unknown_model(self) -> None:
        assert resolve_model("nonexistent-model") is None

    def test_default_model(self) -> None:
        assert default_model("openai") == "gpt-4o"
        assert default_model("claude") == "claude-sonnet-4-20250514"
        assert default_model("deepseek") == "deepseek-v3"
        assert default_model("unknown") == "gpt-4o"


# ─── LLMFactory ─────────────────────────────────────────────────────────────


class TestLLMFactory:
    def test_create_openai(self) -> None:
        provider = LLMFactory.create("openai", "sk-test")
        assert isinstance(provider, OpenAIProvider)
        assert provider._model == "gpt-4o"

    def test_create_claude(self) -> None:
        provider = LLMFactory.create("claude", "sk-test")
        assert isinstance(provider, ClaudeProvider)
        assert provider._model == "claude-sonnet-4-20250514"

    def test_create_gemini(self) -> None:
        provider = LLMFactory.create("gemini", "gk-test")
        assert isinstance(provider, GeminiProvider)
        assert provider._model == "gemini-2.0-flash"

    def test_create_deepseek(self) -> None:
        provider = LLMFactory.create("deepseek", "sk-test")
        assert isinstance(provider, DeepSeekProvider)
        assert provider._model == "deepseek-v3"

    def test_create_qwen(self) -> None:
        provider = LLMFactory.create("qwen", "sk-test")
        assert isinstance(provider, QwenProvider)
        assert provider._model == "qwen-plus"

    def test_create_with_custom_model(self) -> None:
        provider = LLMFactory.create("openai", "sk-test", model="gpt-4.1")
        assert provider._model == "gpt-4.1"

    def test_create_unknown_provider(self) -> None:
        with pytest.raises(ValueError, match="Unknown LLM provider"):
            LLMFactory.create("unknown", "key")

    def test_create_from_model_name(self) -> None:
        provider = LLMFactory.create_from_model("gpt-4.1", "sk-test")
        assert isinstance(provider, OpenAIProvider)
        assert provider._model == "gpt-4.1"

    def test_create_from_model_claude(self) -> None:
        provider = LLMFactory.create_from_model("claude-sonnet-4", "sk-test")
        assert isinstance(provider, ClaudeProvider)
        assert provider._model == "claude-sonnet-4"

    def test_create_from_unknown_model(self) -> None:
        with pytest.raises(ValueError, match="Unknown model"):
            LLMFactory.create_from_model("unknown-model", "key")


# ─── OpenAI Provider ────────────────────────────────────────────────────────


class TestOpenAIProvider:
    @patch("app.providers.llm.openai.httpx.AsyncClient")
    async def test_chat_success(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "Hello from OpenAI"}}]
        }
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = OpenAIProvider("sk-test", model="gpt-4.1")
        result = await provider.chat([{"role": "user", "content": "hi"}])
        assert result == "Hello from OpenAI"

    @patch("app.providers.llm.openai.httpx.AsyncClient")
    async def test_generate_success(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "Generated text"}}]
        }
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = OpenAIProvider("sk-test")
        result = await provider.generate("write a story")
        assert result == "Generated text"

    @patch("app.providers.llm.openai.httpx.AsyncClient")
    async def test_http_error(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = OpenAIProvider("bad-key")
        with pytest.raises(ValueError, match="OpenAI chat failed"):
            await provider.chat([{"role": "user", "content": "hi"}])

    @patch("app.providers.llm.openai.httpx.AsyncClient")
    async def test_stream_success(self, mock_client: MagicMock) -> None:
        chunks = [
            b"data: " + json.dumps({"choices": [{"delta": {"content": "Hello"}}]}).encode() + b"\n\n",
            b"data: " + json.dumps({"choices": [{"delta": {"content": " world"}}]}).encode() + b"\n\n",
            b"data: [DONE]\n\n",
        ]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.aiter_lines.return_value = _async_iter(
            [chunk.decode() for chunk in chunks]
        )
        mock_response.aread = AsyncMock()

        mock_client_instance = MagicMock()
        mock_client_instance.stream.return_value = _AsyncCtxMgr(mock_response)

        mock_cm = MagicMock()
        mock_cm.__aenter__.return_value = mock_client_instance
        mock_client.return_value = mock_cm

        provider = OpenAIProvider("sk-test")
        collected = []
        async for token in provider.stream([{"role": "user", "content": "hi"}]):
            collected.append(token)
        assert collected == ["Hello", " world"]


# ─── Claude Provider ────────────────────────────────────────────────────────


class TestClaudeProvider:
    @patch("app.providers.llm.claude.httpx.AsyncClient")
    async def test_chat_success(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "content": [{"type": "text", "text": "Hello from Claude"}]
        }
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = ClaudeProvider("sk-test")
        result = await provider.chat([{"role": "user", "content": "hi"}])
        assert result == "Hello from Claude"

    @patch("app.providers.llm.claude.httpx.AsyncClient")
    async def test_http_error(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = ClaudeProvider("bad-key")
        with pytest.raises(ValueError, match="Claude chat failed"):
            await provider.chat([{"role": "user", "content": "hi"}])

    @patch("app.providers.llm.claude.httpx.AsyncClient")
    async def test_generate_success(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "content": [{"type": "text", "text": "Generated story"}]
        }
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = ClaudeProvider("sk-test")
        result = await provider.generate("write a story")
        assert result == "Generated story"

    @patch("app.providers.llm.claude.httpx.AsyncClient")
    async def test_stream_success(self, mock_client: MagicMock) -> None:
        chunks = [
            b"data: " + json.dumps({"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Hello"}}).encode() + b"\n\n",
            b"data: " + json.dumps({"type": "content_block_delta", "delta": {"type": "text_delta", "text": " world"}}).encode() + b"\n\n",
            b"data: [DONE]\n\n",
        ]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.aiter_lines.return_value = _async_iter(
            [chunk.decode() for chunk in chunks]
        )
        mock_response.aread = AsyncMock()

        mock_client_instance = MagicMock()
        mock_client_instance.stream.return_value = _AsyncCtxMgr(mock_response)

        mock_cm = MagicMock()
        mock_cm.__aenter__.return_value = mock_client_instance
        mock_client.return_value = mock_cm

        provider = ClaudeProvider("sk-test")
        collected = []
        async for token in provider.stream([{"role": "user", "content": "hi"}]):
            collected.append(token)
        assert collected == ["Hello", " world"]


# ─── Gemini Provider ────────────────────────────────────────────────────────


class TestGeminiProvider:
    @patch("app.providers.llm.gemini.httpx.AsyncClient")
    async def test_chat_success(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "candidates": [
                {"content": {"parts": [{"text": "Hello from Gemini"}]}}
            ]
        }
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = GeminiProvider("gk-test")
        result = await provider.chat([{"role": "user", "content": "hi"}])
        assert result == "Hello from Gemini"

    @patch("app.providers.llm.gemini.httpx.AsyncClient")
    async def test_chat_with_system_prompt(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "candidates": [
                {"content": {"parts": [{"text": "Formatted response"}]}}
            ]
        }
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = GeminiProvider("gk-test")
        result = await provider.chat([
            {"role": "system", "content": "You are a helpful assistant"},
            {"role": "user", "content": "hi"},
        ])
        assert result == "Formatted response"

    @patch("app.providers.llm.gemini.httpx.AsyncClient")
    async def test_http_error(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.text = "Forbidden"
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = GeminiProvider("bad-key")
        with pytest.raises(ValueError, match="Gemini chat failed"):
            await provider.chat([{"role": "user", "content": "hi"}])

    @patch("app.providers.llm.gemini.httpx.AsyncClient")
    async def test_stream_success(self, mock_client: MagicMock) -> None:
        chunks = [
            b"data: " + json.dumps({"candidates": [{"content": {"parts": [{"text": "Hello"}]}}]}).encode() + b"\n\n",
            b"data: " + json.dumps({"candidates": [{"content": {"parts": [{"text": " world"}]}}]}).encode() + b"\n\n",
        ]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.aiter_lines.return_value = _async_iter(
            [chunk.decode() for chunk in chunks]
        )
        mock_response.aread = AsyncMock()

        mock_client_instance = MagicMock()
        mock_client_instance.stream.return_value = _AsyncCtxMgr(mock_response)

        mock_cm = MagicMock()
        mock_cm.__aenter__.return_value = mock_client_instance
        mock_client.return_value = mock_cm

        provider = GeminiProvider("gk-test")
        collected = []
        async for token in provider.stream([{"role": "user", "content": "hi"}]):
            collected.append(token)
        assert collected == ["Hello", " world"]


# ─── DeepSeek Provider ──────────────────────────────────────────────────────


class TestDeepSeekProvider:
    @patch("app.providers.llm.deepseek.httpx.AsyncClient")
    async def test_chat_success(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "Hello from DeepSeek"}}]
        }
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = DeepSeekProvider("sk-test")
        result = await provider.chat([{"role": "user", "content": "hi"}])
        assert result == "Hello from DeepSeek"

    @patch("app.providers.llm.deepseek.httpx.AsyncClient")
    async def test_http_error(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 402
        mock_response.text = "Quota exceeded"
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = DeepSeekProvider("bad-key")
        with pytest.raises(ValueError, match="DeepSeek chat failed"):
            await provider.chat([{"role": "user", "content": "hi"}])

    @patch("app.providers.llm.deepseek.httpx.AsyncClient")
    async def test_stream_success(self, mock_client: MagicMock) -> None:
        chunks = [
            b"data: " + json.dumps({"choices": [{"delta": {"content": "Deep"}}]}).encode() + b"\n\n",
            b"data: [DONE]\n\n",
        ]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.aiter_lines.return_value = _async_iter(
            [chunk.decode() for chunk in chunks]
        )
        mock_response.aread = AsyncMock()

        mock_client_instance = MagicMock()
        mock_client_instance.stream.return_value = _AsyncCtxMgr(mock_response)

        mock_cm = MagicMock()
        mock_cm.__aenter__.return_value = mock_client_instance
        mock_client.return_value = mock_cm

        provider = DeepSeekProvider("sk-test")
        collected = []
        async for token in provider.stream([{"role": "user", "content": "hi"}]):
            collected.append(token)
        assert collected == ["Deep"]


# ─── Qwen Provider ──────────────────────────────────────────────────────────


class TestQwenProvider:
    @patch("app.providers.llm.qwen.httpx.AsyncClient")
    async def test_chat_success(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "choices": [{"message": {"content": "你好 from Qwen"}}]
        }
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = QwenProvider("sk-test")
        result = await provider.chat([{"role": "user", "content": "hi"}])
        assert result == "你好 from Qwen"

    @patch("app.providers.llm.qwen.httpx.AsyncClient")
    async def test_http_error(self, mock_client: MagicMock) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.text = "Bad request"
        instance = mock_client.return_value.__aenter__.return_value
        instance.post.return_value = mock_response

        provider = QwenProvider("bad-key")
        with pytest.raises(ValueError, match="Qwen chat failed"):
            await provider.chat([{"role": "user", "content": "hi"}])

    @patch("app.providers.llm.qwen.httpx.AsyncClient")
    async def test_stream_success(self, mock_client: MagicMock) -> None:
        chunks = [
            b"data: " + json.dumps({"choices": [{"delta": {"content": "你好"}}]}).encode() + b"\n\n",
            b"data: [DONE]\n\n",
        ]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.aiter_lines.return_value = _async_iter(
            [chunk.decode() for chunk in chunks]
        )
        mock_response.aread = AsyncMock()

        mock_client_instance = MagicMock()
        mock_client_instance.stream.return_value = _AsyncCtxMgr(mock_response)

        mock_cm = MagicMock()
        mock_cm.__aenter__.return_value = mock_client_instance
        mock_client.return_value = mock_cm

        provider = QwenProvider("sk-test")
        collected = []
        async for token in provider.stream([{"role": "user", "content": "hi"}]):
            collected.append(token)
        assert collected == ["你好"]


# ─── Prompt Builders ────────────────────────────────────────────────────────


class TestNovelPromptBuilder:
    def test_build_minimal(self) -> None:
        builder = NovelPromptBuilder()
        messages = builder.build(title="My Story")
        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert "novelist" in messages[0]["content"]
        assert messages[1]["role"] == "user"
        assert "My Story" in messages[1]["content"]

    def test_build_full(self) -> None:
        builder = NovelPromptBuilder()
        messages = builder.build(
            title="Cyberpunk 2077",
            tags="sci-fi,cyberpunk",
            outline="A hacker discovers a conspiracy",
            style="Noir",
            word_count=5000,
        )
        user_content = messages[1]["content"]
        assert "Cyberpunk 2077" in user_content
        assert "sci-fi,cyberpunk" in user_content
        assert "A hacker discovers a conspiracy" in user_content
        assert "Noir" in user_content
        assert "5000" in user_content


class TestLyricsPromptBuilder:
    def test_build_minimal(self) -> None:
        builder = LyricsPromptBuilder()
        messages = builder.build(theme="Love and loss")
        assert len(messages) == 2
        assert messages[0]["role"] == "system"
        assert "songwriter" in messages[0]["content"].lower()
        assert messages[1]["role"] == "user"
        assert "Love and loss" in messages[1]["content"]

    def test_build_full(self) -> None:
        builder = LyricsPromptBuilder()
        messages = builder.build(
            theme="Freedom",
            genre="rock",
            structure="verse-chorus-verse-chorus",
            mood="uplifting",
            language="English",
        )
        user_content = messages[1]["content"]
        assert "Freedom" in user_content
        assert "rock" in user_content
        assert "uplifting" in user_content
        assert "English" in user_content

    def test_default_language_is_chinese(self) -> None:
        builder = LyricsPromptBuilder()
        messages = builder.build(theme="Test")
        assert "Chinese" in messages[1]["content"]


# ─── Helpers ────────────────────────────────────────────────────────────────


class _AsyncCtxMgr:
    """Simple async context manager wrapper for mock responses."""

    def __init__(self, response: MagicMock) -> None:
        self._response = response

    async def __aenter__(self) -> MagicMock:
        return self._response

    async def __aexit__(self, *args) -> None:
        pass


async def _async_iter(items: list[str]):
    """Helper to convert a list into an async iterator."""
    for item in items:
        yield item
