from __future__ import annotations

from uuid import UUID

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task


class TaskRepository:
    """Repository for Task model CRUD operations."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        user_id: UUID,
        workflow_type: str,
        input_params: dict,
    ) -> Task:
        obj = Task(
            user_id=user_id,
            workflow_type=workflow_type,
            input_params=input_params,
            status="PENDING",
        )
        self._session.add(obj)
        await self._session.commit()
        await self._session.refresh(obj)
        return obj

    async def get_by_id(self, task_id: UUID) -> Task | None:
        return await self._session.get(Task, task_id)

    async def update_status(
        self,
        task_id: UUID,
        status: str,
        progress: float | None = None,
        current_step: str | None = None,
        error_message: str | None = None,
        checkpoint_data: dict | None = None,
        result: dict | None = None,
    ) -> None:
        values: dict = {}
        if status is not None:
            values["status"] = status
        if progress is not None:
            values["progress"] = progress
        if current_step is not None:
            values["current_step"] = current_step
        if error_message is not None:
            values["error_message"] = error_message
        if checkpoint_data is not None:
            values["checkpoint_data"] = checkpoint_data
        if result is not None:
            values["result"] = result

        if not values:
            return

        stmt = update(Task).where(Task.id == task_id).values(**values)
        await self._session.execute(stmt)
        await self._session.commit()

    async def list_by_user(
        self,
        user_id: UUID,
        *,
        limit: int = 20,
        offset: int = 0,
        workflow_type: str | None = None,
    ) -> list[Task]:
        from sqlalchemy import select

        stmt = (
            select(Task)
            .where(Task.user_id == user_id)
            .order_by(Task.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if workflow_type is not None:
            stmt = stmt.where(Task.workflow_type == workflow_type)
        result = await self._session.execute(stmt)
        return list(result.scalars().all())

    async def delete(self, task_id: UUID) -> bool:
        obj = await self.get_by_id(task_id)
        if obj is None:
            return False
        await self._session.delete(obj)
        await self._session.commit()
        return True