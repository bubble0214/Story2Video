from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class NovelEntity:
    id: str
    title: str
    author: str
    tags: str
    summary: str
    embedding: list[float] | None = None
    score: float | None = None
    created_at: datetime | None = None