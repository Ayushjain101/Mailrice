"""
Cloudflare DNS API Helper
Manages DNS records for email domains
"""
import httpx
from typing import Optional, Dict, Any
from app.config import settings
import logging

logger = logging.getLogger(__name__)


class CloudflareAPI:
    """Cloudflare API wrapper for DNS management"""

    BASE_URL = "https://api.cloudflare.com/client/v4"

    def __init__(self, api_token: Optional[str] = None, zone_id: Optional[str] = None):
        self.api_token = api_token or settings.CF_API_TOKEN
        self.zone_id = zone_id or settings.CF_ZONE_ID

        if not self.api_token or not self.zone_id:
            raise ValueError("Cloudflare API token and Zone ID are required")

        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }

    async def create_or_update_record(
        self,
        record_type: str,
        name: str,
        content: str,
        ttl: int = 300,
        proxied: bool = False,
        priority: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Create or update DNS record

        Args:
            record_type: Record type (A, MX, TXT, etc.)
            name: Record name (e.g., "mail.example.com" or "@" for root)
            content: Record content/value
            ttl: Time to live in seconds
            proxied: Whether to proxy through Cloudflare
            priority: Priority for MX records

        Returns:
            Created/updated record info
        """
        # Check if record exists
        existing = await self.get_record(record_type, name)

        data = {
            "type": record_type,
            "name": name,
            "content": content,
            "ttl": ttl,
            "proxied": proxied
        }

        if priority is not None:
            data["priority"] = priority

        async with httpx.AsyncClient() as client:
            if existing:
                # Update existing record
                url = f"{self.BASE_URL}/zones/{self.zone_id}/dns_records/{existing['id']}"
                response = await client.put(url, headers=self.headers, json=data, timeout=30.0)
            else:
                # Create new record
                url = f"{self.BASE_URL}/zones/{self.zone_id}/dns_records"
                response = await client.post(url, headers=self.headers, json=data, timeout=30.0)

            response.raise_for_status()
            result = response.json()

            if not result.get("success"):
                raise Exception(f"Cloudflare API error: {result.get('errors')}")

            logger.info(f"DNS record {record_type} {name} created/updated")
            return result["result"]

    async def get_record(self, record_type: str, name: str) -> Optional[Dict[str, Any]]:
        """Get existing DNS record"""
        url = f"{self.BASE_URL}/zones/{self.zone_id}/dns_records"
        params = {"type": record_type, "name": name}

        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=self.headers, params=params, timeout=30.0)
            response.raise_for_status()
            result = response.json()

            if result.get("success") and result.get("result"):
                return result["result"][0]
            return None

    async def delete_record(self, record_id: str) -> bool:
        """Delete DNS record by ID"""
        url = f"{self.BASE_URL}/zones/{self.zone_id}/dns_records/{record_id}"

        async with httpx.AsyncClient() as client:
            response = await client.delete(url, headers=self.headers, timeout=30.0)
            response.raise_for_status()
            result = response.json()

            return result.get("success", False)

    async def create_domain_records(
        self,
        domain: str,
        hostname: str,
        server_ip: str,
        dkim_selector: str,
        dkim_public_key: str
    ) -> Dict[str, Any]:
        """
        Create all necessary DNS records for email domain

        Returns dict with created record IDs
        """
        records_created = {}

        # 1. MX Record
        mx_record = await self.create_or_update_record(
            record_type="MX",
            name=domain,
            content=hostname,
            priority=10,
            ttl=300
        )
        records_created["mx"] = mx_record
        logger.info(f"Created MX record: {domain} -> {hostname}")

        # 2. SPF Record
        spf_value = f"v=spf1 ip4:{server_ip} a:{hostname} ~all"
        spf_record = await self.create_or_update_record(
            record_type="TXT",
            name=domain,
            content=spf_value,
            ttl=300
        )
        records_created["spf"] = spf_record
        logger.info(f"Created SPF record for {domain}")

        # 3. DKIM Record
        dkim_name = f"{dkim_selector}._domainkey.{domain}"
        dkim_value = f"v=DKIM1; k=rsa; p={dkim_public_key}"
        dkim_record = await self.create_or_update_record(
            record_type="TXT",
            name=dkim_name,
            content=dkim_value,
            ttl=300
        )
        records_created["dkim"] = dkim_record
        logger.info(f"Created DKIM record: {dkim_name}")

        # 4. DMARC Record
        dmarc_name = f"_dmarc.{domain}"
        dmarc_value = f"v=DMARC1; p=quarantine; rua=mailto:dmarc@{domain}; ruf=mailto:dmarc@{domain}; fo=1; pct=100; aspf=r; adkim=r"
        dmarc_record = await self.create_or_update_record(
            record_type="TXT",
            name=dmarc_name,
            content=dmarc_value,
            ttl=300
        )
        records_created["dmarc"] = dmarc_record
        logger.info(f"Created DMARC record for {domain}")

        return records_created


# Convenience functions

async def create_email_dns_records(
    domain: str,
    hostname: str,
    server_ip: str,
    dkim_selector: str,
    dkim_public_key: str
) -> Dict[str, Any]:
    """
    Create all email DNS records for a domain

    Usage:
        records = await create_email_dns_records(
            domain="example.com",
            hostname="mail.example.com",
            server_ip="1.2.3.4",
            dkim_selector="mail",
            dkim_public_key="MIGfMA0GCS..."
        )
    """
    cf = CloudflareAPI()
    return await cf.create_domain_records(
        domain=domain,
        hostname=hostname,
        server_ip=server_ip,
        dkim_selector=dkim_selector,
        dkim_public_key=dkim_public_key
    )
