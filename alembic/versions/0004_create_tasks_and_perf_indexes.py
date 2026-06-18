"""create tasks table and performance indexes

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-16
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "tasks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("workflow_type", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="PENDING"),
        sa.Column("progress", sa.Float(), nullable=False, server_default="0"),
        sa.Column("current_step", sa.String(length=100), nullable=False, server_default=""),
        sa.Column("error_message", sa.Text(), nullable=False, server_default=""),
        sa.Column("input_params", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("checkpoint_data", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("result", sa.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_tasks_user_id"), "tasks", ["user_id"], unique=False)
    op.create_index(op.f("ix_tasks_created_at"), "tasks", ["created_at"], unique=False)
    op.create_index(
        "ix_tasks_user_id_created_at",
        "tasks",
        ["user_id", "created_at"],
        unique=False,
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_tasks_status_created_at "
        "ON tasks (status, created_at DESC)"
    )

    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_novels_embedding_ivfflat "
        "ON novels USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )
    op.create_index(op.f("ix_novels_created_at"), "novels", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_novels_created_at"), table_name="novels")
    op.execute("DROP INDEX IF EXISTS ix_novels_embedding_ivfflat")
    op.execute("DROP INDEX IF EXISTS ix_tasks_status_created_at")
    op.drop_index("ix_tasks_user_id_created_at", table_name="tasks")
    op.drop_index(op.f("ix_tasks_created_at"), table_name="tasks")
    op.drop_index(op.f("ix_tasks_user_id"), table_name="tasks")
    op.drop_table("tasks")
