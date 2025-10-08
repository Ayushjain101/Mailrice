"""
DKIM Key Generation and Management
"""
import subprocess
import os
from pathlib import Path
from typing import Tuple
import logging

logger = logging.getLogger(__name__)


def generate_dkim_key(domain: str, selector: str, keys_dir: str = "/etc/opendkim/keys") -> Tuple[str, str]:
    """
    Generate DKIM key pair for domain

    Args:
        domain: Domain name (e.g., "example.com")
        selector: DKIM selector (e.g., "mail")
        keys_dir: Directory to store keys

    Returns:
        Tuple of (private_key_path, public_key_value)
    """
    # Create domain key directory
    domain_key_dir = Path(keys_dir) / domain
    domain_key_dir.mkdir(parents=True, exist_ok=True)

    # Key file paths
    private_key_path = domain_key_dir / f"{selector}.private"
    txt_path = domain_key_dir / f"{selector}.txt"

    # Generate key if it doesn't exist
    if not private_key_path.exists():
        logger.info(f"Generating DKIM key for {domain} with selector {selector}")

        # Run opendkim-genkey
        subprocess.run([
            "opendkim-genkey",
            "-b", "2048",  # 2048-bit key
            "-d", domain,
            "-s", selector,
            "-D", str(domain_key_dir)
        ], check=True, capture_output=True)

        # Rename files (opendkim-genkey creates selector.private and selector.txt)
        generated_private = domain_key_dir / f"{selector}.private"
        generated_txt = domain_key_dir / f"{selector}.txt"

        if not generated_private.exists() or not generated_txt.exists():
            raise FileNotFoundError(f"DKIM key generation failed for {domain}")

        logger.info(f"DKIM key generated at {private_key_path}")

    # Set permissions
    os.chmod(private_key_path, 0o600)
    subprocess.run(["chown", "opendkim:opendkim", str(private_key_path)], check=True)

    # Read public key from .txt file
    with open(txt_path, 'r') as f:
        txt_content = f.read()

    # Extract public key value from DNS record format
    # Format: selector._domainkey IN TXT ( "v=DKIM1; k=rsa; p=KEY_HERE" )
    public_key = extract_public_key_from_txt(txt_content)

    logger.info(f"DKIM public key extracted for {domain}")

    return (str(private_key_path), public_key)


def extract_public_key_from_txt(txt_content: str) -> str:
    """
    Extract public key value from opendkim-genkey .txt file

    Input format:
        mail._domainkey IN TXT ( "v=DKIM1; k=rsa; "
        "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC..." )

    Output:
        MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC...
    """
    import re

    # Remove newlines and extra spaces
    txt_content = txt_content.replace('\n', '').replace('\t', '')

    # Extract p= value
    match = re.search(r'p=([A-Za-z0-9+/=]+)', txt_content)
    if match:
        return match.group(1)
    else:
        raise ValueError("Could not extract public key from DKIM txt file")


def update_opendkim_tables(domain: str, selector: str, private_key_path: str) -> None:
    """
    Update OpenDKIM KeyTable and SigningTable

    Args:
        domain: Domain name
        selector: DKIM selector
        private_key_path: Path to private key file
    """
    key_table_path = "/etc/opendkim/KeyTable"
    signing_table_path = "/etc/opendkim/SigningTable"

    # KeyTable entry: selector._domainkey.domain domain:selector:private_key_path
    key_entry = f"{selector}._domainkey.{domain} {domain}:{selector}:{private_key_path}\n"

    # SigningTable entry: *@domain selector._domainkey.domain
    signing_entry = f"*@{domain} {selector}._domainkey.{domain}\n"

    # Read existing entries
    with open(key_table_path, 'r') as f:
        key_table = f.readlines()

    with open(signing_table_path, 'r') as f:
        signing_table = f.readlines()

    # Remove old entries for this domain
    key_table = [line for line in key_table if f".{domain} " not in line]
    signing_table = [line for line in signing_table if f"@{domain} " not in line]

    # Add new entries
    key_table.append(key_entry)
    signing_table.append(signing_entry)

    # Write back
    with open(key_table_path, 'w') as f:
        f.writelines(key_table)

    with open(signing_table_path, 'w') as f:
        f.writelines(signing_table)

    logger.info(f"Updated OpenDKIM tables for {domain}")

    # Reload OpenDKIM
    subprocess.run(["systemctl", "reload", "opendkim"], check=True)
    logger.info("OpenDKIM reloaded")


def provision_dkim_for_domain(domain: str, selector: str = "mail") -> Tuple[str, str]:
    """
    Complete DKIM provisioning for domain

    Args:
        domain: Domain name
        selector: DKIM selector (default: "mail")

    Returns:
        Tuple of (private_key_path, public_key_value)
    """
    # Generate key
    private_key_path, public_key = generate_dkim_key(domain, selector)

    # Update OpenDKIM configuration
    update_opendkim_tables(domain, selector, private_key_path)

    logger.info(f"DKIM provisioning complete for {domain}")

    return (private_key_path, public_key)
