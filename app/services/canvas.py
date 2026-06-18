from __future__ import annotations

from uuid import UUID

from app.repositories.canvas import CanvasRepository


class CanvasService:
    """Service layer for canvas management."""

    def __init__(self, repo: CanvasRepository) -> None:
        self._repo = repo

    async def create(self, user_id: UUID, title: str = "Untitled Canvas"):
        return await self._repo.create(user_id=user_id, title=title)

    async def get(self, canvas_id: UUID):
        return await self._repo.get_by_id(canvas_id)

    async def list_user_canvases(
        self,
        user_id: UUID,
        limit: int = 50,
        offset: int = 0,
    ):
        return await self._repo.list_by_user(
            user_id=user_id,
            limit=limit,
            offset=offset,
        )

    async def update(
        self,
        canvas_id: UUID,
        title: str | None = None,
        data: dict | None = None,
    ):
        return await self._repo.update(
            canvas_id=canvas_id,
            title=title,
            data=data,
        )

    async def delete(self, canvas_id: UUID) -> bool:
        return await self._repo.delete(canvas_id)
