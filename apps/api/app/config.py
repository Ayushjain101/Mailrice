"""
Application configuration using Pydantic Settings
"""
from pydantic_settings import BaseSettings
from typing import Optional
import secrets


class Settings(BaseSettings):
    """Application settings from environment variables"""

    # App
    APP_NAME: str = "Mailrice v2"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql://mailrice:changeme@localhost/mailrice"

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    JWT_SECRET: str = secrets.token_urlsafe(32)
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 60 * 24  # 24 hours

    # API Keys
    API_KEY_PREFIX: str = "mr_live_"

    # Cloudflare (optional, can be empty)
    CF_EMAIL: Optional[str] = None
    CF_API_TOKEN: Optional[str] = None
    CF_ZONE_ID: Optional[str] = None

    # Mail Server
    MAIN_DOMAIN: str = ""
    HOSTNAME: str = ""

    # SMTP Settings
    POSTFIX_CONFIG_PATH: str = "/etc/postfix"
    DOVECOT_CONFIG_PATH: str = "/etc/dovecot"
    DKIM_KEYS_PATH: str = "/etc/opendkim/keys"
    VMAIL_PATH: str = "/var/vmail"

    # Security
    BCRYPT_ROUNDS: int = 12

    class Config:
        env_file = ".env"
        case_sensitive = True


# Global settings instance
settings = Settings()
