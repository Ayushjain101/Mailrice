"""
Authentication utilities: JWT, password hashing, API keys
"""
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
import secrets
import hashlib
from app.config import settings

# Password hashing - Argon2id (preferred) with bcrypt fallback
pwd_context = CryptContext(schemes=["argon2", "bcrypt"], deprecated="auto")
argon2_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    """Hash password using argon2id"""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password against hash"""
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create JWT access token

    Args:
        data: Payload to encode (usually {"sub": user_id, "email": email})
        expires_delta: Custom expiration time

    Returns:
        JWT token string
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.JWT_EXPIRATION_MINUTES)

    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """
    Decode and verify JWT token

    Returns:
        Decoded payload if valid, None if invalid
    """
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


def generate_api_key() -> tuple[str, str, str]:
    """
    Generate API key with prefix

    Returns:
        (full_key, prefix, hash) tuple
        - full_key: "mr_live_abc123..." (show once to user)
        - prefix: "mr_live_abc" (stored in DB for identification)
        - hash: bcrypt hash of full key (stored in DB)
    """
    # Generate random key
    random_part = secrets.token_urlsafe(32)
    full_key = f"{settings.API_KEY_PREFIX}{random_part}"

    # Create prefix (first 12 chars)
    prefix = full_key[:12]

    # Hash for storage
    key_hash = pwd_context.hash(full_key)

    return (full_key, prefix, key_hash)


def verify_api_key(provided_key: str, stored_hash: str) -> bool:
    """Verify API key against stored hash"""
    return pwd_context.verify(provided_key, stored_hash)


def hash_webhook_secret(secret: str) -> str:
    """Hash webhook secret for storage"""
    return hashlib.sha256(secret.encode()).hexdigest()


def generate_webhook_secret() -> str:
    """Generate secure webhook secret"""
    return secrets.token_urlsafe(32)
