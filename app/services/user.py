from __future__ import annotations

from uuid import UUID

from app.domain.user import UserEntity
from app.repositories.user import UserRepository


class UserService:
    def __init__(self, repo: UserRepository) -> None:
        self._repo = repo

    async def get_by_id(self, user_id: str) -> UserEntity:
        user = await self._repo.get_by_id(UUID(user_id))
        if user is None:
            raise ValueError("User not found")
        return UserEntity(
            id=str(user.id),
            email=user.email,
            password_hash=user.password_hash,
            created_at=user.created_at,
            updated_at=user.updated_at,
        )