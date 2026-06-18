from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.api_key import ApiKey


class ApiKeyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self, user_id: UUID, provider: str, encrypted_key: str,
        base_url: str | None = None, model_name: str | None = None,
    ) -> ApiKey:
        obj = ApiKey(
            user_id=user_id, provider=provider, encrypted_key=encrypted_key,
            base_url=base_url, model_name=model_name,
        )
        self._session.add(obj)
        await self._session.commit()
        await self._session.refresh(obj)
        return obj

    async def get_by_id(self, api_key_id: UUID) -> ApiKey | None:
        return await self._session.get(ApiKey, api_key_id)

    async def list_by_user(self, user_id: UUID) -> list[ApiKey]:
        stmt = (
            select(ApiKey)
            .where(ApiKey.user_id == user_id)
            .order_by(ApiKey.created_at.desc())
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_user_and_provider(
        self, user_id: UUID, provider: str,
        model_name: str | None = None,
    ) -> ApiKey | None:
        stmt = select(ApiKey).where(
            ApiKey.user_id == user_id,
            ApiKey.provider == provider,
        )
        if model_name:
            stmt = stmt.where(ApiKey.model_name == model_name)
        stmt = stmt.limit(1)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def update_key(
        self, api_key_id: UUID, new_encrypted_key: str,
        base_url: str | None = None, model_name: str | None = None,
    ) -> ApiKey | None:
        obj = await self.get_by_id(api_key_id)
        if obj is None:
            return None
        obj.encrypted_key = new_encrypted_key
        obj.base_url = base_url
        obj.model_name = model_name
        await self._session.commit()
        await self._session.refresh(obj)
        return obj

    async def delete(self, api_key_id: UUID) -> bool:
        obj = await self.get_by_id(api_key_id)
        if obj is None:
            return False
        await self._session.delete(obj)
        await self._session.commit()
        return True