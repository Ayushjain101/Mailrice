"""
Domain Provisioning Service
Handles domain creation, DNS, and DKIM setup
"""
from sqlalchemy.orm import Session
from app import models
from app.utils import dkim, cloudflare, network
from app.config import settings
import logging

logger = logging.getLogger(__name__)


async def provision_domain(
    db: Session,
    workspace_id: int,
    domain: str,
    hostname: str,
    dkim_selector: str = "mail"
) -> models.Domain:
    """
    Complete domain provisioning workflow:
    1. Create domain in database
    2. Generate DKIM keys
    3. Create DNS records (if Cloudflare configured)
    4. Update OpenDKIM configuration

    Args:
        db: Database session
        workspace_id: Workspace ID
        domain: Domain name (e.g., "example.com")
        hostname: Mail server hostname (e.g., "mail.example.com")
        dkim_selector: DKIM selector (default: "mail")

    Returns:
        Created Domain model
    """
    logger.info(f"Starting domain provisioning for {domain}")

    # Check if domain already exists
    existing = db.query(models.Domain).filter(models.Domain.domain == domain).first()
    if existing:
        raise ValueError(f"Domain {domain} already exists")

    # 1. Generate DKIM keys
    logger.info(f"Generating DKIM keys for {domain}")
    try:
        private_key_path, public_key = dkim.provision_dkim_for_domain(domain, dkim_selector)
    except Exception as e:
        logger.error(f"DKIM generation failed for {domain}: {e}")
        raise Exception(f"DKIM key generation failed: {e}")

    # 2. Create DNS records (if Cloudflare is configured)
    dns_records_created = None
    if settings.CF_API_TOKEN and settings.CF_ZONE_ID:
        logger.info(f"Creating DNS records for {domain} via Cloudflare")
        try:
            server_ip = await network.get_public_ip()
            dns_records_created = await cloudflare.create_email_dns_records(
                domain=domain,
                hostname=hostname,
                server_ip=server_ip,
                dkim_selector=dkim_selector,
                dkim_public_key=public_key
            )
            logger.info(f"DNS records created for {domain}")
        except Exception as e:
            logger.error(f"DNS creation failed for {domain}: {e}")
            # Don't fail the whole operation - DNS can be created manually
            logger.warning(f"Domain will be created without automatic DNS: {e}")

    # 3. Build SPF and DMARC policies
    server_ip = await network.get_public_ip()
    spf_policy = f"v=spf1 ip4:{server_ip} a:{hostname} ~all"
    dmarc_policy = f"v=DMARC1; p=quarantine; rua=mailto:dmarc@{domain}; ruf=mailto:dmarc@{domain}; fo=1; pct=100; aspf=r; adkim=r"

    # 4. Create domain in database
    domain_model = models.Domain(
        workspace_id=workspace_id,
        domain=domain,
        hostname=hostname,
        dkim_selector=dkim_selector,
        dkim_private_path=private_key_path,
        dkim_public_key=public_key,
        spf_policy=spf_policy,
        dmarc_policy=dmarc_policy,
        status="active" if dns_records_created else "pending"
    )
    db.add(domain_model)
    db.commit()
    db.refresh(domain_model)

    logger.info(f"Domain {domain} provisioned successfully (ID: {domain_model.id})")

    # 5. Log event
    event = models.Event(
        workspace_id=workspace_id,
        type="domain.created",
        payload_json={
            "domain_id": domain_model.id,
            "domain": domain,
            "hostname": hostname,
            "dkim_selector": dkim_selector,
            "dns_automated": dns_records_created is not None
        }
    )
    db.add(event)
    db.commit()

    return domain_model


def get_domain_dns_records(domain_model: models.Domain) -> dict:
    """
    Get DNS records that need to be created for domain

    Returns dict with record details for manual creation
    """
    return {
        "mx": {
            "type": "MX",
            "name": domain_model.domain,
            "value": domain_model.hostname,
            "priority": 10,
            "ttl": 300
        },
        "spf": {
            "type": "TXT",
            "name": domain_model.domain,
            "value": domain_model.spf_policy,
            "ttl": 300
        },
        "dkim": {
            "type": "TXT",
            "name": f"{domain_model.dkim_selector}._domainkey.{domain_model.domain}",
            "value": f"v=DKIM1; k=rsa; p={domain_model.dkim_public_key}",
            "ttl": 300
        },
        "dmarc": {
            "type": "TXT",
            "name": f"_dmarc.{domain_model.domain}",
            "value": domain_model.dmarc_policy,
            "ttl": 300
        }
    }


async def rotate_dkim_key(db: Session, domain_id: int, new_selector: str) -> models.Domain:
    """
    Rotate DKIM key for domain

    Args:
        db: Database session
        domain_id: Domain ID
        new_selector: New DKIM selector

    Returns:
        Updated Domain model
    """
    domain_model = db.query(models.Domain).filter(models.Domain.id == domain_id).first()
    if not domain_model:
        raise ValueError(f"Domain not found: {domain_id}")

    logger.info(f"Rotating DKIM key for {domain_model.domain} to selector {new_selector}")

    # Generate new key
    private_key_path, public_key = dkim.provision_dkim_for_domain(domain_model.domain, new_selector)

    # Update database
    domain_model.dkim_selector = new_selector
    domain_model.dkim_private_path = private_key_path
    domain_model.dkim_public_key = public_key
    db.commit()
    db.refresh(domain_model)

    # Update DNS if Cloudflare is configured
    if settings.CF_API_TOKEN and settings.CF_ZONE_ID:
        try:
            cf = cloudflare.CloudflareAPI()
            dkim_name = f"{new_selector}._domainkey.{domain_model.domain}"
            dkim_value = f"v=DKIM1; k=rsa; p={public_key}"
            await cf.create_or_update_record(
                record_type="TXT",
                name=dkim_name,
                content=dkim_value,
                ttl=300
            )
            logger.info(f"DNS updated for new DKIM key: {dkim_name}")
        except Exception as e:
            logger.warning(f"Failed to update DNS for rotated DKIM: {e}")

    # Log event
    event = models.Event(
        workspace_id=domain_model.workspace_id,
        type="domain.dkim_rotated",
        payload_json={
            "domain_id": domain_model.id,
            "domain": domain_model.domain,
            "old_selector": domain_model.dkim_selector,
            "new_selector": new_selector
        }
    )
    db.add(event)
    db.commit()

    logger.info(f"DKIM key rotated for {domain_model.domain}")

    return domain_model
