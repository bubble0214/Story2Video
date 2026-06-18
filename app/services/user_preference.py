from __future__ import annotations

from uuid import UUID

from app.repositories.user_preference import UserPreferenceRepository


class UserPreferenceService:
    def __init__(self, repo: UserPreferenceRepository) -> None:
        self._repo = repo

    async def get(self, user_id: str) -> dict:
        pref = await self._repo.get_by_user(UUID(user_id))
        return {
            "embedding_provider": pref.embedding_provider if pref else None,
        }

    async def update_embedding_provider(
        self, user_id: str, provider: str,
    ) -> dict:
        pref = await self._repo.upsert_embedding_provider(UUID(user_id), provider)
        return {
            "embedding_provider": pref.embedding_provider,
        }
