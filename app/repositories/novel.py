from __future__ import annotations

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.novel import Novel


class NovelRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(
        self,
        title: str,
        author: str,
        tags: str,
        summary: str,
        embedding: list[float] | None,
    ) -> Novel:
        obj = Novel(
            title=title,
            author=author,
            tags=tags,
            summary=summary,
            embedding=embedding,
        )
        self._session.add(obj)
        await self._session.commit()
        await self._session.refresh(obj)
        return obj

    async def get_by_id(self, novel_id: UUID) -> Novel | None:
        return await self._session.get(Novel, novel_id)

    async def search_by_embedding(
        self,
        embedding: list[float],
        limit: int = 3,
    ) -> list[tuple[Novel, float]]:
        embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"
        sql = text("""
            SELECT id, title, author, tags, summary, created_at,
                   1 - (embedding <=> :embedding) AS score
            FROM novels
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> :embedding
            LIMIT :limit
        """)
        result = await self._session.execute(
            sql,
            {"embedding": embedding_str, "limit": limit},
        )
        novels: list[tuple[Novel, float]] = []
        for row in result.fetchall():
            novel = Novel(
                id=row[0],
                title=row[1],
                author=row[2],
                tags=row[3],
                summary=row[4],
                created_at=row[5],
            )
            novels.append((novel, float(row[6])))
        return novels