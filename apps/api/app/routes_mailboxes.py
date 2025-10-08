"""
Mailbox API Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app import models
from app.database import get_db
from app.main import get_current_user_from_token
from app.services import mailbox as mailbox_service
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/mailboxes", tags=["Mailboxes"])


# ==================== Request/Response Models ====================

class CreateMailboxRequest(BaseModel):
    workspace_id: int
    domain_id: int
    local_part: str  # "user" in user@domain.com
    password: str
    quota_mb: int = 1024


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
    query = db.query(models.Mailbox).join(models.Workspace).filter(
        models.Workspace.tenant_id == current_user.tenant_id
    )

    if workspace_id:
        query = query.filter(models.Mailbox.workspace_id == workspace_id)

    if domain_id:
        query = query.filter(models.Mailbox.domain_id == domain_id)

    mailboxes = query.all()

    # Get domain info for each mailbox
    result = []
    for mailbox in mailboxes:
        domain = db.query(models.Domain).filter(models.Domain.id == mailbox.domain_id).first()
        full_email = f"{mailbox.local_part}@{domain.domain}"

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
