# Mailrice v2 - Testing Guide

Complete testing guide for validating the email platform after deployment.

## Prerequisites

1. Deploy Mailrice v2:
   ```bash
   ./install.sh your-domain.com mail.your-domain.com
   ```

2. Get admin credentials:
   ```bash
   ssh root@your-server
   cat /root/.mailrice-credentials.txt
   ```

## Part 1: API Health Check

### 1.1 Test API Health
```bash
curl https://mail.your-domain.com/api/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "version": "2.0.0"
}
```

### 1.2 Test Login
```bash
curl -X POST https://mail.your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@your-domain.com",
    "password": "your-admin-password"
  }'
```

**Expected Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user": {
    "id": 1,
    "email": "admin@your-domain.com",
    "role": "owner",
    "tenant_id": 1
  }
}
```

**Save the token:**
```bash
export JWT_TOKEN="your-jwt-token-here"
```

## Part 2: Domain Provisioning

### 2.1 Create Test Domain
```bash
curl -X POST https://mail.your-domain.com/api/domains \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": 1,
    "domain": "testmail.com",
    "hostname": "mail.your-domain.com",
    "dkim_selector": "mail"
  }'
```

**Expected Response:**
```json
{
  "id": 1,
  "domain": "testmail.com",
  "hostname": "mail.your-domain.com",
  "dkim_selector": "mail",
  "dkim_public_key": "MIIBIjANBgkqhki...",
  "spf_policy": "v=spf1 ip4:1.2.3.4 a:mail.your-domain.com ~all",
  "dmarc_policy": "v=DMARC1; p=quarantine; rua=mailto:dmarc@testmail.com...",
  "status": "active",
  "created_at": "2025-10-08T..."
}
```

### 2.2 Get DNS Records
```bash
curl https://mail.your-domain.com/api/domains/1/dns-records \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Expected Response:**
```json
{
  "domain": "testmail.com",
  "dns_records": {
    "mx": {
      "type": "MX",
      "name": "testmail.com",
      "value": "mail.your-domain.com",
      "priority": 10,
      "ttl": 300
    },
    "spf": {
      "type": "TXT",
      "name": "testmail.com",
      "value": "v=spf1 ip4:1.2.3.4 a:mail.your-domain.com ~all",
      "ttl": 300
    },
    "dkim": {
      "type": "TXT",
      "name": "mail._domainkey.testmail.com",
      "value": "v=DKIM1; k=rsa; p=MIIBIjANBgkqhki...",
      "ttl": 300
    },
    "dmarc": {
      "type": "TXT",
      "name": "_dmarc.testmail.com",
      "value": "v=DMARC1; p=quarantine; rua=mailto:dmarc@testmail.com...",
      "ttl": 300
    }
  }
}
```

### 2.3 Configure DNS
If Cloudflare is configured, DNS records are created automatically.

If not, manually create the DNS records from step 2.2 in your DNS provider.

### 2.4 Verify DNS Records
```bash
# Check MX record
dig MX testmail.com +short

# Check SPF record
dig TXT testmail.com +short | grep spf1

# Check DKIM record
dig TXT mail._domainkey.testmail.com +short

# Check DMARC record
dig TXT _dmarc.testmail.com +short
```

## Part 3: Mailbox Provisioning

### 3.1 Create Test Mailbox
```bash
curl -X POST https://mail.your-domain.com/api/mailboxes \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": 1,
    "domain_id": 1,
    "local_part": "john",
    "password": "SecurePassword123!",
    "quota_mb": 1024
  }'
```

**Expected Response:**
```json
{
  "id": 1,
  "email": "john@testmail.com",
  "quota_mb": 1024,
  "status": "active",
  "created_at": "2025-10-08T..."
}
```

### 3.2 Verify Maildir Created
```bash
ssh root@your-server
ls -la /var/vmail/testmail.com/john/
```

**Expected Output:**
```
drwxrwx--- 5 vmail vmail 4096 Oct  8 12:00 .
drwxrwx--- 3 vmail vmail 4096 Oct  8 12:00 ..
drwxrwx--- 2 vmail vmail 4096 Oct  8 12:00 cur
drwxrwx--- 2 vmail vmail 4096 Oct  8 12:00 new
drwxrwx--- 2 vmail vmail 4096 Oct  8 12:00 tmp
```

### 3.3 Create Second Mailbox
```bash
curl -X POST https://mail.your-domain.com/api/mailboxes \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": 1,
    "domain_id": 1,
    "local_part": "jane",
    "password": "AnotherSecure456!",
    "quota_mb": 2048
  }'
```

## Part 4: Email Flow Testing

### 4.1 Test SMTP Authentication
```bash
telnet mail.your-domain.com 587
```

```
> EHLO testmail.com
> STARTTLS
> AUTH LOGIN
> [base64 encoded: john@testmail.com]
> [base64 encoded: SecurePassword123!]
```

**Alternative with swaks:**
```bash
sudo apt-get install swaks

swaks --to jane@testmail.com \
  --from john@testmail.com \
  --server mail.your-domain.com:587 \
  --auth LOGIN \
  --auth-user john@testmail.com \
  --auth-password 'SecurePassword123!' \
  --tls \
  --header "Subject: Test Email" \
  --body "This is a test email from Mailrice v2"
```

**Expected Output:**
```
*** 250 2.0.0 Ok: queued as ABC123
```

### 4.2 Check Mail Logs
```bash
ssh root@your-server
tail -f /var/log/mail.log
```

**Look for:**
- `postfix/submission/smtpd`: Connection accepted
- `postfix/cleanup`: Message accepted
- `opendkim`: DKIM signature added
- `dovecot: lmtp`: Saved mail to INBOX

### 4.3 Test IMAP Login
```bash
telnet mail.your-domain.com 143
```

```
> a1 LOGIN jane@testmail.com AnotherSecure456!
> a2 SELECT INBOX
> a3 FETCH 1 BODY[]
> a4 LOGOUT
```

**Expected:**
- Login successful
- INBOX selected
- Email content displayed with DKIM signature

### 4.4 Test with Email Client

**Thunderbird / Outlook Configuration:**

**Incoming Mail (IMAP):**
- Server: mail.your-domain.com
- Port: 993
- Security: SSL/TLS
- Username: jane@testmail.com
- Password: AnotherSecure456!

**Outgoing Mail (SMTP):**
- Server: mail.your-domain.com
- Port: 587
- Security: STARTTLS
- Username: jane@testmail.com
- Password: AnotherSecure456!

## Part 5: DKIM Verification

### 5.1 Send Test Email to External Address
```bash
swaks --to your-gmail@gmail.com \
  --from john@testmail.com \
  --server mail.your-domain.com:587 \
  --auth LOGIN \
  --auth-user john@testmail.com \
  --auth-password 'SecurePassword123!' \
  --tls \
  --header "Subject: DKIM Test" \
  --body "Testing DKIM signature"
```

### 5.2 Check DKIM Signature in Gmail
1. Open the email in Gmail
2. Click "Show original"
3. Look for:
   ```
   ARC-Authentication-Results: i=1;
   dkim=pass header.i=@testmail.com header.s=mail
   ```

### 5.3 Use DKIM Validator
Send email to: `check-auth@verifier.port25.com`

You'll receive a report showing:
- SPF: pass
- DKIM: pass
- DMARC: pass

## Part 6: API Key Testing

### 6.1 Create API Key
```bash
curl -X POST https://mail.your-domain.com/api/apikeys \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test API Key",
    "scopes": ["domains:read", "mailboxes:write"]
  }'
```

**Expected Response:**
```json
{
  "id": 1,
  "name": "Test API Key",
  "api_key": "mr_live_abcdef1234567890abcdef1234567890",
  "prefix": "mr_live_abcd",
  "scopes": ["domains:read", "mailboxes:write"],
  "created_at": "2025-10-08T..."
}
```

**⚠️ Save the `api_key` - it's only shown once!**

### 6.2 Test API Key Authentication
```bash
export API_KEY="mr_live_abcdef1234567890abcdef1234567890"

curl https://mail.your-domain.com/api/domains \
  -H "X-API-Key: $API_KEY"
```

**Expected:** List of domains returned

## Part 7: Advanced Testing

### 7.1 Test DKIM Key Rotation
```bash
curl -X POST https://mail.your-domain.com/api/domains/1/rotate-dkim \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "new_selector": "mail2025"
  }'
```

**Expected:**
- New DKIM key generated
- DNS updated (if Cloudflare configured)
- Response contains new public key

### 7.2 Test Password Update
```bash
curl -X PUT https://mail.your-domain.com/api/mailboxes/1/password \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "new_password": "NewSecurePassword789!"
  }'
```

**Expected:** Password updated, test IMAP/SMTP login with new password

### 7.3 Test Mailbox Deletion
```bash
# Create temporary mailbox
curl -X POST https://mail.your-domain.com/api/mailboxes \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": 1,
    "domain_id": 1,
    "local_part": "temp",
    "password": "TempPass123!",
    "quota_mb": 512
  }'

# Delete it
curl -X DELETE https://mail.your-domain.com/api/mailboxes/3 \
  -H "Authorization: Bearer $JWT_TOKEN"

# Verify maildir deleted
ssh root@your-server 'ls /var/vmail/testmail.com/temp'
# Should return: No such file or directory
```

### 7.4 Test Domain Deletion Protection
```bash
# Try to delete domain with active mailboxes
curl -X DELETE https://mail.your-domain.com/api/domains/1 \
  -H "Authorization: Bearer $JWT_TOKEN"
```

**Expected Response:**
```json
{
  "detail": "Cannot delete domain with 2 active mailboxes"
}
```

## Part 8: Security Testing

### 8.1 Test TLS Enforcement
```bash
# Try to connect without TLS (should fail)
telnet mail.your-domain.com 143
> a1 LOGIN jane@testmail.com password
```

**Expected:** Login rejected (TLS required)

### 8.2 Test Authentication Requirement
```bash
# Try to send without authentication
telnet mail.your-domain.com 25
> EHLO testmail.com
> MAIL FROM:<john@testmail.com>
> RCPT TO:<external@gmail.com>
```

**Expected:** Relay denied (authentication required)

### 8.3 Test JWT Expiration
Use an expired JWT token - should receive 401 Unauthorized

### 8.4 Test Tenant Isolation
Try to access another tenant's resources - should receive 404 Not Found

## Part 9: Performance Testing

### 9.1 Load Test - Create Multiple Mailboxes
```bash
for i in {1..10}; do
  curl -X POST https://mail.your-domain.com/api/mailboxes \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"workspace_id\": 1,
      \"domain_id\": 1,
      \"local_part\": \"user$i\",
      \"password\": \"Password$i!\",
      \"quota_mb\": 1024
    }"
  echo "Created user$i"
done
```

### 9.2 Load Test - Send Multiple Emails
```bash
for i in {1..100}; do
  swaks --to user1@testmail.com \
    --from user2@testmail.com \
    --server mail.your-domain.com:587 \
    --auth LOGIN \
    --auth-user user2@testmail.com \
    --auth-password 'Password2!' \
    --tls \
    --header "Subject: Load Test $i" \
    --body "Email number $i" &
done
wait
```

## Part 10: Troubleshooting

### Check Service Status
```bash
ssh root@your-server

# Check all services
systemctl status mailrice-api
systemctl status postgresql
systemctl status redis
systemctl status nginx
systemctl status postfix
systemctl status dovecot
systemctl status opendkim

# Check logs
journalctl -u mailrice-api -f
tail -f /var/log/mail.log
tail -f /var/log/nginx/error.log
```

### Common Issues

**Issue: DNS not resolving**
```bash
# Wait for DNS propagation (up to 48 hours)
# Use DNS propagation checker: https://dnschecker.org
```

**Issue: SSL certificate not obtained**
```bash
# Check Cloudflare credentials
cat /root/.secrets/cloudflare.ini

# Manually request certificate
certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d mail.your-domain.com
```

**Issue: Maildir permissions**
```bash
chown -R vmail:vmail /var/vmail
chmod -R 770 /var/vmail
```

**Issue: OpenDKIM not signing**
```bash
# Check OpenDKIM logs
journalctl -u opendkim -n 50

# Verify key exists
ls -la /etc/opendkim/keys/testmail.com/

# Test OpenDKIM
opendkim-testkey -d testmail.com -s mail -vvv
```

## Success Criteria

✅ All tests pass:
- [ ] API health check returns healthy
- [ ] JWT authentication works
- [ ] Domain creation succeeds
- [ ] DNS records created/retrievable
- [ ] Mailbox creation succeeds with proper maildir
- [ ] SMTP authentication succeeds
- [ ] Email delivery works (john → jane)
- [ ] IMAP login and retrieval works
- [ ] DKIM signature verified
- [ ] SPF check passes
- [ ] API key authentication works
- [ ] DKIM rotation succeeds
- [ ] Password update works
- [ ] Mailbox deletion cleans up properly
- [ ] Domain deletion protection works
- [ ] TLS enforcement active
- [ ] Services running without errors

## Next Steps

After successful testing:
1. Configure monitoring (Session 3?)
2. Set up backups
3. Configure rate limiting
4. Add webhook notifications
5. Build frontend dashboard

---

**Need Help?**
- Check logs: `/var/log/mail.log`, `journalctl -u mailrice-api`
- Verify DNS: `dig MX/TXT domain.com`
- Test DKIM: Send to check-auth@verifier.port25.com
- Mail tester: https://www.mail-tester.com
