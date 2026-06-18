from __future__ import annotations

from collections.abc import AsyncIterator

import httpx

from app.providers.llm.base import BaseLLMProvider


class DeepSeekProvider(BaseLLMProvider):
    """DeepSeek uses an OpenAI-compatible API."""

    def __init__(self, api_key: str, model: str = "deepseek-v3") -> None:
        self._api_key = api_key
        self._model = model
        self._base_url = "https://api.deepseek.com/v1"

    async def generate(self, prompt: str, **kwargs) -> str:
        messages = [{"role": "user", "content": prompt}]
        return await self.chat(messages, **kwargs)

    async def chat(self, messages: list[dict], **kwargs) -> str:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{self._base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": kwargs.pop("model", self._model),
                    "messages": messages,
                    **kwargs,
                },
            )
            if resp.status_code != 200:
                raise ValueError(
                    f"DeepSeek chat failed: HTTP {resp.status_code} {resp.text}"
                )
            data = resp.json()
            return data["choices"][0]["message"]["content"]

    async def stream(
        self, messages: list[dict], **kwargs
    ) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST",
                f"{self._base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": kwargs.pop("model", self._model),
                    "messages": messages,
                    "stream": True,
                    **kwargs,
                },
            ) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    raise ValueError(
                        f"DeepSeek stream failed: HTTP {resp.status_code} {body.decode()}"
                    )
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    payload = line[6:].strip()
                    if payload == "[DONE]":
                        break
                    import json

                    chunk = json.loads(payload)
                    delta = chunk["choices"][0].get("delta", {})
                    content = delta.get("content")
                    if content:
                        yield content