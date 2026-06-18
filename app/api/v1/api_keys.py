from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from fastapi.params import Depends

from app.core.dependencies import CurrentUserId, get_db
from app.repositories.api_key import ApiKeyRepository
from app.schemas.api_key import (
    ApiKeyResp,
    CreateApiKeyReq,
    TestApiKeyReq,
    TestApiKeyResp,
    UpdateApiKeyReq,
)
from app.schemas.common import MessageResp
from app.services.api_key import ApiKeyService
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter()


def get_api_key_service(
    db: AsyncSession = Depends(get_db),
) -> ApiKeyService:
    return ApiKeyService(ApiKeyRepository(db))


@router.post(
    "",
    response_model=ApiKeyResp,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new API key",
)
async def create_api_key(
    body: CreateApiKeyReq,
    user_id: CurrentUserId,
    svc: ApiKeyService = Depends(get_api_key_service),
) -> ApiKeyResp:
    entity = await svc.create(user_id, body.provider, body.key, body.base_url, body.model_name)
    return ApiKeyResp(
        id=UUID(entity.id), provider=entity.provider,
        base_url=entity.base_url, model_name=entity.model_name,
        created_at=entity.created_at,
    )


@router.get(
    "",
    response_model=list[ApiKeyResp],
    summary="List all API keys for current user",
)
async def list_api_keys(
    user_id: CurrentUserId,
    svc: ApiKeyService = Depends(get_api_key_service),
) -> list[ApiKeyResp]:
    entities = await svc.list_by_user(user_id)
    return [
        ApiKeyResp(
            id=UUID(e.id), provider=e.provider,
            base_url=e.base_url, model_name=e.model_name,
            created_at=e.created_at,
        )
        for e in entities
    ]


@router.put(
    "/{api_key_id}",
    response_model=ApiKeyResp,
    summary="Update an API key",
)
async def update_api_key(
    api_key_id: str,
    body: UpdateApiKeyReq,
    user_id: CurrentUserId,
    svc: ApiKeyService = Depends(get_api_key_service),
) -> ApiKeyResp:
    try:
        entity = await svc.update_key(api_key_id, user_id, body.key, body.base_url, body.model_name)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return ApiKeyResp(
        id=UUID(entity.id), provider=entity.provider,
        base_url=entity.base_url, model_name=entity.model_name,
        created_at=entity.created_at,
    )


@router.delete(
    "/{api_key_id}",
    response_model=MessageResp,
    summary="Delete an API key",
)
async def delete_api_key(
    api_key_id: str,
    user_id: CurrentUserId,
    svc: ApiKeyService = Depends(get_api_key_service),
) -> MessageResp:
    try:
        await svc.delete(api_key_id, user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return MessageResp(message="API key deleted")


@router.post(
    "/test",
    response_model=TestApiKeyResp,
    summary="Test an API key connection",
)
async def test_api_key(
    body: TestApiKeyReq,
    user_id: CurrentUserId,
    svc: ApiKeyService = Depends(get_api_key_service),
) -> TestApiKeyResp:
    api_key = body.key
    base_url = body.base_url
    model_name = body.model_name

    # If no key provided, try to look it up from the database
    if not api_key:
        try:
            decrypted = await svc.get_decrypted_key_by_provider(UUID(user_id), body.provider)
            api_key = decrypted.decrypted_key
            if not base_url:
                base_url = decrypted.base_url
            if not model_name:
                model_name = decrypted.model_name
        except ValueError as e:
            return TestApiKeyResp(success=False, message=str(e))

    if not api_key:
        return TestApiKeyResp(
            success=False,
            message=f"No API key found for '{body.provider}'. Please save the key first.",
        )

    success, message = await svc.test_connection(body.provider, api_key, base_url, model_name)
    return TestApiKeyResp(success=success, message=message)