from __future__ import annotations

from redis.asyncio import Redis

from app.core.config import settings

_REFRESH_KEY_PREFIX = "auth:refresh"
_USER_SESSIONS_PREFIX = "auth:user_sessions"


class RefreshTokenSessionStore:
    def __init__(self, redis: Redis) -> None:
        self._redis = redis

    @property
    def ttl_seconds(self) -> int:
        return settings.refresh_token_expire_days * 24 * 60 * 60

    def _refresh_key(self, session_id: str) -> str:
        return f"{_REFRESH_KEY_PREFIX}:{session_id}"

    def _user_sessions_key(self, user_id: str) -> str:
        return f"{_USER_SESSIONS_PREFIX}:{user_id}"

    async def create_session(self, user_id: str, session_id: str) -> None:
        pipe = self._redis.pipeline(transaction=True)
        pipe.set(self._refresh_key(session_id), user_id, ex=self.ttl_seconds)
        pipe.sadd(self._user_sessions_key(user_id), session_id)
        pipe.expire(self._user_sessions_key(user_id), self.ttl_seconds)
        await pipe.execute()

    async def is_session_valid(self, user_id: str, session_id: str) -> bool:
        stored_user_id = await self._redis.get(self._refresh_key(session_id))
        return stored_user_id == user_id

    async def rotate_session(
        self,
        user_id: str,
        old_session_id: str,
        new_session_id: str,
    ) -> None:
        pipe = self._redis.pipeline(transaction=True)
        pipe.delete(self._refresh_key(old_session_id))
        pipe.srem(self._user_sessions_key(user_id), old_session_id)
        pipe.set(self._refresh_key(new_session_id), user_id, ex=self.ttl_seconds)
        pipe.sadd(self._user_sessions_key(user_id), new_session_id)
        pipe.expire(self._user_sessions_key(user_id), self.ttl_seconds)
        await pipe.execute()

    async def revoke_user_sessions(self, user_id: str) -> None:
        user_sessions_key = self._user_sessions_key(user_id)
        session_ids = await self._redis.smembers(user_sessions_key)
        if session_ids:
            pipe = self._redis.pipeline(transaction=True)
            for session_id in session_ids:
                pipe.delete(self._refresh_key(session_id))
            pipe.delete(user_sessions_key)
            await pipe.execute()
            return
        await self._redis.delete(user_sessions_key)
