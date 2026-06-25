"""rename novel_drafts to drafts, add workflow_type

Revision ID: 0006_rename_novel_drafts_to_drafts
Revises: a1b2c3d4e5f6
Create Date: 2026-06-22 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0006'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.rename_table("novel_drafts", "drafts")
    op.add_column(
        "drafts",
        sa.Column(
            "workflow_type",
            sa.String(50),
            server_default="novel",
            nullable=False,
            comment="Workflow mode: novel | script | lyrics | song | image | video",
        ),
    )
    op.drop_index("ix_novel_drafts_user_id", table_name="drafts")
    op.create_index("ix_drafts_user_id", "drafts", ["user_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_drafts_user_id", table_name="drafts")
    op.create_index("ix_novel_drafts_user_id", "drafts", ["user_id"], unique=False)
    op.drop_column("drafts", "workflow_type")
    op.rename_table("drafts", "novel_drafts")
