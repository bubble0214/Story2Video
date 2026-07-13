"""add coze_space_id and coze_billing_project_id to api_keys

Revision ID: 0011
Revises: 0010
Create Date: 2026-07-02 12:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0011"
down_revision: Union[str, None] = "0010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("api_keys", sa.Column("coze_space_id", sa.String(50), nullable=True))
    op.add_column("api_keys", sa.Column("coze_billing_project_id", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("api_keys", "coze_billing_project_id")
    op.drop_column("api_keys", "coze_space_id")
