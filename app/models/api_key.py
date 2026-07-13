from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.user import Base


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    provider: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )
    encrypted_key: Mapped[str] = mapped_column(
        String(512),
        nullable=False,
    )
    base_url: Mapped[str | None] = mapped_column(
        String(256),
        nullable=True,
    )
    model_name: Mapped[str | None] = mapped_column(
        String(128),
        nullable=True,
    )
    coze_space_id: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )
    coze_billing_project_id: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    user: Mapped["User"] = relationship(lazy="joined")  # noqa: F821

    def __repr__(self) -> str:
        return f"<ApiKey(id={self.id}, provider={self.provider}, user_id={self.user_id})>"
