"""
Mailbox API Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel, validator
from typing import Optional
from app import models
from app.database import get_db
from app.main import get_current_user_from_token
from app.services import mailbox as mailbox_service
import logging
import re

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mailboxes", tags=["Mailboxes"])


# ==================== Request/Response Models ====================

class CreateMailboxRequest(BaseModel):
    workspace_id: int
    domain_id: int
    local_part: str  # "user" in user@domain.com
    password: str
    quota_mb: int = 1024

    @validator('local_part')
    def validate_local_part(cls, v):
        """Validate email local part (RFC 5321 compliant)"""
        if not v:
            raise ValueError('Email local part cannot be empty')

        # RFC 5321 local part validation (simplified but practical)
        if not re.match(r'^[a-zA-Z0-9.!#$%&\'*+/=?^_`{|}~-]+$', v):
            raise ValueError(
                'Invalid characters in email local part. '
                'Use only letters, numbers, and these special characters: . ! # $ % & \' * + / = ? ^ _ ` { | } ~ -'
            )

        # Length check (RFC 5321)
        if len(v) > 64:
            raise ValueError('Email local part too long (max 64 characters)')

        # Check for invalid dot placement
        if v.startswith('.') or v.endswith('.'):
            raise ValueError('Email local part cannot start or end with a dot')

        if '..' in v:
            raise ValueError('Email local part cannot contain consecutive dots')

        # Reserved local parts (common mailbox names per RFC 2142)
        reserved = ['postmaster', 'abuse', 'noc', 'security', 'hostmaster', 'usenet', 'news', 'webmaster', 'www', 'uucp', 'ftp']
        if v.lower() in reserved:
            raise ValueError(f'Email local part "{v}" is reserved and cannot be used')

        return v.lower()

    @validator('password')
    def validate_password(cls, v):
        """Validate password strength"""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')

        if len(v) > 128:
            raise ValueError('Password too long (max 128 characters)')

        # Check for basic complexity
        has_letter = any(c.isalpha() for c in v)
        has_number = any(c.isdigit() for c in v)

        if not (has_letter and has_number):
            raise ValueError('Password must contain both letters and numbers')

        return v

    @validator('quota_mb')
    def validate_quota(cls, v):
        """Validate mailbox quota"""
        if v < 1:
            raise ValueError('Quota must be at least 1 MB')

        if v > 100000:  # Max 100 GB
            raise ValueError('Quota too large (max 100000 MB / 100 GB)')

        return v


class MailboxResponse(BaseModel):
    id: int
    email: str
    quota_mb: int
    status: str
    created_at: str


class UpdatePasswordRequest(BaseModel):
    new_password: str


# ==================== Routes ====================

@router.post("/", response_model=MailboxResponse, status_code=status.HTTP_201_CREATED)
async def create_mailbox(
    request: CreateMailboxRequest,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """
    Create new mailbox
    - Creates database entry
    - Creates maildir on filesystem
    - Sets proper permissions
    """
    # Verify workspace belongs to user's tenant
    workspace = db.query(models.Workspace).filter(
        models.Workspace.id == request.workspace_id,
        models.Workspace.tenant_id == current_user.tenant_id
    ).first()

    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    # Verify domain belongs to workspace
    domain = db.query(models.Domain).filter(
        models.Domain.id == request.domain_id,
        models.Domain.workspace_id == request.workspace_id
    ).first()

    if not domain:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")

    try:
        mailbox = mailbox_service.provision_mailbox(
            db=db,
            workspace_id=request.workspace_id,
            domain_id=request.domain_id,
            local_part=request.local_part,
            password=request.password,
            quota_mb=request.quota_mb
        )

        full_email = f"{mailbox.local_part}@{domain.domain}"

        return MailboxResponse(
            id=mailbox.id,
            email=full_email,
            quota_mb=mailbox.quota_mb,
            status=mailbox.status,
            created_at=mailbox.created_at.isoformat()
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Mailbox provisioning failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Mailbox provisioning failed: {str(e)}"
        )


@router.get("/")
async def list_mailboxes(
    workspace_id: Optional[int] = None,
    domain_id: Optional[int] = None,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """List all mailboxes for user's tenant"""
    # Use joinedload to eagerly load domain relationship (fixes N+1 query problem)
    query = db.query(models.Mailbox)\
        .join(models.Workspace)\
        .options(joinedload(models.Mailbox.domain))\
        .filter(models.Workspace.tenant_id == current_user.tenant_id)

    if workspace_id:
        query = query.filter(models.Mailbox.workspace_id == workspace_id)

    if domain_id:
        query = query.filter(models.Mailbox.domain_id == domain_id)

    mailboxes = query.all()

    # Build result list - domain is already loaded via joinedload (no extra queries)
    result = []
    for mailbox in mailboxes:
        full_email = f"{mailbox.local_part}@{mailbox.domain.domain}"

        result.append({
            "id": mailbox.id,
            "workspace_id": mailbox.workspace_id,
            "domain_id": mailbox.domain_id,
            "local_part": mailbox.local_part,
            "email": full_email,
            "quota_mb": mailbox.quota_mb,
            "enabled": mailbox.status == "active",
            "created_at": mailbox.created_at.isoformat()
        })

    return result


@router.get("/{mailbox_id}")
async def get_mailbox(
    mailbox_id: int,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """Get mailbox details"""
    mailbox = db.query(models.Mailbox).join(models.Workspace).filter(
        models.Mailbox.id == mailbox_id,
        models.Workspace.tenant_id == current_user.tenant_id
    ).first()

    if not mailbox:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mailbox not found")

    domain = db.query(models.Domain).filter(models.Domain.id == mailbox.domain_id).first()
    full_email = f"{mailbox.local_part}@{domain.domain}"

    return {
        "id": mailbox.id,
        "email": full_email,
        "domain": domain.domain,
        "local_part": mailbox.local_part,
        "quota_mb": mailbox.quota_mb,
        "status": mailbox.status,
        "created_at": mailbox.created_at.isoformat()
    }


@router.put("/{mailbox_id}/password")
async def update_mailbox_password(
    mailbox_id: int,
    request: UpdatePasswordRequest,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """Update mailbox password"""
    # Verify mailbox belongs to user's tenant
    mailbox = db.query(models.Mailbox).join(models.Workspace).filter(
        models.Mailbox.id == mailbox_id,
        models.Workspace.tenant_id == current_user.tenant_id
    ).first()

    if not mailbox:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mailbox not found")

    try:
        updated_mailbox = mailbox_service.update_mailbox_password(
            db=db,
            mailbox_id=mailbox_id,
            new_password=request.new_password
        )

        return {"message": "Password updated successfully"}
    except Exception as e:
        logger.error(f"Password update failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Password update failed: {str(e)}"
        )


@router.delete("/{mailbox_id}")
async def delete_mailbox(
    mailbox_id: int,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """Delete mailbox"""
    # Verify mailbox belongs to user's tenant
    mailbox = db.query(models.Mailbox).join(models.Workspace).filter(
        models.Mailbox.id == mailbox_id,
        models.Workspace.tenant_id == current_user.tenant_id
    ).first()

    if not mailbox:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Mailbox not found")

    try:
        mailbox_service.delete_mailbox(db=db, mailbox_id=mailbox_id)
        return {"message": "Mailbox deleted successfully"}
    except Exception as e:
        logger.error(f"Mailbox deletion failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Mailbox deletion failed: {str(e)}"
        )
