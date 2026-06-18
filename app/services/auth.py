from __future__ import annotations

from uuid import UUID, uuid4

import jwt

from app.core.auth_sessions import RefreshTokenSessionStore
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.domain.user import UserEntity
from app.repositories.user import UserRepository


class AuthService:
    def __init__(
        self,
        user_repo: UserRepository,
        session_store: RefreshTokenSessionStore,
    ) -> None:
        self._repo = user_repo
        self._session_store = session_store

    async def _issue_token_pair(self, user_id: str) -> tuple[str, str]:
        session_id = str(uuid4())
        access = create_access_token(user_id, session_id=session_id)
        refresh = create_refresh_token(user_id, session_id=session_id)
        await self._session_store.create_session(user_id, session_id)
        return access, refresh

    def _to_entity(self, user) -> UserEntity:
        return UserEntity(
            id=str(user.id),
            email=user.email,
            password_hash=user.password_hash,
            created_at=user.created_at,
            updated_at=user.updated_at,
        )

    async def register(self, email: str, password: str) -> tuple[UserEntity, str, str]:
        existing = await self._repo.get_by_email(email)
        if existing is not None:
            raise ValueError("Email already registered")

        pw_hash = hash_password(password)
        user = await self._repo.create(email, pw_hash)
        entity = self._to_entity(user)
        access, refresh = await self._issue_token_pair(entity.id)
        return entity, access, refresh

    async def login(self, email: str, password: str) -> tuple[UserEntity, str, str]:
        user = await self._repo.get_by_email(email)
        if user is None:
            raise ValueError("Invalid email or password")

        if not verify_password(password, user.password_hash):
            raise ValueError("Invalid email or password")

        entity = self._to_entity(user)
        access, refresh = await self._issue_token_pair(entity.id)
        return entity, access, refresh

    async def refresh(self, refresh_token: str) -> tuple[str, str]:
        try:
            payload = decode_token(refresh_token)
        except jwt.PyJWTError as exc:
            raise ValueError("Invalid refresh token") from exc
        if payload.get("type") != "refresh":
            raise ValueError("Invalid refresh token")

        user_id = str(payload["sub"])
        session_id = str(payload["jti"])
        if not await self._session_store.is_session_valid(user_id, session_id):
            raise ValueError("Refresh token expired or revoked")

        new_session_id = str(uuid4())
        new_access = create_access_token(user_id, session_id=new_session_id)
        new_refresh = create_refresh_token(user_id, session_id=new_session_id)
        await self._session_store.rotate_session(user_id, session_id, new_session_id)
        return new_access, new_refresh

    async def change_password(
        self,
        user_id: str,
        old_password: str,
        new_password: str,
    ) -> None:
        user = await self._repo.get_by_id(UUID(user_id))
        if user is None:
            raise ValueError("User not found")

        if not verify_password(old_password, user.password_hash):
            raise ValueError("Old password is incorrect")

        new_hash = hash_password(new_password)
        await self._repo.update_password(UUID(user_id), new_hash)
        await self._session_store.revoke_user_sessions(user_id)

    async def get_user(self, user_id: str) -> UserEntity:
        user = await self._repo.get_by_id(UUID(user_id))
        if user is None:
            raise ValueError("User not found")
        return self._to_entity(user)
