"""
Mailrice v2 - FastAPI Application
Production email platform with multi-tenancy
"""
from fastapi import FastAPI, Depends, HTTPException, status, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional
import logging

from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.database import get_db
from app import models, auth
from app.routes_domains import router as domains_router
from app.routes_mailboxes import router as mailboxes_router

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)

# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# Add rate limiter to app state
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS - Configured for production security
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        f"https://{settings.HOSTNAME}",  # Production dashboard
        "http://localhost:5173",          # Local development
        "http://localhost:3000",          # Alternative local dev
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Content-Type", "Authorization"],
)

# Include routers
app.include_router(domains_router)
app.include_router(mailboxes_router)


# ==================== Dependency: Authentication ====================

def get_current_user_from_token(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> models.User:
    """
    Dependency to get current user from JWT token
    Usage: current_user: User = Depends(get_current_user_from_token)
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid authorization header",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = authorization.replace("Bearer ", "")
    payload = auth.decode_access_token(token)

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


def get_current_tenant_from_api_key(
    x_api_key: Optional[str] = Header(None),
    db: Session = Depends(get_db)
) -> models.Tenant:
    """
    Dependency to authenticate via API key
    Usage: tenant: Tenant = Depends(get_current_tenant_from_api_key)
    """
    if not x_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-API-Key header"
        )

    # Extract prefix
    prefix = x_api_key[:12] if len(x_api_key) >= 12 else x_api_key

    # Find API key by prefix
    api_key = db.query(models.APIKey).filter(models.APIKey.prefix == prefix).first()

    if not api_key:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

    # Verify full key
    if not auth.verify_api_key(x_api_key, api_key.key_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")

    # Update last used
    api_key.last_used_at = models.datetime.utcnow()
    db.commit()

    # Get tenant
    tenant = db.query(models.Tenant).filter(models.Tenant.id == api_key.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    return tenant


# ==================== Routes ====================

@app.get("/")
def root():
    """Root endpoint"""
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "operational"
    }


@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    """
    Health check endpoint
    Verifies database connectivity
    """
    try:
        # Test database connection
        db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "database": "connected",
            "version": settings.APP_VERSION
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "unhealthy",
                "database": "disconnected",
                "error": str(e)
            }
        )


@app.get("/api/status")
def status_check():
    """
    System status and version info
    """
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "main_domain": settings.MAIN_DOMAIN,
        "hostname": settings.HOSTNAME,
        "cloudflare_configured": bool(settings.CF_API_TOKEN)
    }


# ==================== Auth Routes ====================

from pydantic import BaseModel, EmailStr

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


@app.post("/api/auth/login", response_model=LoginResponse)
@limiter.limit("5/minute")  # Max 5 login attempts per minute per IP
async def login(
    request: Request,
    login_request: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    Login with email/password
    Returns JWT token (rate limited: 5 attempts per minute)
    """
    # Find user
    user = db.query(models.User).filter(models.User.email == login_request.email).first()

    if not user or not auth.verify_password(login_request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    # Create JWT token
    token = auth.create_access_token(
        data={"sub": str(user.id), "email": user.email, "tenant_id": user.tenant_id}
    )

    # Update last login
    user.last_login_at = models.datetime.utcnow()
    db.commit()

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": user.role,
            "tenant_id": user.tenant_id
        }
    }


@app.get("/api/auth/me")
def get_current_user_info(current_user: models.User = Depends(get_current_user_from_token)):
    """
    Get current authenticated user info
    """
    return {
        "id": current_user.id,
        "email": current_user.email,
        "role": current_user.role,
        "tenant_id": current_user.tenant_id,
        "created_at": current_user.created_at
    }


# ==================== API Key Management ====================

class CreateAPIKeyRequest(BaseModel):
    name: str
    scopes: list[str] = []


class CreateAPIKeyResponse(BaseModel):
    id: int
    name: str
    api_key: str  # Only shown once!
    prefix: str
    scopes: list[str]
    created_at: str


@app.post("/api/apikeys", response_model=CreateAPIKeyResponse)
def create_api_key(
    request: CreateAPIKeyRequest,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """
    Create new API key for programmatic access
    """
    # Generate API key
    full_key, prefix, key_hash = auth.generate_api_key()

    # Create database record
    api_key = models.APIKey(
        tenant_id=current_user.tenant_id,
        name=request.name,
        prefix=prefix,
        key_hash=key_hash,
        scopes=request.scopes or []
    )
    db.add(api_key)
    db.commit()
    db.refresh(api_key)

    logger.info(f"Created API key: {prefix} for tenant {current_user.tenant_id}")

    return {
        "id": api_key.id,
        "name": api_key.name,
        "api_key": full_key,  # ONLY TIME THIS IS SHOWN!
        "key_prefix": prefix,
        "scopes": api_key.scopes,
        "created_at": api_key.created_at.isoformat()
    }


@app.get("/api/apikeys")
def list_api_keys(
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """List all API keys for current tenant"""
    keys = db.query(models.APIKey).filter(
        models.APIKey.tenant_id == current_user.tenant_id
    ).all()

    return [
        {
            "id": k.id,
            "name": k.name,
            "key_prefix": k.prefix,
            "scopes": k.scopes,
            "created_at": k.created_at.isoformat(),
            "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None
        }
        for k in keys
    ]


@app.delete("/api/apikeys/{key_id}")
def delete_api_key(
    key_id: int,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """Delete API key"""
    api_key = db.query(models.APIKey).filter(
        models.APIKey.id == key_id,
        models.APIKey.tenant_id == current_user.tenant_id
    ).first()

    if not api_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found")

    db.delete(api_key)
    db.commit()

    return {"message": "API key deleted"}


# ==================== Startup ====================

@app.on_event("startup")
async def startup_event():
    """Application startup"""
    logger.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    logger.info(f"Main domain: {settings.MAIN_DOMAIN}")
    logger.info(f"Hostname: {settings.HOSTNAME}")
