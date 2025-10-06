# Mailrice Deployment Error Report

**Date:** 2025-10-06
**Target Server:** 51.222.141.197 (vps-760cacfa)
**Domain:** convertedgepro.org
**Hostname:** smtp.convertedgepro.org

---

## Deployment Summary

- **Status:** FAILED
- **Tasks Completed:** 31/32
- **Changes Made:** 26
- **Failed Tasks:** 1
- **Critical Error:** OpenDKIM configuration directory missing

---

## Errors Encountered

### ❌ ERROR #1: SSH Connection Failure (Initial)
**Occurred:** First deployment attempt
**Task:** Testing SSH connection
**Root Cause:** SSH host key mismatch in `~/.ssh/known_hosts`
**Error Message:**
```
WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED!
Password authentication is disabled to avoid man-in-the-middle attacks.
ubuntu@51.222.141.197: Permission denied (publickey,password).
```

**Resolution Applied:**
```bash
ssh-keygen -f "/home/ubuntu/.ssh/known_hosts" -R "51.222.141.197"
```

**Status:** ✅ FIXED

---

### ❌ ERROR #2: OpenDKIM Directory Missing (CRITICAL)
**Occurred:** Task 31/32
**Task:** "Create OpenDKIM config files if they don't exist"
**Location:** `deploy.yml` lines 292-304
**Root Cause:** `/etc/opendkim` directory doesn't exist after package installation

**Error Message:**
```
failed: [51.222.141.197] (item=/etc/opendkim/KeyTable) => {
  "msg": "Error, could not touch target: [Errno 2] No such file or directory: b'/etc/opendkim/KeyTable'",
  "path": "/etc/opendkim/KeyTable"
}
failed: [51.222.141.197] (item=/etc/opendkim/SigningTable) => {
  "msg": "Error, could not touch target: [Errno 2] No such file or directory: b'/etc/opendkim/SigningTable'",
  "path": "/etc/opendkim/SigningTable"
}
```

**Impact:**
- Deployment stops before Dashboard deployment
- No Dashboard created at wow.convertedgepro.org
- No SSL certificates obtained
- Services partially configured

**Files Affected:**
- `/etc/opendkim/KeyTable` - Not created
- `/etc/opendkim/SigningTable` - Not created

**Required Fix:**
Add task before "Create OpenDKIM config files" to create parent directory:

```yaml
- name: Create OpenDKIM keys directory
  file:
    path: /etc/opendkim/keys
    state: directory
    owner: opendkim
    group: opendkim
    mode: '0750'

- name: Create OpenDKIM base directory
  file:
    path: /etc/opendkim
    state: directory
    owner: opendkim
    group: opendkim
    mode: '0755'
```

**Status:** ❌ NOT FIXED - Needs code update

---

## Tasks That Succeeded ✅

1. ✅ Gathered server facts
2. ✅ Generated database password
3. ✅ Generated API keys (initial + master)
4. ✅ Updated apt cache
5. ✅ Installed packages (Postfix, Dovecot, MySQL, OpenDKIM, etc.)
6. ✅ Installed Node.js 20.x
7. ✅ Created vmail user/group
8. ✅ Created MySQL database and user
9. ✅ Imported database schema (with SPF/DMARC columns)
10. ✅ Inserted initial API key
11. ✅ Configured Postfix main.cf
12. ✅ Configured Postfix master.cf (submission/smtps ports)
13. ✅ Created Postfix MySQL lookup files
14. ✅ Configured Dovecot SQL authentication
15. ✅ Configured Dovecot maildir location
16. ✅ Enabled Dovecot SQL auth
17. ✅ Configured Dovecot LMTP/auth sockets
18. ✅ Created mailapi system user
19. ✅ Configured sudoers for mailapi
20. ✅ Created API directory `/opt/mailserver-api`
21. ✅ Copied server.js and package.json
22. ✅ Created .env file with SERVER_IP
23. ✅ Installed npm dependencies (express, mysql2, etc.)
24. ✅ Set API directory ownership
25. ✅ Restarted Postfix
26. ✅ Restarted Dovecot

---

## Tasks Not Executed ❌

Due to failure at task 31, the following tasks were never reached:

1. ❌ Ensure OpenDKIM config files are writable
2. ❌ Create systemd service for API
3. ❌ Create Dashboard directory
4. ❌ Copy Dashboard files (HTML, CSS, JS)
5. ❌ Configure Nginx for Dashboard (wow subdomain)
6. ❌ Configure Nginx for API reverse proxy
7. ❌ Remove default Nginx site
8. ❌ Obtain Let's Encrypt SSL for mail hostname
9. ❌ Obtain Let's Encrypt SSL for Dashboard (wow subdomain)
10. ❌ Update Postfix/Dovecot SSL certificates
11. ❌ Configure UFW firewall
12. ❌ Configure Fail2ban jails
13. ❌ Enable and start services
14. ❌ Create initial admin domain via API
15. ❌ Get DNS records for admin domain
16. ❌ Save credentials and DNS records files
17. ❌ Display completion message

---

## Server State After Failed Deployment

### ✅ What's Working:
- Postfix installed and configured (but not fully set up)
- Dovecot installed and configured
- MySQL database created with mailserver schema
- API files copied to `/opt/mailserver-api`
- npm dependencies installed

### ❌ What's Broken/Missing:
- OpenDKIM configuration incomplete
- No systemd service for API
- API not running
- Dashboard not deployed
- No Nginx configuration
- No SSL certificates
- No firewall rules
- No Fail2ban protection
- No admin domain created
- No DNS records generated

---

## Recommended Fix Priority

### 🔴 CRITICAL (Fix Immediately):
1. **Add OpenDKIM directory creation task** in deploy.yml before line 292
2. **Verify OpenDKIM package installation** creates expected structure

### 🟡 MEDIUM (Check After Fix):
3. Verify Dashboard deployment tasks execute properly
4. Verify SSL certificate acquisition works
5. Test DNS record generation via API

### 🟢 LOW (Polish):
6. Remove curl warning for Node.js installation (use get_url module)
7. Add better error handling for directory creation tasks

---

## Next Steps

1. **Update deploy.yml** to create `/etc/opendkim` directory
2. **Rerun deployment** on same server
3. **Test Dashboard** access at https://wow.convertedgepro.org
4. **Verify DNS records** were generated correctly
5. **Test email sending** functionality

---

## Files to Modify

### `/home/ubuntu/Mailrice/deploy.yml`

**Location:** After line 291 (before "Create OpenDKIM config files")

**Add:**
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

---

## Testing Checklist (After Fix)

- [ ] Deployment completes without errors
- [ ] All 50+ tasks execute successfully
- [ ] Dashboard accessible at https://wow.convertedgepro.org
- [ ] Login with API key works
- [ ] Dashboard displays server stats
- [ ] Can create domains via dashboard
- [ ] Can create mailboxes via dashboard
- [ ] DNS records (DKIM, SPF, DMARC) generated correctly
- [ ] SSL certificates obtained for both hostnames
- [ ] Services running (Postfix, Dovecot, OpenDKIM, API)
- [ ] Firewall configured properly
- [ ] Fail2ban active

---

## Additional Notes

- Server has Ubuntu (confirmed by vps-760cacfa hostname)
- All package installations succeeded (Postfix, Dovecot, MySQL, Node.js 20.x)
- Database schema includes new SPF/DMARC columns ✅
- API code includes new dashboard endpoints ✅
- Dashboard files ready to deploy ✅
- Problem is purely in the deployment script, not the code itself

---

**Report Generated:** 2025-10-06 19:25 UTC
**Next Action:** Fix deploy.yml and redeploy
