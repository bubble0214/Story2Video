from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class UserEntity:
    id: str
    email: str
    password_hash: str
    created_at: datetime | None = None
    updated_at: datetime | None = None
