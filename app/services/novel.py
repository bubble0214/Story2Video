from __future__ import annotations

from uuid import UUID

from app.domain.novel import NovelEntity
from app.providers.embedding import EmbeddingProvider
from app.repositories.novel import NovelRepository


class NovelService:
    def __init__(
        self,
        repo: NovelRepository,
        embed_provider: EmbeddingProvider,
    ) -> None:
        self._repo = repo
        self._embed_provider = embed_provider

    async def import_novel(
        self,
        title: str,
        author: str,
        tags: str,
        summary: str,
    ) -> NovelEntity:
        if not title or not title.strip():
            raise ValueError("Title cannot be empty")
        if not summary or not summary.strip():
            raise ValueError("Summary cannot be empty")

        text_for_embedding = f"{title} {summary}"
        embedding = await self._embed_provider.generate(text_for_embedding)

        obj = await self._repo.create(title, author, tags, summary, embedding)
        return NovelEntity(
            id=str(obj.id),
            title=obj.title,
            author=obj.author,
            tags=obj.tags,
            summary=obj.summary,
            embedding=obj.embedding,
            created_at=obj.created_at,
        )

    async def search(self, keywords: list[str]) -> list[NovelEntity]:
        if not keywords:
            raise ValueError("Keywords cannot be empty")

        query_text = " ".join(keywords)
        query_embedding = await self._embed_provider.generate(query_text)

        results = await self._repo.search_by_embedding(query_embedding, limit=3)
        entities: list[NovelEntity] = []
        for novel, score in results:
            entities.append(
                NovelEntity(
                    id=str(novel.id),
                    title=novel.title,
                    author=novel.author,
                    tags=novel.tags,
                    summary=novel.summary,
                    embedding=novel.embedding,
                    score=score,
                    created_at=novel.created_at,
                )
            )
        return entities