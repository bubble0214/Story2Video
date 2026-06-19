from __future__ import annotations

import logging
from abc import ABC, abstractmethod

import httpx

logger = logging.getLogger(__name__)


class EmbeddingProvider(ABC):
    @abstractmethod
    async def generate(self, text: str) -> list[float]:
        ...


class OpenAIEmbeddingProvider(EmbeddingProvider):
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._model = "text-embedding-3-small"

    async def generate(self, text: str) -> list[float]:
        if not self._api_key:
            raise ValueError(
                "OpenAI embedding API key is not configured. "
                "Set embedding_api_key in .env or configure a different embedding_provider."
            )
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/embeddings",
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json={"input": text, "model": self._model},
                )
                if resp.status_code != 200:
                    raise ValueError(
                        f"OpenAI embedding failed: HTTP {resp.status_code} {resp.text}"
                    )
                data = resp.json()
                return data["data"][0]["embedding"]
        except httpx.TimeoutException:
            raise ValueError("OpenAI embedding request timed out after 30s")
        except httpx.ConnectError:
            raise ValueError(
                "Cannot connect to OpenAI API. Check your network or "
                "configure a different embedding_provider (e.g., deepseek)."
            )


class DeepSeekEmbeddingProvider(EmbeddingProvider):
    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._model = "deepseek-embedding"

    async def generate(self, text: str) -> list[float]:
        if not self._api_key:
            raise ValueError(
                "DeepSeek embedding API key is not configured. "
                "Set embedding_api_key in .env or configure a different embedding_provider."
            )
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://api.deepseek.com/v1/embeddings",
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json={"input": text, "model": self._model},
                )
                if resp.status_code != 200:
                    raise ValueError(
                        f"DeepSeek embedding failed: HTTP {resp.status_code} {resp.text}"
                    )
                data = resp.json()
                return data["data"][0]["embedding"]
        except httpx.TimeoutException:
            raise ValueError("DeepSeek embedding request timed out after 30s")
        except httpx.ConnectError:
            raise ValueError(
                "Cannot connect to DeepSeek API. Check your network."
            )


class GenericOpenAIEmbeddingProvider(EmbeddingProvider):
    """OpenAI-compatible embedding provider with configurable base_url and model."""

    def __init__(self, api_key: str, base_url: str, model: str | None = None) -> None:
        self._api_key = api_key
        # Strip trailing /embeddings if user pasted the full endpoint URL
        self._base_url = base_url.rstrip("/").removesuffix("/embeddings")
        self._model = model or "text-embedding-3-small"

    async def generate(self, text: str) -> list[float]:
        if not self._api_key:
            raise ValueError("API key is not configured.")
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                url = f"{self._base_url}/embeddings"
                payload = {"input": text, "model": self._model}
                logger.info("Embedding request url=%s model=%s", url, self._model)
                resp = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json={"input": text, "model": self._model},
                )
                if resp.status_code == 404:
                    # Some providers (e.g. SiliconFlow) return 404 with string input
                    # Try array format instead
                    resp = await client.post(
                        url,
                        headers={
                            "Authorization": f"Bearer {self._api_key}",
                            "Content-Type": "application/json",
                        },
                        json={"input": [text], "model": self._model},
                    )
                if resp.status_code != 200:
                    raise ValueError(
                        f"Embedding failed: HTTP {resp.status_code} {resp.text}"
                    )
                data = resp.json()
                return data["data"][0]["embedding"]
        except httpx.TimeoutException:
            raise ValueError("Embedding request timed out after 30s")
        except httpx.ConnectError:
            raise ValueError(f"Cannot connect to {self._base_url}.")


class QwenEmbeddingProvider(EmbeddingProvider):
    """Qwen (Tongyi / DashScope) embedding provider."""

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key
        self._model = "text-embedding-v3"

    async def generate(self, text: str) -> list[float]:
        if not self._api_key:
            raise ValueError(
                "Qwen embedding API key is not configured. "
                "Set embedding_api_key in .env or configure a different embedding_provider."
            )
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding",
                    headers={
                        "Authorization": f"Bearer {self._api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self._model,
                        "input": {
                            "texts": [text],
                        },
                    },
                )
                if resp.status_code != 200:
                    raise ValueError(
                        f"Qwen embedding failed: HTTP {resp.status_code} {resp.text}"
                    )
                data = resp.json()
                return data["output"]["embeddings"][0]["embedding"]
        except httpx.TimeoutException:
            raise ValueError("Embedding request timed out after 30s")
        except httpx.ConnectError:
            raise ValueError("Cannot connect to dashscope.aliyuncs.com.")


_PROVIDER_MAP: dict[str, type[EmbeddingProvider]] = {
    "openai": OpenAIEmbeddingProvider,
    "deepseek": DeepSeekEmbeddingProvider,
    "qwen": QwenEmbeddingProvider,
}


def get_embedding_provider(
    provider: str, api_key: str,
    base_url: str | None = None, model_name: str | None = None,
) -> EmbeddingProvider:
    """Get an embedding provider.

    If base_url or model_name is provided (or provider is "custom"),
    use GenericOpenAIEmbeddingProvider with the given or default values.
    Otherwise, use the built-in provider for known providers.
    """
    provider_lower = provider.lower()

    if base_url or model_name or provider_lower == "custom":
        effective_base_url = base_url or "https://api.openai.com/v1"
        effective_model = model_name or "text-embedding-3-small"
        return GenericOpenAIEmbeddingProvider(api_key, effective_base_url, effective_model)

    cls = _PROVIDER_MAP.get(provider_lower)
    if cls is None:
        raise ValueError(f"Unknown embedding provider: {provider}")
    return cls(api_key)