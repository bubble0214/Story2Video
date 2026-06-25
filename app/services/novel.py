from __future__ import annotations

import json
import re
from uuid import UUID

from app.domain.novel import NovelEntity
from app.providers.llm.base import BaseLLMProvider
from app.repositories.novel import NovelRepository

LLM_SEARCH_SYSTEM_PROMPT = """You are a literary expert and recommendation engine. Your task is to recommend novels based on the user's interests.

Given a set of keywords describing the user's interests, recommend exactly 3 novels that would appeal to them. For each novel, provide:
1. The novel's title
2. The author's name
3. A brief summary (2-3 sentences)
4. Relevant genre tags (comma-separated)
5. A recommendation confidence score between 0.0 and 1.0

Only recommend novels that actually exist and that you are confident about from your training knowledge. Do not make up novels.

Respond ONLY with a valid JSON array. No markdown formatting, no explanation:
[
  {
    "title": "...",
    "author": "...",
    "summary": "...",
    "tags": "...",
    "score": 0.95
  },
  ...
]"""


class NovelService:
    def __init__(
        self,
        repo: NovelRepository | None,
        llm_provider: BaseLLMProvider | None = None,
    ) -> None:
        self._repo = repo
        self._llm_provider = llm_provider

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
        if self._repo is None:
            raise ValueError("Repository required for import")

        obj = await self._repo.create(title, author, tags, summary, embedding=None)
        return NovelEntity(
            id=str(obj.id),
            title=obj.title,
            author=obj.author,
            tags=obj.tags,
            summary=obj.summary,
            embedding=None,
            created_at=obj.created_at,
        )

    async def search(self, keywords: list[str]) -> list[NovelEntity]:
        if not keywords:
            raise ValueError("Keywords cannot be empty")
        if self._llm_provider is None:
            raise ValueError("LLM provider required for search")

        query_text = " ".join(keywords)
        user_prompt = f"Keywords describing the user's interests: {query_text}\n\nRecommend exactly 3 novels matching these interests."

        messages = [
            {"role": "system", "content": LLM_SEARCH_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ]

        content = await self._llm_provider.chat(messages, temperature=0.8)

        json_match = re.search(r"\[.*\]", content, re.DOTALL)
        if not json_match:
            raise ValueError("LLM did not return a valid recommendation list")

        try:
            recommendations = json.loads(json_match.group())
        except json.JSONDecodeError:
            raise ValueError("Failed to parse LLM recommendations as JSON")

        entities: list[NovelEntity] = []
        for rec in recommendations[:3]:
            entities.append(
                NovelEntity(
                    id="",
                    title=rec.get("title", "Unknown"),
                    author=rec.get("author", "Unknown"),
                    tags=rec.get("tags", ""),
                    summary=rec.get("summary", ""),
                    embedding=None,
                    score=float(rec.get("score", 0.0)),
                )
            )
        return entities
