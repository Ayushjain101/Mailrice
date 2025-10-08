# Backend Bug Report - Mailrice v2

**Date:** October 8, 2025
**Reviewer:** Backend Security & Code Review
**Version:** v2.0.0

---

## Executive Summary

Reviewed 9 backend files covering models, services, routes, authentication, and configuration. Identified **11 issues** ranging from critical security vulnerabilities to performance optimizations.

**Critical Issues:** 2
**High Priority:** 4
**Medium Priority:** 3
**Low Priority:** 2

---

## 🔴 CRITICAL ISSUES

### BUG-001: JWT Secret Regenerates on App Restart (CRITICAL)

**File:** `apps/api/app/config.py:24`

**Issue:**
```python
JWT_SECRET: str = secrets.token_urlsafe(32)
```

The JWT secret has a default value that generates a NEW random secret every time the application starts. This causes:
- All existing JWT tokens to become invalid on restart
- Users are logged out on every deployment
- Session persistence is impossible

**Impact:** Critical security and UX issue. Production deployments will log out all users.

**Fix:**
```python
# Remove the default generator - require it from environment
JWT_SECRET: str  # No default, must be in .env

# OR provide a warning if using default
JWT_SECRET: str = ""

def __init__(self, **kwargs):
    super().__init__(**kwargs)
    if not self.JWT_SECRET:
        raise ValueError("JWT_SECRET must be set in environment variables for production")
```

**Status:** 🔴 Requires immediate fix

---

### BUG-002: N+1 Query Problem in List Mailboxes (CRITICAL PERFORMANCE)

**File:** `apps/api/app/routes_mailboxes.py:123-137`

**Issue:**
```python
for mailbox in mailboxes:
    domain = db.query(models.Domain).filter(models.Domain.id == mailbox.domain_id).first()
    full_email = f"{mailbox.local_part}@{domain.domain}"
```

The code executes a separate database query for EACH mailbox to fetch domain information. With 1000 mailboxes, this results in 1001 queries (1 + 1000).

**Impact:**
- Severe performance degradation with many mailboxes
- Database overload
- Slow API response times (potentially 5-10 seconds for large lists)

**Fix:**
```python
# Use joinedload for eager loading
from sqlalchemy.orm import joinedload

@router.get("/")
async def list_mailboxes(
    workspace_id: Optional[int] = None,
    domain_id: Optional[int] = None,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """List all mailboxes for user's tenant"""
    query = db.query(models.Mailbox)\
        .join(models.Workspace)\
        .options(joinedload(models.Mailbox.domain))\
        .filter(models.Workspace.tenant_id == current_user.tenant_id)

    if workspace_id:
        query = query.filter(models.Mailbox.workspace_id == workspace_id)

    if domain_id:
        query = query.filter(models.Mailbox.domain_id == domain_id)

    mailboxes = query.all()

    # Access domain via relationship (no additional query)
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
```

**Status:** 🔴 Requires immediate fix

---

## 🟠 HIGH PRIORITY ISSUES

### BUG-003: Missing Input Validation for Domain Names

**File:** `apps/api/app/routes_domains.py:46-98`

**Issue:** No validation for domain name format. Users could submit:
- Invalid characters: `my domain.com` (spaces)
- Invalid TLDs: `domain.invalidtld123`
- Special characters: `domain$.com`
- Localhost or private IPs: `localhost`, `127.0.0.1`

**Impact:**
- Invalid domains in database
- Mail server configuration failures
- Security issues with special characters

**Fix:**
```python
import re
from pydantic import validator

class CreateDomainRequest(BaseModel):
    workspace_id: int
    domain: str
    hostname: Optional[str] = None
    dkim_selector: str = "mail"

    @validator('domain')
    def validate_domain(cls, v):
        # RFC-compliant domain validation
        domain_regex = r'^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$'
        if not re.match(domain_regex, v):
            raise ValueError('Invalid domain format')
        if len(v) > 253:
            raise ValueError('Domain name too long (max 253 characters)')
        return v.lower()

    @validator('dkim_selector')
    def validate_selector(cls, v):
        if not re.match(r'^[a-z0-9-]+$', v):
            raise ValueError('DKIM selector can only contain lowercase letters, numbers, and hyphens')
        return v
```

**Status:** 🟠 High priority

---

### BUG-004: Missing Email Local Part Validation

**File:** `apps/api/app/routes_mailboxes.py:43-99`

**Issue:** No validation for local_part (username) in mailbox creation:
- Special characters not validated
- No length check
- No reserved words check (postmaster, abuse, etc.)

**Impact:**
- Invalid email addresses in database
- Mail delivery failures
- RFC violations

**Fix:**
```python
import re
from pydantic import validator

class CreateMailboxRequest(BaseModel):
    workspace_id: int
    domain_id: int
    local_part: str
    password: str
    quota_mb: int = 1024

    @validator('local_part')
    def validate_local_part(cls, v):
        # RFC 5321 local part validation (simplified)
        if not re.match(r'^[a-zA-Z0-9.!#$%&\'*+/=?^_`{|}~-]+$', v):
            raise ValueError('Invalid characters in email local part')
        if len(v) > 64:
            raise ValueError('Local part too long (max 64 characters)')
        if v.startswith('.') or v.endswith('.') or '..' in v:
            raise ValueError('Invalid dot placement in local part')
        return v.lower()

    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        return v

    @validator('quota_mb')
    def validate_quota(cls, v):
        if v < 1 or v > 100000:  # Max 100GB
            raise ValueError('Quota must be between 1 MB and 100000 MB')
        return v
```

**Status:** 🟠 High priority

---

### BUG-005: Missing Transaction Management in Domain Deletion

**File:** `apps/api/app/routes_domains.py:232-258`

**Issue:** Domain deletion doesn't wrap operations in try/except:
```python
db.delete(domain_model)
db.commit()  # What if this fails?

return {"message": "Domain deleted successfully"}
```

If commit fails, the domain is marked for deletion but not actually removed, causing database inconsistency.

**Impact:** Data corruption on commit failures

**Fix:**
```python
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

    try:
        db.delete(domain_model)
        db.commit()
        logger.info(f"Deleted domain {domain_model.domain} (id={domain_id})")
        return {"message": "Domain deleted successfully"}
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to delete domain {domain_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete domain: {str(e)}"
        )
```

**Status:** 🟠 High priority

---

### BUG-006: No Rate Limiting on Authentication Endpoints

**File:** `apps/api/app/main.py:190-223`

**Issue:** Login endpoint has no rate limiting. Vulnerable to:
- Brute force password attacks
- Credential stuffing
- Account enumeration

**Impact:** Security vulnerability - attackers can attempt unlimited login attempts

**Fix:** Add rate limiting middleware
```python
# Install: pip install slowapi
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

@app.post("/api/auth/login", response_model=LoginResponse)
@limiter.limit("5/minute")  # Max 5 login attempts per minute per IP
async def login(
    request: LoginRequest,
    db: Session = Depends(get_db),
    req: Request = None
):
    # ... existing code
```

**Status:** 🟠 High priority

---

## 🟡 MEDIUM PRIORITY ISSUES

### BUG-007: Missing Workspace Ownership Validation

**File:** `apps/api/app/routes_domains.py:101-128`, `apps/api/app/routes_mailboxes.py:102-139`

**Issue:** When filtering by workspace_id, the code doesn't validate if the workspace belongs to the user's tenant. It just returns empty results.

**Impact:** Poor UX - users might think the workspace is empty rather than unauthorized

**Fix:**
```python
@router.get("/")
async def list_domains(
    workspace_id: Optional[int] = None,
    current_user: models.User = Depends(get_current_user_from_token),
    db: Session = Depends(get_db)
):
    """List all domains for user's tenant"""

    # Validate workspace ownership if provided
    if workspace_id:
        workspace = db.query(models.Workspace).filter(
            models.Workspace.id == workspace_id,
            models.Workspace.tenant_id == current_user.tenant_id
        ).first()

        if not workspace:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Workspace not found or access denied"
            )

    query = db.query(models.Domain).join(models.Workspace).filter(
        models.Workspace.tenant_id == current_user.tenant_id
    )

    if workspace_id:
        query = query.filter(models.Domain.workspace_id == workspace_id)

    domains = query.all()
    # ... rest of code
```

**Status:** 🟡 Medium priority

---

### BUG-008: DKIM Rotation Doesn't Check for Duplicate Selector

**File:** `apps/api/app/services/domain.py:85-132`

**Issue:** No validation that new_selector != old_selector. User could "rotate" to the same selector, wasting resources.

**Impact:** Unnecessary DKIM key generation, confusing logs

**Fix:**
```python
async def rotate_dkim_key(db: Session, domain_id: int, new_selector: str) -> models.Domain:
    """Rotate DKIM key for domain"""
    domain = db.query(models.Domain).filter(models.Domain.id == domain_id).first()

    if not domain:
        raise ValueError("Domain not found")

    # Validate new selector is different
    if new_selector == domain.dkim_selector:
        raise ValueError(f"New selector must be different from current selector '{domain.dkim_selector}'")

    # Validate selector format
    if not re.match(r'^[a-z0-9-]+$', new_selector):
        raise ValueError("Selector can only contain lowercase letters, numbers, and hyphens")

    # ... rest of rotation logic
```

**Status:** 🟡 Medium priority

---

### BUG-009: No API Key Rotation Support

**File:** `apps/api/app/main.py:256-333`

**Issue:** API keys can only be created or deleted. No rotation mechanism means:
- Deleting old key before creating new one causes API downtime
- No way to gradually rotate keys

**Impact:** Service disruption during key rotation

**Recommendation:** Add API key rotation endpoint that:
1. Creates new key
2. Returns new key
3. Marks old key for deletion after grace period (e.g., 7 days)

**Status:** 🟡 Medium priority (enhancement)

---

## 🟢 LOW PRIORITY ISSUES

### BUG-010: Missing Database Indexes (Performance)

**File:** Database schema in Alembic migrations

**Issue:** Need to verify foreign key indexes exist for:
- `Domain.workspace_id`
- `Mailbox.workspace_id`
- `Mailbox.domain_id`
- `APIKey.tenant_id`

**Impact:** Slow JOIN queries at scale

**Fix:** Check Alembic migration and add indexes if missing

**Status:** 🟢 Low priority (requires schema check)

---

### BUG-011: Cloudflare Error Handling Could Be Improved

**File:** `apps/api/app/services/domain.py:41-47`

**Issue:** Cloudflare DNS creation failures are logged but don't provide actionable feedback

**Recommendation:** Add more specific error messages for common Cloudflare failures

**Status:** 🟢 Low priority (enhancement)

---

## ✅ SECURITY REVIEW - GOOD PRACTICES FOUND

### What's Working Well:

1. **SQL Injection Protection** ✅
   - Using SQLAlchemy ORM correctly
   - No raw SQL with user input
   - Parameterized queries throughout

2. **Password Hashing** ✅
   - Using Argon2id (industry best practice)
   - Bcrypt fallback for compatibility
   - Proper verification

3. **JWT Implementation** ✅
   - Using python-jose library
   - Including expiration times
   - Proper token validation

4. **Authorization** ✅
   - All routes check tenant_id
   - Proper workspace ownership validation
   - No IDOR vulnerabilities found

5. **API Key Security** ✅
   - Keys are hashed before storage
   - Prefix-based lookup
   - One-time display after creation

6. **Database Transactions** ✅
   - Proper rollback on mailbox creation failures
   - Session management with context managers

---

## 📋 PRIORITY FIX CHECKLIST

### Immediate (Critical - Fix before next deployment):
- [ ] **BUG-001:** Fix JWT secret generation (config.py)
- [ ] **BUG-002:** Fix N+1 query in list_mailboxes (routes_mailboxes.py)

### High Priority (Fix this week):
- [ ] **BUG-003:** Add domain name validation
- [ ] **BUG-004:** Add email local part validation
- [ ] **BUG-005:** Add transaction management to domain deletion
- [ ] **BUG-006:** Add rate limiting to auth endpoints

### Medium Priority (Fix in next sprint):
- [ ] **BUG-007:** Add workspace ownership validation
- [ ] **BUG-008:** Validate DKIM selector in rotation
- [ ] **BUG-009:** Consider API key rotation feature

### Low Priority (Review and plan):
- [ ] **BUG-010:** Audit database indexes
- [ ] **BUG-011:** Improve Cloudflare error messages

---

## 📊 IMPACT SUMMARY

| Severity | Count | Est. Fix Time | Risk Level |
|----------|-------|---------------|------------|
| Critical | 2 | 4 hours | High |
| High | 4 | 8 hours | Medium |
| Medium | 3 | 6 hours | Low |
| Low | 2 | 4 hours | Very Low |
| **Total** | **11** | **~22 hours** | - |

---

## 🎯 RECOMMENDED NEXT STEPS

1. **Immediate action:** Fix BUG-001 and BUG-002 before deploying to production
2. **This week:** Implement input validation (BUG-003, BUG-004) to prevent bad data
3. **Security:** Add rate limiting (BUG-006) to prevent brute force attacks
4. **Testing:** Add integration tests for all fixed bugs
5. **Monitoring:** Add logging for failed validations to track issues

---

**Report Generated:** October 8, 2025
**Status:** Ready for fixes
**Next Review:** After critical fixes are deployed

🤖 **Generated with [Claude Code](https://claude.com/claude-code)**
