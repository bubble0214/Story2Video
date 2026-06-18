from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, Float, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.user import Base


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    workflow_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        comment="Type of workflow: generate_novel, generate_lyrics, generate_song, generate_video",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="PENDING",
        nullable=False,
        comment="PENDING | RUNNING | SUCCESS | FAILED",
    )
    progress: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        comment="Progress percentage 0.0–100.0",
    )
    current_step: Mapped[str] = mapped_column(
        String(100),
        default="",
        nullable=False,
        comment="Name of the currently executing step",
    )
    error_message: Mapped[str] = mapped_column(
        Text,
        default="",
        nullable=False,
    )
    input_params: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
        comment="Original input parameters passed when creating the workflow",
    )
    checkpoint_data: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
        comment="Intermediate data for checkpoint / resume support",
    )
    result: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        nullable=False,
        comment="Final output of the workflow",
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

    # ORM relationship (back-populated from User is optional, kept for convenience)
    user = relationship("User", backref="tasks")

    def __repr__(self) -> str:
        return (
            f"<Task(id={self.id}, workflow={self.workflow_type}, "
            f"status={self.status}, progress={self.progress})>"
        )
