from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from fastapi.params import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUserId, get_db
from app.providers.embedding import get_embedding_provider
from app.repositories.api_key import ApiKeyRepository
from app.repositories.novel import NovelRepository
from app.repositories.user_preference import UserPreferenceRepository
from app.schemas.novel import (
    ImportNovelReq,
    NovelResp,
    SearchNovelReq,
    SearchResultItem,
)
from app.services.novel import NovelService
from app.utils.encryption import decrypt_to_plaintext

router = APIRouter()


@router.post(
    "/import",
    response_model=NovelResp,
    status_code=status.HTTP_201_CREATED,
    summary="Import a novel and generate its embedding",
)
async def import_novel(
    body: ImportNovelReq,
    user_id: CurrentUserId,
    db: AsyncSession = Depends(get_db),
) -> NovelResp:
    # Resolve embedding provider from user preference
    pref_repo = UserPreferenceRepository(db)
    user_pref = await pref_repo.get_by_user(UUID(user_id))
    embedding_provider = (
        user_pref.embedding_provider
        if user_pref and user_pref.embedding_provider
        else None
    )

    if not embedding_provider:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No embedding provider configured. Please go to Settings, "
            "select an Embedding Provider, and save your API key.",
        )

    key_repo = ApiKeyRepository(db)
    user_key = await key_repo.get_by_user_and_provider(
        UUID(user_id), embedding_provider
    )
    if user_key is None or not user_key.encrypted_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No API key found for embedding provider '{embedding_provider}'. "
            f"Please go to Settings and add your {embedding_provider} API key.",
        )

    try:
        api_key = decrypt_to_plaintext(user_key.encrypted_key)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt your API key. Please re-enter it in Settings.",
        )

    provider = get_embedding_provider(
        embedding_provider, api_key, user_key.base_url, user_key.model_name
    )
    svc = NovelService(NovelRepository(db), provider)

    try:
        entity = await svc.import_novel(body.title, body.author, body.tags, body.summary)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    return NovelResp(
        id=UUID(entity.id),
        title=entity.title,
        author=entity.author,
        tags=entity.tags,
        summary=entity.summary,
        created_at=entity.created_at,
    )


@router.post(
    "/search",
    response_model=list[SearchResultItem],
    summary="Search novels by keywords using vector similarity",
)
async def search_novels(
    body: SearchNovelReq,
    user_id: CurrentUserId,
    db: AsyncSession = Depends(get_db),
) -> list[SearchResultItem]:
    # Resolve embedding provider from user preference
    pref_repo = UserPreferenceRepository(db)
    user_pref = await pref_repo.get_by_user(UUID(user_id))
    embedding_provider = (
        user_pref.embedding_provider
        if user_pref and user_pref.embedding_provider
        else None
    )

    if not embedding_provider:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No embedding provider configured. Please go to Settings, "
            "select an Embedding Provider, and save your API key.",
        )

    # Use user's stored API key for the resolved embedding provider
    try:
        key_repo = ApiKeyRepository(db)
        user_key = await key_repo.get_by_user_and_provider(
            UUID(user_id), embedding_provider
        )
    except Exception:
        user_key = None

    if user_key is None or not user_key.encrypted_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No API key found for embedding provider '{embedding_provider}'. "
            f"Please go to Settings and add your {embedding_provider} API key.",
        )

    try:
        api_key = decrypt_to_plaintext(user_key.encrypted_key)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to decrypt your API key. Please re-enter it in Settings.",
        )

    provider = get_embedding_provider(
        embedding_provider, api_key, user_key.base_url, user_key.model_name
    )
    svc = NovelService(NovelRepository(db), provider)

    try:
        entities = await svc.search(body.keywords)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Search failed: {str(e)}",
        )
    return [
        SearchResultItem(
            id=UUID(e.id),
            title=e.title,
            score=e.score or 0.0,
        )
        for e in entities
    ]
