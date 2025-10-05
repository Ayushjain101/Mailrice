# API Rate Limiting Implementation for Mailrice

## Summary

Added comprehensive three-tier rate limiting system to protect the Mailrice API from abuse and server overload during bulk operations.

## Changes Made

### 1. Package Dependencies ([templates/package.json](templates/package.json))
- Added `express-rate-limit@^7.1.5` dependency

### 2. API Server Code ([templates/server.js](templates/server.js))

**Imports:**
- Added `const rateLimit = require('express-rate-limit');`

**Three Rate Limiting Tiers:**

#### Tier 1: Authentication Rate Limiter (Brute Force Protection)
```javascript
const authLimiter = rateLimit({
  windowMs: 900000,  // 15 minutes
  max: 5,            // 5 failed attempts
  skipSuccessfulRequests: true
});
```
- Prevents brute force attacks on API keys
- Only counts failed authentication attempts
- Applied globally to all routes

#### Tier 2: General API Rate Limiter
```javascript
const generalLimiter = rateLimit({
  windowMs: 60000,   // 1 minute
  max: 100,          // 100 requests
  keyGenerator: (req) => req.headers['x-api-key'] || req.ip
});
```
- Prevents general API abuse
- Applied to all authenticated endpoints
- Rate limits by API key or IP address

#### Tier 3: Strict Rate Limiter (Resource-Intensive Operations)
```javascript
const strictLimiter = rateLimit({
  windowMs: 60000,   // 1 minute
  max: 10,           // 10 creation requests
  keyGenerator: (req) => req.headers['x-api-key'] || req.ip
});
```
- Prevents server overload during bulk operations
- Applied to:
  - `POST /domains` - Domain creation
  - `POST /mailboxes` - Mailbox creation

**Middleware Order:**
```javascript
app.use(authLimiter);      // Auth protection (all routes)
app.use(validateApiKey);   // Authentication
app.use(generalLimiter);   // General rate limit (after auth)
```

### 3. Environment Configuration ([templates/.env.j2](templates/.env.j2))

Added configurable rate limit settings:

```bash
# General API rate limiting
RATE_LIMIT_WINDOW_MS=60000        # Time window (1 minute)
RATE_LIMIT_MAX_REQUESTS=100       # Max requests per window

# Strict rate limiting (resource-intensive operations)
RATE_LIMIT_STRICT_WINDOW_MS=60000 # Time window (1 minute)
RATE_LIMIT_STRICT_MAX=10          # Max creation requests per window

# Auth rate limiting (brute force protection)
RATE_LIMIT_AUTH_WINDOW_MS=900000  # Time window (15 minutes)
RATE_LIMIT_AUTH_MAX=5             # Max failed auth attempts
```

### 4. Documentation ([README.md](README.md))

Added comprehensive "Rate Limiting" section including:
- Three-tier system explanation
- Default limits and configuration
- Response headers documentation
- Error response format
- Configuration instructions
- Cold email agency recommendations

## Benefits

### For Cold Email Agencies

1. **Prevents Server Overload**
   - Limits concurrent mailbox/domain creation
   - Prevents system resource exhaustion
   - Maintains stable performance during bulk operations

2. **Abuse Prevention**
   - Brute force protection on API keys
   - General abuse protection across all endpoints
   - Rate limiting by API key enables multi-tenant isolation

3. **Configurable Limits**
   - Easy to adjust for high-volume operations
   - Recommended: Increase `RATE_LIMIT_STRICT_MAX` to 20-50 for agencies
   - Per-environment configuration

4. **Transparent Feedback**
   - Standard rate limit headers in responses
   - Clear error messages when limits exceeded
   - Helps clients implement retry logic

### Technical Benefits

1. **Layered Protection**
   - Authentication layer protects against brute force
   - General layer prevents API abuse
   - Strict layer protects expensive operations

2. **Resource Management**
   - Prevents database connection exhaustion
   - Limits concurrent file system operations
   - Protects against memory issues

3. **Production Ready**
   - Industry-standard implementation (express-rate-limit)
   - Includes proper headers (RateLimit-* headers)
   - HTTP 429 responses comply with RFC 6585

## Usage Examples

### Normal Operation
```bash
curl -H "x-api-key: your_key" http://localhost:3000/mailboxes
# Returns: 200 OK with data
# Headers include: RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
```

### Rate Limit Exceeded
```bash
# After 10 mailbox creations in 1 minute
curl -X POST -H "x-api-key: your_key" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"pass"}' \
  http://localhost:3000/mailboxes

# Response:
# HTTP 429 Too Many Requests
# {"error": "Too many creation requests. Please slow down."}
```

### Adjusting Limits for High Volume

Edit `.env` file:
```bash
# Increase creation limit for bulk operations
RATE_LIMIT_STRICT_MAX=50  # Allow 50 creates per minute
```

Restart API:
```bash
sudo systemctl restart mailserver-api
```

## Installation

When deploying with Ansible, the rate limiting is automatically configured. For existing installations:

1. Update `package.json`:
```bash
cd /opt/mailserver-api
npm install express-rate-limit@^7.1.5
```

2. Update `server.js` with the new rate limiting code

3. Add rate limit configuration to `.env` file

4. Restart the API:
```bash
sudo systemctl restart mailserver-api
```

## Testing Rate Limits

### Test Auth Rate Limit
```bash
# Send 6 requests with invalid API key
for i in {1..6}; do
  curl -H "x-api-key: invalid" http://localhost:3000/health
done
# 6th request should return 429
```

### Test Strict Rate Limit
```bash
# Create 11 mailboxes rapidly
for i in {1..11}; do
  curl -X POST -H "x-api-key: valid_key" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"test$i@example.com\",\"password\":\"pass\"}" \
    http://localhost:3000/mailboxes
done
# 11th request should return 429
```

## Monitoring

Check rate limit headers in responses:
```bash
curl -v -H "x-api-key: your_key" http://localhost:3000/health

# Look for headers:
# RateLimit-Limit: 100
# RateLimit-Remaining: 99
# RateLimit-Reset: 1696502400
```

## Future Enhancements

Potential improvements for future versions:

1. **Redis-based Rate Limiting**
   - Share rate limits across multiple API instances
   - Enable true distributed rate limiting
   - Better for clustered deployments

2. **Per-API-Key Custom Limits**
   - Store limits in database per API key
   - Premium tiers with higher limits
   - Dynamic limit adjustment

3. **Rate Limit Dashboard**
   - Web UI showing current usage
   - Historical rate limit metrics
   - Alert on approaching limits

4. **Intelligent Rate Limiting**
   - Adaptive limits based on server load
   - Allowlist trusted API keys
   - Time-based limit adjustments

## Files Modified

1. `/tmp/mailrice/templates/package.json` - Added express-rate-limit dependency
2. `/tmp/mailrice/templates/server.js` - Implemented three-tier rate limiting
3. `/tmp/mailrice/templates/.env.j2` - Added rate limit configuration
4. `/tmp/mailrice/README.md` - Added comprehensive documentation

## Compatibility

- **Node.js**: 14.x or higher
- **express-rate-limit**: 7.1.5 or higher
- **express**: 4.18.2 or higher
- **Backward Compatible**: Existing deployments continue to work, rate limiting adds protection without breaking changes
