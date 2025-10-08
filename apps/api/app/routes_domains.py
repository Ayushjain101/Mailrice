"""
Domain API Routes
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app import models
from app.database import get_db
from app.main import get_current_user_from_token
from app.services import domain as domain_service
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/domains", tags=["Domains"])


# ==================== Request/Response Models ====================

class CreateDomainRequest(BaseModel):
    workspace_id: int
    domain: str
    hostname: Optional[str] = None
    dkim_selector: str = "mail"


class DomainResponse(BaseModel):
    id: int
    domain: str
    hostname: str
    dkim_selector: str
    dkim_public_key: str
    spf_policy: str
    dmarc_policy: str
    status: str
    created_at: str


class RotateDKIMRequest(BaseModel):
    new_selector: str


# ==================== Routes ====================

@router.post("/", response_model=DomainResponse, status_code=status.HTTP_201_CREATED)
async def create_domain(
    request: CreateDomainRequest,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """
    Create new email domain with automatic provisioning:
    - Generates DKIM keys
    - Creates DNS records (if Cloudflare configured)
    - Configures mail server
    """
    # Verify workspace belongs to user's tenant
    workspace = db.query(models.Workspace).filter(
        models.Workspace.id == request.workspace_id,
        models.Workspace.tenant_id == current_user.tenant_id
    ).first()

    if not workspace:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")

    # Use configured hostname if not provided
    from app.config import settings
    hostname = request.hostname or settings.HOSTNAME

    try:
        domain_model = await domain_service.provision_domain(
            db=db,
            workspace_id=request.workspace_id,
            domain=request.domain,
            hostname=hostname,
            dkim_selector=request.dkim_selector
        )

        return DomainResponse(
            id=domain_model.id,
            domain=domain_model.domain,
            hostname=domain_model.hostname,
            dkim_selector=domain_model.dkim_selector,
            dkim_public_key=domain_model.dkim_public_key,
            spf_policy=domain_model.spf_policy,
            dmarc_policy=domain_model.dmarc_policy,
            status=domain_model.status,
            created_at=domain_model.created_at.isoformat()
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Domain provisioning failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Domain provisioning failed: {str(e)}"
        )


@router.get("/")
async def list_domains(
    workspace_id: Optional[int] = None,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """List all domains for user's tenant"""
    query = db.query(models.Domain).join(models.Workspace).filter(
        models.Workspace.tenant_id == current_user.tenant_id
    )

    if workspace_id:
        query = query.filter(models.Domain.workspace_id == workspace_id)

    domains = query.all()

    return {
        "domains": [
            {
                "id": d.id,
                "domain": d.domain,
                "hostname": d.hostname,
                "dkim_selector": d.dkim_selector,
                "status": d.status,
                "created_at": d.created_at.isoformat()
            }
            for d in domains
        ]
    }


@router.get("/{domain_id}")
async def get_domain(
    domain_id: int,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """Get domain details"""
    domain_model = db.query(models.Domain).join(models.Workspace).filter(
        models.Domain.id == domain_id,
        models.Workspace.tenant_id == current_user.tenant_id
    ).first()

    if not domain_model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")

    return {
        "id": domain_model.id,
        "domain": domain_model.domain,
        "hostname": domain_model.hostname,
        "dkim_selector": domain_model.dkim_selector,
        "dkim_public_key": domain_model.dkim_public_key,
        "spf_policy": domain_model.spf_policy,
        "dmarc_policy": domain_model.dmarc_policy,
        "status": domain_model.status,
        "created_at": domain_model.created_at.isoformat()
    }


@router.get("/{domain_id}/dns-records")
async def get_domain_dns_records(
    domain_id: int,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """
    Get DNS records that need to be created for this domain
    Useful for manual DNS setup
    """
    domain_model = db.query(models.Domain).join(models.Workspace).filter(
        models.Domain.id == domain_id,
        models.Workspace.tenant_id == current_user.tenant_id
    ).first()

    if not domain_model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")

    dns_records = domain_service.get_domain_dns_records(domain_model)

    return {
        "domain": domain_model.domain,
        "dns_records": dns_records
    }


@router.post("/{domain_id}/rotate-dkim")
async def rotate_dkim(
    domain_id: int,
    request: RotateDKIMRequest,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """
    Rotate DKIM key for domain
    Generates new key with new selector
    """
    # Verify domain belongs to user's tenant
    domain_model = db.query(models.Domain).join(models.Workspace).filter(
        models.Domain.id == domain_id,
        models.Workspace.tenant_id == current_user.tenant_id
    ).first()

    if not domain_model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")

    try:
        updated_domain = await domain_service.rotate_dkim_key(
            db=db,
            domain_id=domain_id,
            new_selector=request.new_selector
        )

        return {
            "message": "DKIM key rotated successfully",
            "domain": updated_domain.domain,
            "old_selector": domain_model.dkim_selector,
            "new_selector": updated_domain.dkim_selector,
            "new_public_key": updated_domain.dkim_public_key,
            "dns_record": {
                "name": f"{updated_domain.dkim_selector}._domainkey.{updated_domain.domain}",
                "type": "TXT",
                "value": f"v=DKIM1; k=rsa; p={updated_domain.dkim_public_key}"
            }
        }
    except Exception as e:
        logger.error(f"DKIM rotation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"DKIM rotation failed: {str(e)}"
        )


@router.delete("/{domain_id}")
async def delete_domain(
    domain_id: int,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """Delete domain"""
    domain_model = db.query(models.Domain).join(models.Workspace).filter(
        models.Domain.id == domain_id,
        models.Workspace.tenant_id == current_user.tenant_id
    ).first()

    if not domain_model:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")

    # Check if domain has mailboxes
    mailbox_count = db.query(models.Mailbox).filter(models.Mailbox.domain_id == domain_id).count()
    if mailbox_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete domain with {mailbox_count} active mailboxes"
        )

    db.delete(domain_model)
    db.commit()

    return {"message": "Domain deleted successfully"}
