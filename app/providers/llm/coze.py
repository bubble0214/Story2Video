from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from app.providers.llm.base import BaseLLMProvider

logger = logging.getLogger(__name__)


class CozeProvider(BaseLLMProvider):
    """LLM provider backed by a Coze (扣子) bot.

    Requires the ``cozepy`` package.
    The ``model`` parameter should be the Coze Bot ID (a numeric string from the bot URL).
    """

    def __init__(self, api_key: str, model: str = "", base_url: str | None = None) -> None:
        self._api_key = api_key
        self._bot_id = model
        self._base_url = (base_url or "https://api.coze.cn").rstrip("/")

    async def generate(self, prompt: str, **kwargs) -> str:
        messages = [{"role": "user", "content": prompt}]
        return await self.chat(messages, **kwargs)

    async def chat(self, messages: list[dict], **kwargs) -> str:
        import cozepy
        from cozepy import Coze, TokenAuth, Message

        bot_id = kwargs.pop("model", self._bot_id)
        if not bot_id:
            raise ValueError("CozeProvider requires a bot_id (set via model parameter)")

        client = Coze(auth=TokenAuth(self._api_key), base_url=self._base_url)

        # Build additional_messages from the messages list
        additional = []
        system_content = ""
        for m in messages:
            if m["role"] == "system":
                system_content = m.get("content", "")
            elif m["role"] == "user":
                additional.append(Message.build_user_question_text(m.get("content", "")))
            elif m["role"] == "assistant":
                additional.append(Message.build_assistant_answer(m.get("content", "")))

        # Feed system content as context (Coze bot already has its own system prompt)
        if system_content:
            additional.insert(0, Message.build_user_question_text(
                f"[System Instructions]\n{system_content}\n\n---\n\nPlease follow the above instructions carefully."
            ))

        if not additional:
            additional = [Message.build_user_question_text("Hello")]

        try:
            chat_poll = client.chat.create_and_poll(
                bot_id=bot_id,
                user_id="story2video",
                additional_messages=additional,
            )
        except Exception as e:
            raise ValueError(f"Coze chat failed: {e!s}") from e

        if chat_poll.chat.status == cozepy.ChatStatus.COMPLETED:
            parts: list[str] = []
            for msg in chat_poll.messages:
                if msg.content:
                    parts.append(msg.content)
            return "\n".join(parts)

        raise ValueError(
            f"Coze chat completed with status '{chat_poll.chat.status}': "
            f"{chat_poll.chat.last_error}"
        )

    async def stream(
        self, messages: list[dict], **kwargs
    ) -> AsyncIterator[str]:
        import cozepy
        from cozepy import Coze, TokenAuth, Message, ChatEventType

        bot_id = kwargs.pop("model", self._bot_id)
        if not bot_id:
            raise ValueError("CozeProvider requires a bot_id (set via model parameter)")

        client = Coze(auth=TokenAuth(self._api_key), base_url=self._base_url)

        additional = []
        for m in messages:
            if m["role"] == "system":
                additional.append(Message.build_user_question_text(
                    f"[System]\n{m.get('content', '')}"
                ))
            elif m["role"] == "user":
                additional.append(Message.build_user_question_text(m.get("content", "")))
            elif m["role"] == "assistant":
                additional.append(Message.build_assistant_answer(m.get("content", "")))

        if not additional:
            additional = [Message.build_user_question_text("Hello")]

        try:
            for event in client.chat.stream(
                bot_id=bot_id,
                user_id="story2video",
                additional_messages=additional,
            ):
                if event.event == ChatEventType.CONVERSATION_MESSAGE_DELTA:
                    if event.message and event.message.content:
                        yield event.message.content
        except Exception as e:
            raise ValueError(f"Coze stream failed: {e!s}") from e
