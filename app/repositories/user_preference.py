from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_preference import UserPreference


class UserPreferenceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_user(self, user_id: UUID) -> UserPreference | None:
        stmt = select(UserPreference).where(UserPreference.user_id == user_id)
        result = await self._session.execute(stmt)
        return result.scalar_one_or_none()

    async def upsert_embedding_provider(
        self, user_id: UUID, provider: str,
    ) -> UserPreference:
        existing = await self.get_by_user(user_id)
        if existing:
            existing.embedding_provider = provider
        else:
            existing = UserPreference(
                user_id=user_id,
                embedding_provider=provider,
            )
            self._session.add(existing)
        await self._session.commit()
        await self._session.refresh(existing)
        return existing
