# Backend API Fixes for Frontend Integration

## Issues Found

The frontend expects certain response formats that don't match the current backend. Here are the mismatches:

### 1. **Domains API**
**Endpoint:** `GET /api/domains`
- **Current:** Returns `{ domains: [...] }`
- **Expected:** Returns `[...]` (array directly)
- **Fix:** Change response to return array directly

### 2. **Mailboxes API**
**Endpoint:** `GET /api/mailboxes`
- **Current:** Returns `{ mailboxes: [...] }`
- **Expected:** Returns `[...]` (array directly)
- **Fix:** Change response to return array directly

**Field Mismatch:**
- **Current:** Mailbox has `status` field with values like "active"
- **Expected:** Mailbox has `enabled: boolean` field
- **Current:** Missing `workspace_id` and `domain_id` in list response
- **Expected:** Include `workspace_id`, `domain_id`, `local_part`, `enabled`
- **Fix:** Add these fields to response

### 3. **API Keys**
**Endpoint:** `GET /api/apikeys`
- **Current:** Returns `{ api_keys: [...] }`
- **Expected:** Returns `[...]` (array directly)
- **Fix:** Change response to return array directly

**Field Mismatch:**
- **Current:** Has `prefix` field
- **Expected:** Has `key_prefix` field
- **Fix:** Rename `prefix` to `key_prefix` in response

### 4. **DNS Records**
**Endpoint:** `GET /api/domains/{id}/dns-records`
- **Current:** Returns `{ domain: "...", dns_records: [...] }`
- **Expected:** Returns `{ domain: "...", records: [...] }`
- **Fix:** Rename `dns_records` to `records`

### 5. **DKIM Rotation**
**Endpoint:** `POST /api/domains/{id}/rotate-dkim`
- **Current:** Returns detailed object with `message`, `domain`, `old_selector`, `new_selector`, `new_public_key`, `dns_record`
- **Expected:** Frontend type expects `{ domain, new_selector, new_public_key, old_selector, message }`
- **Status:** ✅ Already matches (frontend is flexible)

---

## Changes to Make

### File: `apps/api/app/routes_domains.py`

```python
# Line 117-129: Change list_domains response
return [  # Changed from return {"domains": [...]}
    {
        "id": d.id,
        "domain": d.domain,
        "hostname": d.hostname,
        "dkim_selector": d.dkim_selector,
        "workspace_id": d.workspace_id,  # Add this field
        "created_at": d.created_at.isoformat()
    }
    for d in domains
]

# Line 180-183: Change DNS records response
return {
    "domain": domain_model.domain,
    "records": dns_records  # Changed from "dns_records"
}
```

### File: `apps/api/app/routes_mailboxes.py`

```python
# Line 137: Change list_mailboxes response
return [  # Changed from return {"mailboxes": result}
    {
        "id": mailbox.id,
        "workspace_id": mailbox.workspace_id,  # Add this
        "domain_id": mailbox.domain_id,        # Add this
        "local_part": mailbox.local_part,      # Add this
        "email": full_email,
        "quota_mb": mailbox.quota_mb,
        "enabled": mailbox.status == "active", # Map status to enabled
        "created_at": mailbox.created_at.isoformat()
    }
    for mailbox in result
]
```

### File: `apps/api/app/main.py`

```python
# Line 302-314: Change API keys list response
return [  # Changed from return {"api_keys": [...]}
    {
        "id": k.id,
        "name": k.name,
        "key_prefix": k.prefix,  # Changed from "prefix"
        "scopes": k.scopes,
        "created_at": k.created_at.isoformat(),
        "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None
    }
    for k in keys
]

# Line 282-289: Change create API key response
return {
    "id": api_key.id,
    "name": api_key.name,
    "api_key": full_key,
    "key_prefix": prefix,  # Changed from "prefix"
    "scopes": api_key.scopes,
    "created_at": api_key.created_at.isoformat()
}
```

---

## Summary

- 4 endpoints need response format changes
- 3 field renames needed
- 3 additional fields needed in mailbox response
- All changes are backward-compatible additions or simple renames
