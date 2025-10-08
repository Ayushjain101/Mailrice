"""Initial schema

Revision ID: 001
Revises:
Create Date: 2025-01-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

# revision identifiers
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tenants
    op.create_table(
        'tenants',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_tenants_id', 'tenants', ['id'])
    op.create_index('ix_tenants_name', 'tenants', ['name'])

    # Workspaces
    op.create_table(
        'workspaces',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_workspaces_id', 'workspaces', ['id'])
    op.create_index('ix_workspaces_tenant_id', 'workspaces', ['tenant_id'])

    # Users
    op.create_table(
        'users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('role', sa.String(50), nullable=False, server_default='operator'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('last_login_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email')
    )
    op.create_index('ix_users_id', 'users', ['id'])
    op.create_index('ix_users_tenant_id', 'users', ['tenant_id'])
    op.create_index('ix_users_email', 'users', ['email'], unique=True)

    # API Keys
    op.create_table(
        'api_keys',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('prefix', sa.String(20), nullable=False),
        sa.Column('key_hash', sa.String(255), nullable=False),
        sa.Column('scopes', JSON, nullable=False, server_default='[]'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('last_used_at', sa.DateTime(), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('prefix')
    )
    op.create_index('ix_api_keys_id', 'api_keys', ['id'])
    op.create_index('ix_api_keys_tenant_id', 'api_keys', ['tenant_id'])
    op.create_index('ix_api_keys_prefix', 'api_keys', ['prefix'], unique=True)

    # Domains
    op.create_table(
        'domains',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('domain', sa.String(255), nullable=False),
        sa.Column('hostname', sa.String(255), nullable=False),
        sa.Column('dkim_selector', sa.String(50), nullable=False, server_default='mail'),
        sa.Column('dkim_private_path', sa.String(255), nullable=True),
        sa.Column('dkim_public_key', sa.Text(), nullable=True),
        sa.Column('spf_policy', sa.Text(), nullable=True),
        sa.Column('dmarc_policy', sa.Text(), nullable=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='pending'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('domain')
    )
    op.create_index('ix_domains_id', 'domains', ['id'])
    op.create_index('ix_domains_workspace_id', 'domains', ['workspace_id'])
    op.create_index('ix_domains_domain', 'domains', ['domain'], unique=True)

    # Mailboxes
    op.create_table(
        'mailboxes',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('domain_id', sa.Integer(), nullable=False),
        sa.Column('local_part', sa.String(255), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('quota_mb', sa.Integer(), nullable=False, server_default='1024'),
        sa.Column('status', sa.String(50), nullable=False, server_default='active'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['domain_id'], ['domains.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_mailboxes_id', 'mailboxes', ['id'])
    op.create_index('ix_mailboxes_workspace_id', 'mailboxes', ['workspace_id'])
    op.create_index('ix_mailboxes_domain_id', 'mailboxes', ['domain_id'])
    # Unique constraint on local_part + domain_id
    op.create_unique_constraint('uq_mailboxes_local_part_domain', 'mailboxes', ['local_part', 'domain_id'])

    # Events
    op.create_table(
        'events',
        sa.Column('id', sa.BigInteger(), nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(100), nullable=False),
        sa.Column('payload_json', JSON, nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_events_id', 'events', ['id'])
    op.create_index('ix_events_workspace_id', 'events', ['workspace_id'])
    op.create_index('ix_events_type', 'events', ['type'])
    op.create_index('ix_events_created_at', 'events', ['created_at'])

    # Webhooks
    op.create_table(
        'webhooks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workspace_id', sa.Integer(), nullable=False),
        sa.Column('url', sa.String(512), nullable=False),
        sa.Column('secret', sa.String(255), nullable=False),
        sa.Column('events_mask', JSON, nullable=False, server_default='[]'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.Column('last_status', sa.Integer(), nullable=True),
        sa.Column('last_triggered_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_webhooks_id', 'webhooks', ['id'])
    op.create_index('ix_webhooks_workspace_id', 'webhooks', ['workspace_id'])


def downgrade() -> None:
    op.drop_table('webhooks')
    op.drop_table('events')
    op.drop_table('mailboxes')
    op.drop_table('domains')
    op.drop_table('api_keys')
    op.drop_table('users')
    op.drop_table('workspaces')
    op.drop_table('tenants')
