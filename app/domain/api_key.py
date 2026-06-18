from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass
class ApiKeyEntity:
    id: str
    user_id: str
    provider: str
    base_url: str | None = None
    model_name: str | None = None
    decrypted_key: str | None = None
    created_at: datetime | None = None
