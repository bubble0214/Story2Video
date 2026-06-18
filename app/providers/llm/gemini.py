from __future__ import annotations

from collections.abc import AsyncIterator

import httpx

from app.providers.llm.base import BaseLLMProvider


class GeminiProvider(BaseLLMProvider):
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash") -> None:
        self._api_key = api_key
        self._model = model
        self._base_url = "https://generativelanguage.googleapis.com/v1"

    async def generate(self, prompt: str, **kwargs) -> str:
        messages = [{"role": "user", "content": prompt}]
        return await self.chat(messages, **kwargs)

    async def chat(self, messages: list[dict], **kwargs) -> str:
        contents = _to_gemini_contents(messages)
        system_instruction = _extract_system(messages)

        async with httpx.AsyncClient(timeout=60) as client:
            body: dict = {"contents": contents}
            if system_instruction:
                body["system_instruction"] = {
                    "parts": [{"text": system_instruction}]
                }
            body.update(kwargs)

            resp = await client.post(
                f"{self._base_url}/models/{self._model}:generateContent",
                params={"key": self._api_key},
                headers={"Content-Type": "application/json"},
                json=body,
            )
            if resp.status_code != 200:
                raise ValueError(
                    f"Gemini chat failed: HTTP {resp.status_code} {resp.text}"
                )
            data = resp.json()
            try:
                return data["candidates"][0]["content"]["parts"][0]["text"]
            except (KeyError, IndexError):
                raise ValueError(
                    f"Gemini unexpected response: {data}"
                )

    async def stream(
        self, messages: list[dict], **kwargs
    ) -> AsyncIterator[str]:
        contents = _to_gemini_contents(messages)
        system_instruction = _extract_system(messages)

        async with httpx.AsyncClient(timeout=120) as client:
            body: dict = {"contents": contents}
            if system_instruction:
                body["system_instruction"] = {
                    "parts": [{"text": system_instruction}]
                }
            body.update(kwargs)

            async with client.stream(
                "POST",
                f"{self._base_url}/models/{self._model}:streamContent",
                params={"key": self._api_key},
                headers={"Content-Type": "application/json"},
                json=body,
            ) as resp:
                if resp.status_code != 200:
                    body = await resp.aread()
                    raise ValueError(
                        f"Gemini stream failed: HTTP {resp.status_code} {body.decode()}"
                    )
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    payload = line[6:].strip()
                    if not payload:
                        continue
                    import json

                    chunk = json.loads(payload)
                    try:
                        text = chunk["candidates"][0]["content"]["parts"][0]["text"]
                        if text:
                            yield text
                    except (KeyError, IndexError):
                        pass


def _to_gemini_contents(
    messages: list[dict],
) -> list[dict]:
    """Convert OpenAI-format messages to Gemini contents format."""
    contents = []
    for msg in messages:
        role = msg["role"]
        if role == "system":
            continue  # handled separately
        gemini_role = "model" if role == "assistant" else "user"
        contents.append({
            "role": gemini_role,
            "parts": [{"text": msg["content"]}],
        })
    return contents


def _extract_system(messages: list[dict]) -> str | None:
    for msg in messages:
        if msg.get("role") == "system":
            return msg["content"]
    return None