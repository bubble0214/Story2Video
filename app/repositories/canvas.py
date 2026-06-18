from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.canvas import Canvas


class CanvasRepository:
    """Repository for Canvas model CRUD operations."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, user_id: UUID, title: str) -> Canvas:
        obj = Canvas(
            user_id=user_id,
            title=title,
            data={"nodes": [], "edges": [], "viewport": None},
        )
        self._session.add(obj)
        await self._session.commit()
        await self._session.refresh(obj)
        return obj

    async def get_by_id(self, canvas_id: UUID) -> Canvas | None:
        return await self._session.get(Canvas, canvas_id)

    async def list_by_user(
        self,
        user_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Canvas]:
        stmt = (
            select(Canvas)
            .where(Canvas.user_id == user_id)
            .order_by(Canvas.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def update(
        self,
        canvas_id: UUID,
        title: str | None = None,
        data: dict | None = None,
    ) -> Canvas | None:
        obj = await self.get_by_id(canvas_id)
        if obj is None:
            return None
        if title is not None:
            obj.title = title
        if data is not None:
            obj.data = data
        await self._session.commit()
        await self._session.refresh(obj)
        return obj

    async def delete(self, canvas_id: UUID) -> bool:
        obj = await self.get_by_id(canvas_id)
        if obj is None:
            return False
        await self._session.delete(obj)
        await self._session.commit()
        return True
