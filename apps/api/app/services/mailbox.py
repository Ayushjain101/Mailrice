"""
Mailbox Provisioning Service
Handles mailbox creation and management
"""
from sqlalchemy.orm import Session
from app import models, auth
from pathlib import Path
import subprocess
import logging

logger = logging.getLogger(__name__)


def provision_mailbox(
    db: Session,
    workspace_id: int,
    domain_id: int,
    local_part: str,
    password: str,
    quota_mb: int = 1024
) -> models.Mailbox:
    """
    Complete mailbox provisioning:
    1. Create mailbox in database
    2. Create maildir on filesystem
    3. Set proper permissions

    Args:
        db: Database session
        workspace_id: Workspace ID
        domain_id: Domain ID
        local_part: Local part of email (e.g., "user" in user@domain.com)
        password: Plain text password (will be hashed)
        quota_mb: Mailbox quota in MB (default: 1024)

    Returns:
        Created Mailbox model
    """
    # Get domain
    domain = db.query(models.Domain).filter(models.Domain.id == domain_id).first()
    if not domain:
        raise ValueError(f"Domain not found: {domain_id}")

    full_email = f"{local_part}@{domain.domain}"
    logger.info(f"Provisioning mailbox: {full_email}")

    # Check if mailbox already exists
    existing = db.query(models.Mailbox).filter(
        models.Mailbox.local_part == local_part,
        models.Mailbox.domain_id == domain_id
    ).first()
    if existing:
        raise ValueError(f"Mailbox {full_email} already exists")

    # Hash password
    password_hash = auth.hash_password(password)

    # Create mailbox in database
    mailbox = models.Mailbox(
        workspace_id=workspace_id,
        domain_id=domain_id,
        local_part=local_part,
        password_hash=password_hash,
        quota_mb=quota_mb,
        status="active"
    )
    db.add(mailbox)
    db.commit()
    db.refresh(mailbox)

    # Create maildir on filesystem
    maildir_path = Path("/var/vmail") / domain.domain / local_part
    try:
        create_maildir(maildir_path)
        logger.info(f"Maildir created: {maildir_path}")
    except Exception as e:
        logger.error(f"Failed to create maildir for {full_email}: {e}")
        # Rollback database changes
        db.delete(mailbox)
        db.commit()
        raise Exception(f"Maildir creation failed: {e}")

    # Log event
    event = models.Event(
        workspace_id=workspace_id,
        type="mailbox.created",
        payload_json={
            "mailbox_id": mailbox.id,
            "email": full_email,
            "quota_mb": quota_mb
        }
    )
    db.add(event)
    db.commit()

    logger.info(f"Mailbox {full_email} provisioned successfully")

    return mailbox


def create_maildir(maildir_path: Path) -> None:
    """
    Create maildir structure with proper permissions

    Structure:
        /var/vmail/domain.com/user/
            ├── cur/
            ├── new/
            └── tmp/
    """
    # Create directories
    maildir_path.mkdir(parents=True, exist_ok=True)
    (maildir_path / "cur").mkdir(exist_ok=True)
    (maildir_path / "new").mkdir(exist_ok=True)
    (maildir_path / "tmp").mkdir(exist_ok=True)

    # Set ownership to vmail:vmail
    subprocess.run(
        ["chown", "-R", "vmail:vmail", str(maildir_path)],
        check=True,
        capture_output=True
    )

    # Set permissions
    subprocess.run(
        ["chmod", "-R", "770", str(maildir_path)],
        check=True,
        capture_output=True
    )

    logger.info(f"Maildir structure created: {maildir_path}")


def update_mailbox_password(db: Session, mailbox_id: int, new_password: str) -> models.Mailbox:
    """
    Update mailbox password

    Args:
        db: Database session
        mailbox_id: Mailbox ID
        new_password: New plain text password

    Returns:
        Updated Mailbox model
    """
    mailbox = db.query(models.Mailbox).filter(models.Mailbox.id == mailbox_id).first()
    if not mailbox:
        raise ValueError(f"Mailbox not found: {mailbox_id}")

    # Get domain for logging
    domain = db.query(models.Domain).filter(models.Domain.id == mailbox.domain_id).first()
    full_email = f"{mailbox.local_part}@{domain.domain}"

    logger.info(f"Updating password for {full_email}")

    # Hash new password
    mailbox.password_hash = auth.hash_password(new_password)
    db.commit()
    db.refresh(mailbox)

    # Log event
    event = models.Event(
        workspace_id=mailbox.workspace_id,
        type="mailbox.password_changed",
        payload_json={
            "mailbox_id": mailbox.id,
            "email": full_email
        }
    )
    db.add(event)
    db.commit()

    logger.info(f"Password updated for {full_email}")

    return mailbox


def delete_mailbox(db: Session, mailbox_id: int) -> None:
    """
    Delete mailbox and its maildir

    Args:
        db: Database session
        mailbox_id: Mailbox ID
    """
    mailbox = db.query(models.Mailbox).filter(models.Mailbox.id == mailbox_id).first()
    if not mailbox:
        raise ValueError(f"Mailbox not found: {mailbox_id}")

    # Get domain
    domain = db.query(models.Domain).filter(models.Domain.id == mailbox.domain_id).first()
    full_email = f"{mailbox.local_part}@{domain.domain}"

    logger.info(f"Deleting mailbox: {full_email}")

    # Delete maildir
    maildir_path = Path("/var/vmail") / domain.domain / mailbox.local_part
    if maildir_path.exists():
        try:
            subprocess.run(
                ["rm", "-rf", str(maildir_path)],
                check=True,
                capture_output=True
            )
            logger.info(f"Maildir deleted: {maildir_path}")
        except Exception as e:
            logger.error(f"Failed to delete maildir: {e}")

    # Delete from database
    db.delete(mailbox)

    # Log event
    event = models.Event(
        workspace_id=mailbox.workspace_id,
        type="mailbox.deleted",
        payload_json={
            "email": full_email
        }
    )
    db.add(event)
    db.commit()

    logger.info(f"Mailbox {full_email} deleted")
