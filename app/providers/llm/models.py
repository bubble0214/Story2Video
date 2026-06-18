from __future__ import annotations

from app.providers.llm.base import BaseLLMProvider

# Model → provider mapping
MODEL_REGISTRY: dict[str, str] = {
    # OpenAI
    "gpt-5": "openai",
    "gpt-4.1": "openai",
    "gpt-4o": "openai",
    "gpt-4o-mini": "openai",
    "o3": "openai",
    # Claude
    "claude-sonnet-4": "claude",
    "claude-sonnet-4-20250514": "claude",
    "claude-haiku-3.5": "claude",
    # Gemini
    "gemini-2.0-pro": "gemini",
    "gemini-2.0-flash": "gemini",
    "gemini-1.5-pro": "gemini",
    # DeepSeek
    "deepseek-v3": "deepseek",
    "deepseek-r1": "deepseek",
    # Qwen
    "qwen-max": "qwen",
    "qwen-plus": "qwen",
    "qwen-turbo": "qwen",
    # GLM (Zhipu AI)
    "glm-4.7-flash": "glm",
    "glm-4": "glm",
    "glm-4v": "glm",
}

# Default model per provider
DEFAULT_MODELS: dict[str, str] = {
    "openai": "gpt-4o",
    "claude": "claude-sonnet-4-20250514",
    "gemini": "gemini-2.0-flash",
    "deepseek": "deepseek-v3",
    "qwen": "qwen-plus",
    "glm": "glm-4.7-flash",
}


def resolve_model(model: str) -> str | None:
    """Return the provider name for a known model, or *None* if unknown."""
    return MODEL_REGISTRY.get(model)


def default_model(provider: str) -> str:
    """Return the default model for a given provider."""
    return DEFAULT_MODELS.get(provider, "gpt-4o")


__all__ = [
    "BaseLLMProvider",
    "MODEL_REGISTRY",
    "DEFAULT_MODELS",
    "resolve_model",
    "default_model",
]