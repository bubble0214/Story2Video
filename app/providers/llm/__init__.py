from __future__ import annotations

from app.providers.llm.base import BaseLLMProvider
from app.providers.llm.claude import ClaudeProvider
from app.providers.llm.coze import CozeProvider
from app.providers.llm.deepseek import DeepSeekProvider
from app.providers.llm.gemini import GeminiProvider
from app.providers.llm.glm import GLMProvider
from app.providers.llm.models import (
    DEFAULT_MODELS,
    MODEL_REGISTRY,
    default_model,
    resolve_model,
)
from app.providers.llm.openai import OpenAIProvider
from app.providers.llm.qwen import QwenProvider

_PROVIDER_CLASSES: dict[str, type[BaseLLMProvider]] = {
    "openai": OpenAIProvider,
    "claude": ClaudeProvider,
    "gemini": GeminiProvider,
    "deepseek": DeepSeekProvider,
    "qwen": QwenProvider,
    "glm": GLMProvider,
    "coze": CozeProvider,
}


class LLMFactory:
    """Factory that creates LLM provider instances based on configuration."""

    @staticmethod
    def create(
        provider: str,
        api_key: str,
        model: str | None = None,
        base_url: str | None = None,
    ) -> BaseLLMProvider:
        """Create an LLM provider by name.

        Args:
            provider: Provider name (openai, claude, gemini, deepseek, qwen).
            api_key: API key for the provider.
            model: Optional model name. If not given, the default model
                   for the provider is used.
            base_url: Optional base URL (for custom OpenAI-compatible endpoints).

        Returns:
            An instance of a BaseLLMProvider subclass.
        """
        key = provider.lower()
        cls = _PROVIDER_CLASSES.get(key)
        if cls is None:
            raise ValueError(
                f"Unknown LLM provider: {provider}. "
                f"Available: {', '.join(sorted(_PROVIDER_CLASSES))}"
            )
        resolved_model = model or default_model(key)
        instance = cls(api_key=api_key, model=resolved_model)
        if base_url is not None:
            instance._base_url = base_url.rstrip("/")
        return instance

    @staticmethod
    def create_from_model(
        model: str,
        api_key: str,
    ) -> BaseLLMProvider:
        """Resolve a model name to its provider and create an instance.

        Args:
            model: Model name (e.g. ``"gpt-4.1"``, ``"claude-sonnet-4"``).
            api_key: API key for the resolved provider.

        Returns:
            An instance of a BaseLLMProvider subclass.
        """
        provider = resolve_model(model)
        if provider is None:
            known = ", ".join(sorted(MODEL_REGISTRY))
            raise ValueError(
                f"Unknown model: {model}. Supported models: {known}"
            )
        return LLMFactory.create(provider, api_key, model=model)


__all__ = [
    "BaseLLMProvider",
    "LLMFactory",
    "CozeProvider",
    "OpenAIProvider",
    "ClaudeProvider",
    "GeminiProvider",
    "DeepSeekProvider",
    "QwenProvider",
    "GLMProvider",
    "MODEL_REGISTRY",
    "DEFAULT_MODELS",
    "resolve_model",
    "default_model",
]