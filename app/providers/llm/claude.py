from __future__ import annotations

from collections.abc import AsyncIterator

import httpx

from app.providers.llm.base import BaseLLMProvider


class ClaudeProvider(BaseLLMProvider):
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-20250514") -> None:
        self._api_key = api_key
        self._model = model
        self._base_url = "https://api.anthropic.com/v1"

    async def generate(self, prompt: str, **kwargs) -> str:
        messages = [{"role": "user", "content": prompt}]
        return await self.chat(messages, **kwargs)

    async def chat(self, messages: list[dict], **kwargs) -> str:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{self._base_url}/messages",
                headers={
                    "x-api-key": self._api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json={
                    "model": kwargs.pop("model", self._model),
                    "messages": messages,
                    "max_tokens": kwargs.pop("max_tokens", 4096),
                    **kwargs,
                },
            )
            if resp.status_code != 200:
                raise ValueError(
                    f"Claude chat failed: HTTP {resp.status_code} {resp.text}"
                )
            data = resp.json()
            return "".join(
                block["text"]
                for block in data.get("content", [])
                if block.get("type") == "text"
            )

    async def stream(
        self, messages: list[dict], **kwargs
    ) -> AsyncIterator[str]:
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream(
                "POST",
                f"{self._base_url}/messages",
                headers={
                    "x-api-key": self._api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                json={
                    "model": kwargs.pop("model", self._model),
                    "messages": messages,
                    "max_tokens": kwargs.pop("max_tokens", 4096),
                    "stream": True,
                    **kwargs,
                },
            ) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    raise ValueError(
                        f"Claude stream failed: HTTP {resp.status_code} {body.decode()}"
                    )
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    payload = line[6:].strip()
                    if payload == "[DONE]":
                        break
                    import json

                    event = json.loads(payload)
                    if event.get("type") == "content_block_delta":
                        delta = event.get("delta", {})
                        if delta.get("type") == "text_delta":
                            yield delta.get("text", "")