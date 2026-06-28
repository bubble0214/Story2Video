"""add draft_group_id to drafts table

Revision ID: 0010
Revises: 0006
Create Date: 2026-06-27 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0010"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "drafts",
        sa.Column("draft_group_id", sa.Uuid(), nullable=True),
    )
    op.create_index(
        op.f("ix_drafts_draft_group_id"),
        "drafts",
        ["draft_group_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_drafts_draft_group_id"), table_name="drafts")
    op.drop_column("drafts", "draft_group_id")
