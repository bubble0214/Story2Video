"""add base_url and model_name to api_keys

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("api_keys", sa.Column("base_url", sa.String(256), nullable=True))
    op.add_column("api_keys", sa.Column("model_name", sa.String(128), nullable=True))


def downgrade() -> None:
    op.drop_column("api_keys", "model_name")
    op.drop_column("api_keys", "base_url")