"""
Network utilities
"""
import httpx
import socket
import logging

logger = logging.getLogger(__name__)


async def get_public_ip() -> str:
    """
    Get server's public IPv4 address

    Uses multiple services as fallback
    """
    services = [
        "https://api.ipify.org",
        "https://ifconfig.me/ip",
        "https://icanhazip.com",
    ]

    for service in services:
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(service, timeout=5.0)
                response.raise_for_status()
                ip = response.text.strip()
                logger.info(f"Public IP detected: {ip}")
                return ip
        except Exception as e:
            logger.warning(f"Failed to get IP from {service}: {e}")
            continue

    # Fallback: use socket method
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        logger.info(f"Public IP from socket: {ip}")
        return ip
    except Exception as e:
        logger.error(f"Could not determine public IP: {e}")
        raise Exception("Failed to determine server public IP address")


def get_hostname() -> str:
    """Get server hostname"""
    return socket.gethostname()
