from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from fastapi.params import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import CurrentUserId, get_db
from app.providers.llm import LLMFactory
from app.repositories.novel import NovelRepository
from app.schemas.novel import (
    ImportNovelReq,
    NovelResp,
    SearchNovelReq,
    SearchResultItem,
)
from app.services.novel import NovelService
from app.utils.llm_key import resolve_user_llm_key

router = APIRouter()


@router.post(
    "/import",
    response_model=NovelResp,
    status_code=status.HTTP_201_CREATED,
    summary="Import a novel",
)
async def import_novel(
    body: ImportNovelReq,
    user_id: CurrentUserId,
    db: AsyncSession = Depends(get_db),
) -> NovelResp:
    repo = NovelRepository(db)
    svc = NovelService(repo)
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
    summary="Search novels by keywords using LLM-powered recommendation",
)
async def search_novels(
    body: SearchNovelReq,
    user_id: CurrentUserId,
    db: AsyncSession = Depends(get_db),
) -> list[SearchResultItem]:
    try:
        llm_key, llm_provider, base_url, model = await resolve_user_llm_key(
            UUID(user_id), input_params={"model": body.model} if body.model else None,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    if llm_provider == "custom":
        llm_provider = "openai"

    provider = LLMFactory.create(llm_provider, llm_key, model, base_url=base_url)
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
            id=UUID(e.id) if e.id else None,
            title=e.title,
            author=e.author,
            tags=e.tags,
            summary=e.summary,
            score=e.score or 0.0,
        )
        for e in entities
    ]
