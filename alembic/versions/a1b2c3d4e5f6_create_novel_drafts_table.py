"""create novel_drafts table

Revision ID: a1b2c3d4e5f6
Revises: 9f58bdbadbe3
Create Date: 2026-06-22 10:30:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '9f58bdbadbe3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('novel_drafts',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, comment='in_progress | completed'),
        sa.Column('current_step', sa.String(length=50), nullable=False, comment='Current workflow tab: prompt | outline | volume | rules | generate'),
        sa.Column('step_data', sa.JSON(), nullable=False, comment='All step outputs and input params as JSON'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_novel_drafts_user_id'), 'novel_drafts', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_novel_drafts_user_id'), table_name='novel_drafts')
    op.drop_table('novel_drafts')
