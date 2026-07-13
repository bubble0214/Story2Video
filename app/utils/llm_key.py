from __future__ import annotations

import logging
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.api_key import ApiKeyRepository
from app.utils.database import async_session_factory
from app.utils.encryption import decrypt_to_plaintext

logger = logging.getLogger(__name__)


@dataclass
class CozeConfig:
    """Complete Coze configuration for a user."""
    api_key: str
    space_id: str | None = None
    billing_project_id: str | None = None


async def get_user_api_key_from_db(user_id: UUID, provider: str) -> str | None:
    """Retrieve the decrypted API key for a user+provider combo."""
    async with async_session_factory() as session:
        repo = ApiKeyRepository(session)
        key_obj = await repo.get_by_user_and_provider(user_id, provider)
        if key_obj is not None and key_obj.encrypted_key:
            return decrypt_to_plaintext(key_obj.encrypted_key)
    return None


async def get_user_coze_config(user_id: UUID) -> CozeConfig | None:
    """Retrieve the full Coze configuration (key + space_id + billing_project_id) for a user."""
    async with async_session_factory() as session:
        repo = ApiKeyRepository(session)
        key_obj = await repo.get_by_user_and_provider(user_id, "coze")
        if key_obj is not None and key_obj.encrypted_key:
            return CozeConfig(
                api_key=decrypt_to_plaintext(key_obj.encrypted_key),
                space_id=key_obj.coze_space_id,
                billing_project_id=key_obj.coze_billing_project_id,
            )
    return None


async def resolve_user_llm_key(
    user_id: UUID, input_params: dict | None = None,
    session: AsyncSession | None = None,
) -> tuple[str, str, str | None, str | None]:
    """Return (api_key, provider, base_url, model_name) for the user's LLM.

    Only uses keys the user has explicitly saved in Settings.
    If *input_params* contains ``_session`` it is used instead of creating a
    new connection — this avoids event-loop conflicts when called from Celery
    workers on Windows (``--pool=solo``).
    Raises ``ValueError`` if no matching key is found.
    """
    async def _get_session() -> AsyncSession:
        if session is not None:
            return session
        if input_params and "_session" in input_params:
            return input_params["_session"]
        return await async_session_factory().__aenter__()

    # 1. Check input_params for an explicit model selection
    if input_params:
        model_val = input_params.get("model")
        if model_val and isinstance(model_val, str) and "::" in model_val:
            provider_part, model_part = model_val.split("::", 1)
            s = await _get_session()
            repo = ApiKeyRepository(s)
            key_obj = await repo.get_by_user_and_provider(
                user_id, provider_part, model_name=model_part,
            )
            if key_obj is None:
                key_obj = await repo.get_by_user_and_provider(
                    user_id, provider_part,
                )
            if key_obj is not None and key_obj.encrypted_key:
                return (
                    decrypt_to_plaintext(key_obj.encrypted_key),
                    provider_part,
                    key_obj.base_url,
                    model_part,
                )
            raise ValueError(
                f"No API key found for provider '{provider_part}'. "
                f"Please go to Settings and add your {provider_part} API key."
            )
        elif model_val and isinstance(model_val, str) and model_val:
            s = await _get_session()
            repo = ApiKeyRepository(s)
            key_obj = await repo.get_by_user_and_provider(user_id, model_val)
            if key_obj is not None and key_obj.encrypted_key:
                return (
                    decrypt_to_plaintext(key_obj.encrypted_key),
                    model_val,
                    key_obj.base_url,
                    key_obj.model_name,
                )
            raise ValueError(
                f"No API key found for provider '{model_val}'. "
                f"Please go to Settings and add your {model_val} API key."
            )

    # 2. No explicit model — try all user-saved keys
    s = await _get_session()
    repo = ApiKeyRepository(s)
    all_keys = await repo.list_by_user(user_id)
    # Prefer LLM providers (skip music/avatar-specific keys; Coze excluded as Auto due to incompatible LLM interface)
    llm_providers = {"openai", "claude", "gemini", "deepseek", "qwen", "glm", "custom"}
    for key_obj in all_keys:
        if key_obj.provider in llm_providers and key_obj.encrypted_key:
            return (
                decrypt_to_plaintext(key_obj.encrypted_key),
                key_obj.provider,
                key_obj.base_url,
                key_obj.model_name,
            )

    raise ValueError(
        "No LLM API key configured. Please go to Settings and add at least one "
        "LLM provider API key (OpenAI, Claude, DeepSeek, etc.)."
    )
