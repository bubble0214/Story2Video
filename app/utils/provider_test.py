"""Provider connection testing utilities."""

from __future__ import annotations

import httpx

# Mapping of providers to their test endpoints and required headers
_PROVIDER_TESTS: dict[str, tuple[str, dict[str, str], str]] = {
    "openai": (
        "https://api.openai.com/v1/models",
        {"Authorization": "Bearer {key}"},
        "get",
    ),
    "claude": (
        "https://api.anthropic.com/v1/messages",
        {"x-api-key": "{key}", "anthropic-version": "2023-06-01"},
        "post",
    ),
    "gemini": (
        "https://generativelanguage.googleapis.com/v1/models?key={key}",
        {},
        "get",
    ),
    "deepseek": (
        "https://api.deepseek.com/v1/models",
        {"Authorization": "Bearer {key}"},
        "get",
    ),
    "qwen": (
        "https://dashscope.aliyuncs.com/api/v1/services/embeddings/text-embedding/text-embedding",
        {"Authorization": "Bearer {key}"},
        "post_embedding",
    ),
    "glm": (
        "{base_url}/models",
        {"Authorization": "Bearer {key}"},
        "get",
    ),
    "suno": (
        "https://api.suno.ai/v1/",
        {"Authorization": "Bearer {key}"},
        "get",
    ),
    "udio": (
        "https://api.udio.com/v1/me",
        {"Authorization": "Bearer {key}"},
        "get",
    ),
    "heygen": (
        "https://api.heygen.com/v1/user.info",
        {"X-Api-Key": "{key}"},
        "get",
    ),
    "d-id": (
        "https://api.d-id.com/me",
        {"Authorization": "Bearer {key}"},
        "get",
    ),
    "custom": (
        "{base_url}/models",
        {"Authorization": "Bearer {key}"},
        "get",
    ),
}


async def check_provider_connection(
    provider: str, api_key: str,
    base_url: str | None = None, model_name: str | None = None,
) -> tuple[bool, str]:
    """Test a provider API key by making a lightweight auth request.

    Returns ``(success, message)``.
    """
    entry = _PROVIDER_TESTS.get(provider.lower())
    if entry is None:
        return False, f"Unknown provider: {provider}"

    url_template, headers_template, method = entry
    url = url_template.replace("{key}", api_key)
    if "{base_url}" in url_template:
        if not base_url:
            return False, "base_url is required for this provider"
        url = url_template.replace("{base_url}", base_url.rstrip("/"))
    headers = {k: v.replace("{key}", api_key) for k, v in headers_template.items()}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if method == "post":
                resp = await client.post(
                    url,
                    headers=headers,
                    json={
                        "model": "claude-3-haiku-20240307",
                        "max_tokens": 1,
                        "messages": [{"role": "user", "content": "ping"}],
                    },
                )
            elif method == "post_embedding":
                resp = await client.post(
                    url,
                    headers=headers,
                    json={
                        "model": model_name or "text-embedding-v3",
                        "input": {
                            "texts": ["ping"],
                        },
                    },
                )
            else:
                resp = await client.get(url, headers=headers)

            if resp.status_code in (200, 201):
                return True, "Connection successful"
            if resp.status_code == 401:
                return False, "Invalid API key (401 Unauthorized)"
            if resp.status_code == 403:
                return False, "API key lacks permission (403 Forbidden)"
            if resp.status_code == 429:
                return True, "Rate limited but key is valid (429)"
            return False, f"Unexpected response: HTTP {resp.status_code}"
    except httpx.TimeoutException:
        return False, "Connection timed out"
    except httpx.RequestError as e:
        return False, f"Connection failed: {e!s}"
