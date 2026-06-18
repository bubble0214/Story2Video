from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator


class BaseLLMProvider(ABC):
    """Abstract base for LLM providers (OpenAI, Claude, Gemini, DeepSeek, Qwen)."""

    @abstractmethod
    async def generate(self, prompt: str, **kwargs) -> str:
        """Single-turn completion from a plain-text prompt."""
        ...

    @abstractmethod
    async def chat(self, messages: list[dict], **kwargs) -> str:
        """Multi-turn chat completion from a list of messages.

        Each message: {"role": "system"|"user"|"assistant", "content": "..."}
        """
        ...

    @abstractmethod
    async def stream(self, messages: list[dict], **kwargs) -> AsyncIterator[str]:
        """Streaming chat completion, yielding content chunks."""
        ...  # pragma: no cover
        yield  # make the method a generator at the ABC level