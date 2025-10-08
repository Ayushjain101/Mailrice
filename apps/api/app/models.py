"""
SQLAlchemy Models for Mailrice v2
Multi-tenant email platform
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, ForeignKey, BigInteger, JSON
from sqlalchemy.orm import relationship, declarative_base

Base = declarative_base()


class Tenant(Base):
    """Top-level organization/customer"""
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    workspaces = relationship("Workspace", back_populates="tenant", cascade="all, delete-orphan")
    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    api_keys = relationship("APIKey", back_populates="tenant", cascade="all, delete-orphan")


class Workspace(Base):
    """Workspace within a tenant (e.g., different clients/projects)"""
    __tablename__ = "workspaces"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    tenant = relationship("Tenant", back_populates="workspaces")
    domains = relationship("Domain", back_populates="workspace", cascade="all, delete-orphan")
    mailboxes = relationship("Mailbox", back_populates="workspace", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="workspace", cascade="all, delete-orphan")
    webhooks = relationship("Webhook", back_populates="workspace", cascade="all, delete-orphan")


class User(Base):
    """User accounts with RBAC"""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="operator")  # owner, admin, operator, readonly
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_login_at = Column(DateTime, nullable=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="users")


class APIKey(Base):
    """API keys for programmatic access"""
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    prefix = Column(String(20), unique=True, nullable=False, index=True)  # mr_live_abc123
    key_hash = Column(String(255), nullable=False)
    scopes = Column(JSON, nullable=False, default=list)  # ["domains:read", "mailboxes:write"]
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_used_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="api_keys")


class Domain(Base):
    """Email domains"""
    __tablename__ = "domains"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    domain = Column(String(255), unique=True, nullable=False, index=True)
    hostname = Column(String(255), nullable=False)  # mail.domain.com

    # DKIM
    dkim_selector = Column(String(50), nullable=False, default="mail")
    dkim_private_path = Column(String(255), nullable=True)
    dkim_public_key = Column(Text, nullable=True)

    # Policies
    spf_policy = Column(Text, nullable=True)
    dmarc_policy = Column(Text, nullable=True)

    # Status
    status = Column(String(50), nullable=False, default="pending")  # pending, provisioned, active, suspended
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    workspace = relationship("Workspace", back_populates="domains")
    mailboxes = relationship("Mailbox", back_populates="domain", cascade="all, delete-orphan")


class Mailbox(Base):
    """Email mailboxes"""
    __tablename__ = "mailboxes"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    domain_id = Column(Integer, ForeignKey("domains.id", ondelete="CASCADE"), nullable=False, index=True)
    local_part = Column(String(255), nullable=False)  # "user" in user@domain.com
    password_hash = Column(String(255), nullable=False)
    quota_mb = Column(Integer, nullable=False, default=1024)
    status = Column(String(50), nullable=False, default="active")  # active, suspended, deleted
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Relationships
    workspace = relationship("Workspace", back_populates="mailboxes")
    domain = relationship("Domain", back_populates="mailboxes")


class Event(Base):
    """Event log for audit trail and webhooks"""
    __tablename__ = "events"

    id = Column(BigInteger, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    type = Column(String(100), nullable=False, index=True)  # domain.created, mailbox.created, etc.
    payload_json = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    # Relationships
    workspace = relationship("Workspace", back_populates="events")


class Webhook(Base):
    """Webhook endpoints for event notifications"""
    __tablename__ = "webhooks"

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False, index=True)
    url = Column(String(512), nullable=False)
    secret = Column(String(255), nullable=False)
    events_mask = Column(JSON, nullable=False, default=list)  # ["domain.*", "mailbox.created"]
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_status = Column(Integer, nullable=True)  # Last HTTP status code
    last_triggered_at = Column(DateTime, nullable=True)

    # Relationships
    workspace = relationship("Workspace", back_populates="webhooks")
