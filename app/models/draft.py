from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.user import Base


class Draft(Base):
    __tablename__ = "drafts"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str] = mapped_column(
        String(255),
        default="未命名",
        nullable=False,
    )
    workflow_type: Mapped[str] = mapped_column(
        String(50),
        default="novel",
        nullable=False,
        comment="Workflow mode: novel | script | lyrics | song | image | video",
    )
    draft_group_id: Mapped[uuid.UUID | None] = mapped_column(
        nullable=True,
        index=True,
        comment="UUID grouping drafts belonging to the same project (e.g. same novel)",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="in_progress",
        nullable=False,
        comment="in_progress | completed",
    )
    current_step: Mapped[str] = mapped_column(
        String(50),
        default="prompt",
        nullable=False,
        comment="Current workflow tab or step identifier",
    )
    step_data: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
        comment="All step outputs and input params as JSON",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    user = relationship("User", backref="drafts")
