from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.draft import Draft


class DraftRepository:
    """Repository for Draft model CRUD operations."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        user_id: UUID,
        title: str = "未命名",
        workflow_type: str = "novel",
    ) -> Draft:
        obj = Draft(
            user_id=user_id,
            title=title,
            workflow_type=workflow_type,
            step_data={},
        )
        self._session.add(obj)
        await self._session.commit()
        await self._session.refresh(obj)
        return obj

    async def get_by_id(self, draft_id: UUID) -> Draft | None:
        return await self._session.get(Draft, draft_id)

    async def list_by_user(
        self,
        user_id: UUID,
        workflow_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Draft]:
        stmt = select(Draft).where(Draft.user_id == user_id)
        if workflow_type:
            stmt = stmt.where(Draft.workflow_type == workflow_type)
        stmt = stmt.order_by(Draft.updated_at.desc()).limit(limit).offset(offset)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def update(
        self,
        draft_id: UUID,
        title: str | None = None,
        status: str | None = None,
        current_step: str | None = None,
        step_data: dict | None = None,
    ) -> Draft | None:
        obj = await self.get_by_id(draft_id)
        if obj is None:
            return None
        if title is not None:
            obj.title = title
        if status is not None:
            obj.status = status
        if current_step is not None:
            obj.current_step = current_step
        if step_data is not None:
            obj.step_data = step_data
        await self._session.commit()
        await self._session.refresh(obj)
        return obj

    async def delete(self, draft_id: UUID) -> bool:
        obj = await self.get_by_id(draft_id)
        if obj is None:
            return False
        await self._session.delete(obj)
        await self._session.commit()
        return True
