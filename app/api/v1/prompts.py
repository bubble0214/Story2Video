from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.core.dependencies import CurrentUserId
from app.providers.llm import LLMFactory
from app.repositories.api_key import ApiKeyRepository
from app.utils.database import async_session_factory
from app.utils.encryption import decrypt_to_plaintext

router = APIRouter()

_OPTIMIZE_SYSTEM_PROMPT = (
    "You are a prompt engineering expert. Improve the user's prompt to be more "
    "detailed, specific, and effective for an AI creative writing assistant. "
    "Keep the original intent but make it clearer about genre, tone, structure, "
    "and what the AI should focus on. Output ONLY the improved prompt, no explanations."
)


class OptimizePromptReq(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=5000)


class OptimizePromptResp(BaseModel):
    optimized: str


async def _get_user_llm_key(user_id: UUID) -> tuple[str, str, str | None, str | None]:
    """Get the user's first available LLM key (same logic as worker)."""
    llm_providers = {"openai", "claude", "gemini", "deepseek", "qwen", "glm", "custom"}
    async with async_session_factory() as session:
        repo = ApiKeyRepository(session)
        all_keys = await repo.list_by_user(user_id)
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
        "LLM provider API key."
    )


@router.post(
    "/optimize",
    response_model=OptimizePromptResp,
    summary="Optimize a prompt using the user's LLM",
)
async def optimize_prompt(
    body: OptimizePromptReq,
    user_id: CurrentUserId,
) -> OptimizePromptResp:
    """Send a raw prompt to the LLM and return an improved version."""
    try:
        llm_key, llm_provider, base_url, model = await _get_user_llm_key(UUID(user_id))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    if llm_provider == "custom":
        llm_provider = "openai"
    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)

    messages = [
        {"role": "system", "content": _OPTIMIZE_SYSTEM_PROMPT},
        {"role": "user", "content": body.prompt},
    ]

    try:
        content = await provider.chat(messages)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to optimize prompt: {e!s}",
        )

    return OptimizePromptResp(optimized=content.strip())
