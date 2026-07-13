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
    "minimax": (
        # No lightweight validation endpoint available.
        # The music generation endpoint requires credits and is slow (30-60s).
        # Validation is done locally via format check.
        "",
        {},
        "format_minimax",
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
    "coze": (
        "{base_url}/v1/bots/{model_name}",
        {"Authorization": "Bearer {key}"},
        "get_coze",
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
    # Strip trailing /embeddings if user pasted the full endpoint URL
    if base_url:
        base_url = base_url.rstrip("/").removesuffix("/embeddings")
    url = url_template.replace("{key}", api_key)
    if "{model_name}" in url_template:
        if not model_name:
            return False, "model_name (bot_id) is required for Coze"
        url = url_template.replace("{model_name}", model_name)
    if "{base_url}" in url_template:
        if not base_url:
            return False, "base_url is required for this provider"
        url = url_template.replace("{base_url}", base_url.rstrip("/"))
    elif base_url:
        # User provided a custom base_url — use it instead of the default server
        from urllib.parse import urlparse
        parsed = urlparse(url)
        path = parsed.path
        clean_base = base_url.rstrip("/")
        # Avoid double /v1 when base_url already contains it
        if path.startswith("/v1/") and clean_base.endswith("/v1"):
            clean_base = clean_base.removesuffix("/v1")
        url = f"{clean_base}{path}"
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
            elif method == "get_coze":
                # Coze: verify token via workspaces API (lightweight)
                coze_base = (base_url or "https://api.coze.cn").rstrip("/")
                resp = await client.get(
                    f"{coze_base}/v1/workspaces",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
                if resp.status_code == 200:
                    body = resp.json()
                    if body.get("code") == 0:
                        return True, "Connection successful"
                    return False, body.get("msg", "Coze API error")
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
            elif method == "format_minimax":
                # MiniMax has no free key validation endpoint.
                # Do a local format check only.
                if api_key.startswith("sk-cp-") or api_key.startswith("sk-api-"):
                    return True, (
                        "Key format is valid. "
                        "Save the key and try generating a song to verify actual availability."
                    )
                return False, (
                    "MiniMax key should start with 'sk-cp-' or 'sk-api-'. "
                    "Please check your key and try again."
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
