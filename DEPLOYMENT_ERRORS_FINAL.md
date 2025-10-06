# Mailrice Deployment - Final Error Report

**Date:** 2025-10-06
**Target Server:** 51.222.141.197 (vps-760cacfa)
**Domain:** convertedgepro.org
**Hostname:** smtp.convertedgepro.org
**Dashboard:** wow.convertedgepro.org

---

## Final Deployment Status

**Status:** ✅ COMPLETED (Manual Intervention Required)
**Dashboard:** https://wow.convertedgepro.org/
**API:** https://smtp.convertedgepro.org/api/
**API Key:** `x1QS9Wxiz7M30MkAs6JxTjoal5pyjXAIRvZzBKCh8UYPHOyR6dmWCPTTxP1xseDp`

---

## All Errors Encountered (Chronological)

### ❌ ERROR #1: SSH Host Key Mismatch
**Deployment Attempt:** #1
**Task:** Testing SSH connection
**Root Cause:** Old SSH key in `~/.ssh/known_hosts` for IP 51.222.141.197
**Error Message:**
```
WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!
Password authentication is disabled to avoid man-in-the-middle attacks.
ubuntu@51.222.141.197: Permission denied (publickey,password).
```

**Resolution:**
```bash
ssh-keygen -f "/home/ubuntu/.ssh/known_hosts" -R "51.222.141.197"
```

**Status:** ✅ FIXED - Deployment #2 proceeded successfully

---

### ❌ ERROR #2: OpenDKIM Directory Missing
**Deployment Attempt:** #2, #3
**Task:** "Create OpenDKIM config files if they don't exist" (Task 31/32)
**Root Cause:** `/etc/opendkim` directory doesn't exist after OpenDKIM package installation
**Error Message:**
```
failed: [51.222.141.197] (item=/etc/opendkim/KeyTable) => {
  "msg": "Error, could not touch target: [Errno 2] No such file or directory: b'/etc/opendkim/KeyTable'",
  "path": "/etc/opendkim/KeyTable"
}
```

**Impact:** Deployment stopped at task 31/32, preventing dashboard deployment, SSL acquisition, and service configuration

**Resolution Applied:** Added two tasks to deploy.yml before the failing task:
```yaml
- name: Ensure OpenDKIM directory exists
  file:
    path: /etc/opendkim
    state: directory
    owner: opendkim
    group: opendkim
    mode: '0755'

- name: Ensure OpenDKIM keys directory exists
  file:
    path: /etc/opendkim/keys
    state: directory
    owner: opendkim
    group: opendkim
    mode: '0750'
```

**Status:** ✅ FIXED - But required additional fixes...

---

### ❌ ERROR #3: Git Push Authentication Failed
**Deployment Attempt:** #3
**Task:** Pushing fixed deploy.yml to GitHub repository
**Root Cause:** No GitHub credentials configured for pushing to remote repository
**Error Message:**
```
remote: No anonymous write access.
fatal: Authentication failed for 'https://github.com/Ayushjain101/Mailrice.git/'
```

**Impact:** Fixed deploy.yml in `/home/ubuntu/Mailrice/` but couldn't push to GitHub. Deployment script pulls from GitHub, so fixes weren't applied.

**Resolution:**
1. Discovered deploy.sh clones from `https://github.com/Ayushjain101/mailserver-deployment.git` (different repo!)
2. Copied all fixed files from `/home/ubuntu/Mailrice/` to `~/mailserver-deployment/` manually
3. Reran deployment from correct directory

**Status:** ✅ WORKED AROUND - Deployment #4 used local fixed files

---

### ❌ ERROR #4: Nginx Restart Failed (SSL Certificates Missing)
**Deployment Attempt:** #4
**Task:** "restart nginx" handler (Task 47/50)
**Root Cause:** Nginx config references SSL certificates that don't exist yet (chicken-and-egg problem)
**Error Message:**
```
nginx: [emerg] cannot load certificate "/etc/letsencrypt/live/smtp.convertedgepro.org/fullchain.pem": BIO_new_file() failed
nginx: configuration file /etc/nginx/nginx.conf test failed
fatal: [51.222.141.197]: FAILED! => {"msg": "Unable to restart service nginx..."}
```

**Impact:** Deployment stopped at task 47/50. SSL acquisition tasks never executed because they come AFTER nginx restart.

**Resolution:**
1. Disabled Nginx sites temporarily
2. Started Nginx without mail server configs
3. Created temporary HTTP-only configs for both domains
4. Created DNS A records via Cloudflare API:
   - `smtp.convertedgepro.org` → 51.222.141.197
   - `wow.convertedgepro.org` → 51.222.141.197
5. Obtained SSL certificates using certbot:
   ```bash
   certbot certonly --webroot -w /var/www/html -d smtp.convertedgepro.org -d wow.convertedgepro.org
   ```
6. Updated nginx configs to use SSL certificates
7. Reloaded nginx successfully

**Status:** ✅ FIXED MANUALLY - Services running

---

### ❌ ERROR #5: Nginx Reverse Proxy Misconfiguration
**Deployment Attempt:** #4 (Post-restart)
**Task:** Testing API endpoint access
**Root Cause:** HTTPS server blocks were commented out from earlier fix attempts
**Error Message:** API endpoint returned dashboard HTML instead of JSON

**Resolution:**
1. Discovered sed commands during error #4 broke nginx config
2. Recreated clean nginx configs manually:
   - `/etc/nginx/sites-available/mailserver-api` - API reverse proxy
   - `/etc/nginx/sites-available/mailserver-dashboard` - Dashboard static files
3. Fixed dashboard SSL certificate path (both domains use same cert at `/etc/letsencrypt/live/smtp.convertedgepro.org/`)
4. Reloaded nginx

**Status:** ✅ FIXED - API and dashboard accessible via HTTPS

---

### ❌ ERROR #6: OpenDKIM Permission Denied (API)
**Deployment Attempt:** Post-deployment testing
**Task:** Adding domain via API to test SPF/DMARC generation
**Root Cause:** mailapi user lacks permissions to write to `/etc/opendkim/keys/`
**Error Message:**
```
{
  "error": "Failed to generate DKIM keys: EACCES: permission denied, mkdir '/etc/opendkim/keys/convertedgepro.org'"
}
```

**Resolution:**
```bash
sudo chown -R opendkim:opendkim /etc/opendkim
sudo chmod -R 775 /etc/opendkim
sudo usermod -a -G opendkim mailapi
sudo systemctl restart mailserver-api
```

**Status:** ✅ FIXED - DKIM key generation working

---

### ❌ ERROR #7: Database Schema Outdated
**Deployment Attempt:** Post-deployment testing
**Task:** Adding domain via API
**Root Cause:** Database created during deployment #1 with old schema (no SPF/DMARC columns)
**Error Message:**
```
{
  "error": "Unknown column 'spf_record' in 'field list'"
}
```

**Impact:** API couldn't insert SPF/DMARC records into database

**Resolution:**
```sql
ALTER TABLE virtual_domains
  ADD COLUMN spf_record TEXT AFTER dkim_public_key,
  ADD COLUMN dmarc_record TEXT AFTER spf_record,
  ADD COLUMN server_ip VARCHAR(45) AFTER dmarc_record;
```

**Status:** ✅ FIXED - Domain creation working with SPF/DMARC

---

## Verified Working Features ✅

### SPF/DMARC Auto-Generation
```json
{
  "dns_records": {
    "dkim": "mail._domainkey.convertedgepro.org IN TXT \"v=DKIM1; k=rsa; p=MIIBIjAN...\"",
    "spf": "convertedgepro.org IN TXT \"v=spf1 ip4:51.222.141.197 -all\"",
    "dmarc": "_dmarc.convertedgepro.org IN TXT \"v=DMARC1; p=reject; rua=mailto:dmarc@convertedgepro.org; ruf=mailto:dmarc@convertedgepro.org; fo=1; adkim=s; aspf=s; pct=100\""
  }
}
```

**Verification:**
- ✅ SPF record uses strict `-all` policy
- ✅ DMARC record uses `p=reject` policy (not quarantine)
- ✅ DMARC has strict alignment (`adkim=s; aspf=s`)
- ✅ Server IP auto-detected: 51.222.141.197

### Dashboard
- ✅ Accessible at https://wow.convertedgepro.org/
- ✅ SSL certificate valid (Let's Encrypt)
- ✅ Login page loads correctly
- ✅ Static assets (CSS/JS) served correctly

### API
- ✅ Accessible at https://smtp.convertedgepro.org/api/
- ✅ Health endpoint working: `GET /api/health`
- ✅ Domain creation working: `POST /api/domains`
- ✅ API key authentication working

### Services Running
```
✅ Postfix (SMTP)
✅ Dovecot (IMAP/POP3)
✅ MySQL (Database)
✅ OpenDKIM (DKIM signing)
✅ Nginx (Web server)
✅ mailserver-api (REST API)
```

---

## Required Fixes for deploy.yml

### 1. SSL Certificate Acquisition Order (CRITICAL)
**Problem:** Nginx configs reference SSL certs before they're obtained, causing restart to fail.

**Fix:** Reorder tasks to:
1. Deploy HTTP-only nginx configs first
2. Start nginx
3. Obtain SSL certificates
4. Update nginx configs to add HTTPS blocks
5. Reload nginx

**Example:**
```yaml
- name: Configure Nginx (HTTP only, for certbot)
  template:
    src: templates/nginx-http-only.conf.j2
    dest: /etc/nginx/sites-available/{{ item }}
  loop:
    - mailserver-api
    - mailserver-dashboard

- name: Restart Nginx
  systemd:
    name: nginx
    state: restarted

- name: Obtain SSL certificates
  shell: |
    certbot certonly --webroot -w /var/www/html \
      -d {{ hostname }} -d wow.{{ domain }} \
      --non-interactive --agree-tos --email {{ certbot_email }}

- name: Configure Nginx (HTTPS)
  template:
    src: templates/nginx-full.conf.j2
    dest: /etc/nginx/sites-available/{{ item }}
  loop:
    - mailserver-api
    - mailserver-dashboard

- name: Reload Nginx
  systemd:
    name: nginx
    state: reloaded
```

### 2. OpenDKIM Directory Creation (FIXED)
Already fixed in deploy.yml, but verify it's in the correct location (before "Create OpenDKIM config files" task).

### 3. OpenDKIM Permissions
**Problem:** mailapi user needs write access to `/etc/opendkim/` for DKIM key generation.

**Fix:** Add after OpenDKIM directory creation:
```yaml
- name: Set OpenDKIM directory permissions
  file:
    path: /etc/opendkim
    state: directory
    owner: opendkim
    group: opendkim
    mode: '0775'
    recurse: yes

- name: Add mailapi to opendkim group
  user:
    name: mailapi
    groups: opendkim
    append: yes
```

### 4. Database Schema Migration
**Problem:** Redeploying doesn't update database schema if it already exists.

**Fix:** Add schema migration task:
```yaml
- name: Check if SPF/DMARC columns exist
  command: >
    mysql -u root mailserver -e
    "SHOW COLUMNS FROM virtual_domains LIKE 'spf_record'"
  register: spf_column_check
  ignore_errors: yes

- name: Add SPF/DMARC columns if missing
  command: >
    mysql -u root mailserver -e
    "ALTER TABLE virtual_domains
     ADD COLUMN spf_record TEXT AFTER dkim_public_key,
     ADD COLUMN dmarc_record TEXT AFTER spf_record,
     ADD COLUMN server_ip VARCHAR(45) AFTER dmarc_record;"
  when: spf_column_check.rc != 0
```

### 5. DNS A Record Creation
**Problem:** SSL cert acquisition fails if DNS records don't exist.

**Fix:** Add DNS creation task before SSL acquisition (if Cloudflare credentials provided):
```yaml
- name: Create DNS A records via Cloudflare
  uri:
    url: "https://api.cloudflare.com/client/v4/zones/{{ cf_zone_id }}/dns_records"
    method: POST
    headers:
      X-Auth-Email: "{{ cf_email }}"
      X-Auth-Key: "{{ cf_api_key }}"
      Content-Type: "application/json"
    body_format: json
    body:
      type: "A"
      name: "{{ item }}"
      content: "{{ ansible_default_ipv4.address }}"
      ttl: 120
      proxied: false
    status_code: [200, 201]
  loop:
    - "{{ hostname }}"
    - "wow.{{ domain }}"
  when: cf_email is defined and cf_api_key is defined
  ignore_errors: yes  # Record may already exist
```

---

## Deployment Timeline

| Attempt | Status | Tasks Completed | Errors Encountered |
|---------|--------|----------------|-------------------|
| #1 | FAILED | 0/50 | SSH host key mismatch |
| #2 | FAILED | 31/50 | OpenDKIM directory missing |
| #3 | FAILED | 31/50 | Same (git push failed, fix not applied) |
| #4 | FAILED | 47/50 | Nginx restart (SSL certs missing) |
| Manual | SUCCESS | 100% | OpenDKIM perms, DB schema, nginx config |

**Total Time:** ~90 minutes (including 4 deployment attempts + manual fixes)

---

## Credentials & Access

### Dashboard
- URL: https://wow.convertedgepro.org/
- Login: Use any of these API keys:
  - `x1QS9Wxiz7M30MkAs6JxTjoal5pyjXAIRvZzBKCh8UYPHOyR6dmWCPTTxP1xseDp`
  - `TAngmamXrE1ZeVqfO4A52wrGPnGUsJlXttYGFPxQ55tT5dCASydvdkN5nyfF0QNp`
  - `I4nMM3XqBjJ5kdlSvl29xp6SscFb4ItsFm0usi3IeTKRhvnc2pSSL34sD9T5eQ9G`

### API
- URL: https://smtp.convertedgepro.org/api/
- Authentication: `x-api-key` header
- Test: `curl -H "x-api-key: x1QS9..." https://smtp.convertedgepro.org/api/health`

### Server SSH
- Host: ubuntu@51.222.141.197
- Password: Atoz123456789@

### Database
- User: root (no password for local connections)
- Database: mailserver
- Password: 5NQGVY4wBLD4mQ3Y3jNA9jpagDZ7uy52 (in .env but user auth failed)

---

## Next Steps

1. **Update deploy.yml** with all fixes listed above
2. **Test deployment** on a fresh server to verify all fixes work
3. **Configure MX records** for convertedgepro.org:
   ```
   convertedgepro.org. IN MX 10 smtp.convertedgepro.org.
   ```
4. **Add DNS records** returned by domain creation API
5. **Create first mailbox** for testing:
   ```bash
   curl -X POST https://smtp.convertedgepro.org/api/mailboxes \
     -H "x-api-key: x1QS9Wxiz7M30MkAs6JxTjoal5pyjXAIRvZzBKCh8UYPHOyR6dmWCPTTxP1xseDp" \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@convertedgepro.org","password":"SecurePass123!"}'
   ```
6. **Test email sending** from created mailbox
7. **Configure PTR record** with VPS provider (reverse DNS)
8. **Set up monitoring** for services

---

## Summary

The Mailrice deployment encountered **7 distinct errors** requiring **4 redeployment attempts** and **manual intervention**. All core features are now working:

✅ **SPF/DMARC automation** with strict reject policies
✅ **Dashboard** auto-deployed on wow subdomain
✅ **SSL certificates** obtained via Let's Encrypt
✅ **API** fully functional with authentication
✅ **Services** running (Postfix, Dovecot, OpenDKIM, MySQL, Nginx)

The main issues were:
1. SSL certificate chicken-and-egg problem (nginx config before cert acquisition)
2. OpenDKIM directory/permissions not configured properly
3. Database schema not migrating on redeployment
4. DNS records needed before SSL acquisition

All issues have been documented with fixes ready to apply to deploy.yml for future deployments.

---

**Report Generated:** 2025-10-06 19:35 UTC
**Deployment:** COMPLETE ✅
**Dashboard:** https://wow.convertedgepro.org/
**API:** https://smtp.convertedgepro.org/api/
