# Root API Security Fix - Implementation Plan

## Critical Vulnerabilities Identified

### 1. API Running as Root (Line 7 in mailserver-api.service.j2)
```ini
User=root  # ⚠️ CRITICAL SECURITY ISSUE
```
**Risk:** Any API compromise = full server control

### 2. Command Injection Vulnerabilities
**12 instances of dangerous shell command execution:**

```javascript
// Line 118 - Unsanitized domain variable
await execAsync(`sudo mkdir -p ${dkimDir}`);

// Line 122 - Domain variable in command
await execAsync(`sudo opendkim-genkey -b 2048 -d ${domain} -D ${dkimDir} -s ${selector} -v`);

// Line 343 - Email/domain variables in path
await execAsync(`sudo mkdir -p ${maildir}/{cur,new,tmp}`);

// Line 401 - User input in rm command
await execAsync(`sudo rm -rf /var/vmail/${domain}/${username}`);
```

**Attack Example:**
```bash
POST /domains
{
  "domain": "test.com; rm -rf /var/vmail; echo pwned"
}
# Executes: sudo mkdir -p /etc/opendkim/keys/test.com; rm -rf /var/vmail; echo pwned
```

### 3. No Input Validation
- Email addresses not validated
- Domain names not validated
- Paths not validated
- Allows directory traversal attacks

---

## Security Fix Strategy

### Approach 1: Remove Shell Commands Entirely (RECOMMENDED)
Replace all shell commands with native Node.js operations
- **Pros:** Eliminates command injection risk, better performance
- **Cons:** More code changes required
- **Time:** 1.5 hours

### Approach 2: Input Sanitization + Restricted User
Keep shell commands but sanitize all inputs + run as restricted user
- **Pros:** Minimal code changes
- **Cons:** Still has some risk, requires careful validation
- **Time:** 1 hour

**We'll use Approach 1 for maximum security**

---

## Implementation Plan

### Phase 1: Create Restricted User & Permissions (20 min)

#### Step 1.1: Create `mailapi` System User
```bash
# Create dedicated user for API
useradd --system --no-create-home --shell /bin/false mailapi

# Add to necessary groups
usermod -a -G vmail mailapi
```

#### Step 1.2: Set Up Directory Permissions
```bash
# /var/vmail - mail storage
chown -R vmail:vmail /var/vmail
chmod 2775 /var/vmail  # Group write + setgid

# /etc/opendkim/keys - DKIM keys
chown -R opendkim:opendkim /etc/opendkim/keys
chmod 755 /etc/opendkim/keys
# mailapi needs read access to DKIM keys
usermod -a -G opendkim mailapi

# /opt/mailserver-api - API code
chown -R mailapi:mailapi /opt/mailserver-api
chmod 755 /opt/mailserver-api
```

#### Step 1.3: Configure Sudoers (Minimal Privileges)
Only allow specific commands that absolutely need sudo:

```bash
# /etc/sudoers.d/mailapi
Defaults:mailapi !requiretty

# OpenDKIM operations (needed for key generation)
mailapi ALL=(root) NOPASSWD: /usr/sbin/opendkim-genkey
mailapi ALL=(root) NOPASSWD: /bin/systemctl reload opendkim

# That's it - no other sudo access!
```

### Phase 2: Refactor Code to Remove Shell Commands (1 hour)

#### Change 1: Replace Maildir Creation (server.js:343-344)
**Before:**
```javascript
const maildir = `/var/vmail/${domain}/${email.split('@')[0]}`;
await execAsync(`sudo mkdir -p ${maildir}/{cur,new,tmp}`);
await execAsync(`sudo chown -R vmail:vmail /var/vmail`);
```

**After:**
```javascript
const fs = require('fs').promises;
const path = require('path');

// Validate inputs first
const username = email.split('@')[0];
const maildir = path.join('/var/vmail', domain, username);

// Create directories using Node.js fs
await fs.mkdir(path.join(maildir, 'cur'), { recursive: true, mode: 0o700 });
await fs.mkdir(path.join(maildir, 'new'), { recursive: true, mode: 0o700 });
await fs.mkdir(path.join(maildir, 'tmp'), { recursive: true, mode: 0o700 });

// Change ownership to vmail:vmail
await fs.chown(maildir, vmail_uid, vmail_gid);
await fs.chown(path.join(maildir, 'cur'), vmail_uid, vmail_gid);
await fs.chown(path.join(maildir, 'new'), vmail_uid, vmail_gid);
await fs.chown(path.join(maildir, 'tmp'), vmail_uid, vmail_gid);
```

#### Change 2: Replace Maildir Deletion (server.js:401)
**Before:**
```javascript
await execAsync(`sudo rm -rf /var/vmail/${domain}/${username}`).catch(() => {});
```

**After:**
```javascript
const maildir = path.join('/var/vmail', domain, username);

// Validate path is within /var/vmail (prevent directory traversal)
const realPath = await fs.realpath(maildir).catch(() => null);
if (realPath && realPath.startsWith('/var/vmail/')) {
  await fs.rm(maildir, { recursive: true, force: true });
}
```

#### Change 3: Replace DKIM Key Reading (server.js:130-131)
**Before:**
```javascript
const { stdout: privateKey } = await execAsync(`sudo cat ${privateKeyPath}`);
const { stdout: publicKeyRaw } = await execAsync(`sudo cat ${txtPath}`);
```

**After:**
```javascript
// mailapi user is in opendkim group, can read files directly
const privateKey = await fs.readFile(privateKeyPath, 'utf8');
const publicKeyRaw = await fs.readFile(txtPath, 'utf8');
```

#### Change 4: DKIM Key Generation (Keep sudo, but sanitize)
**Before:**
```javascript
await execAsync(`sudo mkdir -p ${dkimDir}`);
await execAsync(`sudo opendkim-genkey -b 2048 -d ${domain} -D ${dkimDir} -s ${selector} -v`);
```

**After:**
```javascript
// Validate domain name first
if (!isValidDomain(domain)) {
  throw new Error('Invalid domain name');
}

// Create directory with fs
await fs.mkdir(dkimDir, { recursive: true, mode: 0o755 });

// Use sudo only for opendkim-genkey (allowed in sudoers)
// Sanitize inputs by using shell escaping
const { spawn } = require('child_process');
await spawnAsync('sudo', [
  'opendkim-genkey',
  '-b', '2048',
  '-d', domain,  // Passed as separate argument (no injection)
  '-D', dkimDir,
  '-s', selector,
  '-v'
]);
```

#### Change 5: Replace DKIM File Deletion (server.js:244)
**Before:**
```javascript
await execAsync(`sudo rm -rf /etc/opendkim/keys/${req.params.domain}`).catch(() => {});
```

**After:**
```javascript
const dkimDir = path.join('/etc/opendkim/keys', req.params.domain);

// Validate path
const realPath = await fs.realpath(dkimDir).catch(() => null);
if (realPath && realPath.startsWith('/etc/opendkim/keys/')) {
  await fs.rm(dkimDir, { recursive: true, force: true });
}
```

#### Change 6: Replace OpenDKIM Config Updates (server.js:138-143)
**Before:**
```javascript
await execAsync(
  `echo "${selector}._domainkey.${domain} ${domain}:${selector}:${privateKeyPath}" | sudo tee -a /etc/opendkim/KeyTable`
);
await execAsync(
  `echo "*@${domain} ${selector}._domainkey.${domain}" | sudo tee -a /etc/opendkim/SigningTable`
);
```

**After:**
```javascript
// Append to files using Node.js fs
const keyTableEntry = `${selector}._domainkey.${domain} ${domain}:${selector}:${privateKeyPath}\n`;
const signingTableEntry = `*@${domain} ${selector}._domainkey.${domain}\n`;

await fs.appendFile('/etc/opendkim/KeyTable', keyTableEntry);
await fs.appendFile('/etc/opendkim/SigningTable', signingTableEntry);
```

#### Change 7: SystemCTL Reload (Keep sudo, allowed in sudoers)
**Before:**
```javascript
await execAsync('sudo systemctl reload opendkim');
```

**After:**
```javascript
// Use spawn instead of shell
await spawnAsync('sudo', ['systemctl', 'reload', 'opendkim']);
```

### Phase 3: Add Input Validation (20 min)

#### Add Validation Helper Functions

```javascript
// Email validation (RFC 5322 compliant)
function isValidEmail(email) {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email) && email.length <= 254;
}

// Domain validation (RFC 1035)
function isValidDomain(domain) {
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return domainRegex.test(domain) && domain.length <= 253;
}

// Path validation (prevent directory traversal)
function isValidPath(basePath, targetPath) {
  const normalized = path.normalize(targetPath);
  return normalized.startsWith(basePath) && !normalized.includes('..');
}

// DKIM selector validation
function isValidSelector(selector) {
  const selectorRegex = /^[a-zA-Z0-9._-]+$/;
  return selectorRegex.test(selector) && selector.length <= 63;
}
```

#### Apply Validation to All Endpoints

```javascript
// Domain creation
app.post('/domains', strictLimiter, async (req, res) => {
  const { domain, dkim_selector = 'mail' } = req.body;

  // Validate inputs
  if (!domain || !isValidDomain(domain)) {
    return res.status(400).json({ error: 'Invalid domain name' });
  }

  if (!isValidSelector(dkim_selector)) {
    return res.status(400).json({ error: 'Invalid DKIM selector' });
  }

  // ... rest of code
});

// Mailbox creation
app.post('/mailboxes', strictLimiter, async (req, res) => {
  const { email, password, quota_mb = 1000 } = req.body;

  // Validate email
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Validate password strength
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  // Validate quota
  if (typeof quota_mb !== 'number' || quota_mb < 1 || quota_mb > 100000) {
    return res.status(400).json({ error: 'Invalid quota (1-100000 MB)' });
  }

  // ... rest of code
});
```

### Phase 4: Update Helper Functions (10 min)

#### Replace execAsync with spawnAsync
```javascript
// Helper to run commands without shell injection
function spawnAsync(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => stdout += data);
    proc.stderr.on('data', (data) => stderr += data);

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', reject);
  });
}
```

#### Update Password Generation to Use Spawn
```javascript
function generateSHA512Password(password) {
  return new Promise((resolve, reject) => {
    // Use spawn to avoid shell injection
    const proc = spawn('doveadm', ['pw', '-s', 'SHA512-CRYPT', '-p', password], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => stdout += data);
    proc.stderr.on('data', (data) => stderr += data);

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Password generation failed: ${stderr}`));
      }
    });

    proc.on('error', reject);
  });
}
```

### Phase 5: Update Systemd Service (5 min)

#### Update mailserver-api.service.j2
```ini
[Unit]
Description=Mail Server REST API
After=network.target mysql.service

[Service]
Type=simple
User=mailapi
Group=mailapi
WorkingDirectory=/opt/mailserver-api
ExecStart=/usr/bin/node /opt/mailserver-api/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/vmail /etc/opendkim
ReadOnlyPaths=/etc/postfix /etc/dovecot

[Install]
WantedBy=multi-user.target
```

### Phase 6: Update Ansible Deployment (20 min)

#### Add tasks to deploy.yml

```yaml
# Create mailapi user
- name: Create mailapi system user
  user:
    name: mailapi
    system: yes
    create_home: no
    shell: /bin/false
    groups:
      - vmail
      - opendkim
    append: yes

# Set up directory permissions
- name: Set /var/vmail permissions
  file:
    path: /var/vmail
    owner: vmail
    group: vmail
    mode: '2775'
    state: directory

- name: Set /etc/opendkim/keys permissions
  file:
    path: /etc/opendkim/keys
    owner: opendkim
    group: opendkim
    mode: '0755'
    state: directory

- name: Set API directory ownership
  file:
    path: /opt/mailserver-api
    owner: mailapi
    group: mailapi
    mode: '0755'
    state: directory
    recurse: yes

# Configure sudoers
- name: Create sudoers file for mailapi
  copy:
    dest: /etc/sudoers.d/mailapi
    content: |
      Defaults:mailapi !requiretty
      mailapi ALL=(root) NOPASSWD: /usr/sbin/opendkim-genkey
      mailapi ALL=(root) NOPASSWD: /bin/systemctl reload opendkim
    mode: '0440'
    validate: 'visudo -cf %s'

# Update environment variables
- name: Add vmail UID/GID to .env
  lineinfile:
    path: /opt/mailserver-api/.env
    line: "{{ item }}"
  loop:
    - "VMAIL_UID=5000"
    - "VMAIL_GID=5000"
```

### Phase 7: Update Environment Config (5 min)

#### Add to .env.j2
```bash
# System user IDs
VMAIL_UID={{ vmail_uid }}
VMAIL_GID={{ vmail_gid }}
```

#### Load in server.js
```javascript
const VMAIL_UID = parseInt(process.env.VMAIL_UID) || 5000;
const VMAIL_GID = parseInt(process.env.VMAIL_GID) || 5000;
```

---

## Testing Plan

### Security Tests

1. **Command Injection Test**
```bash
# Try to inject commands via domain name
curl -X POST http://localhost:3000/domains \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain": "test.com; rm -rf /tmp/test"}'

# Should return 400 "Invalid domain name"
```

2. **Directory Traversal Test**
```bash
# Try to create mailbox outside /var/vmail
curl -X POST http://localhost:3000/mailboxes \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "../../../etc/passwd@evil.com", "password": "test123"}'

# Should return 400 "Invalid email address"
```

3. **Privilege Escalation Test**
```bash
# Verify API cannot access root-only files
sudo -u mailapi cat /etc/shadow
# Should fail with "Permission denied"

# Verify API can only run allowed sudo commands
sudo -u mailapi sudo systemctl restart mysql
# Should fail with "not allowed to run"
```

### Functional Tests

1. **Create Domain Test**
```bash
curl -X POST http://localhost:3000/domains \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain": "test.com"}'

# Should succeed and generate DKIM keys
```

2. **Create Mailbox Test**
```bash
curl -X POST http://localhost:3000/mailboxes \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email": "user@test.com", "password": "SecurePass123"}'

# Should create mailbox and maildir
ls -la /var/vmail/test.com/user/
# Should show cur, new, tmp directories owned by vmail
```

3. **Delete Mailbox Test**
```bash
curl -X DELETE http://localhost:3000/mailboxes/user@test.com \
  -H "x-api-key: $API_KEY"

# Should delete maildir
ls /var/vmail/test.com/user/
# Should not exist
```

---

## Rollback Plan

If issues arise after deployment:

### Quick Rollback (Emergency)
```bash
# Revert to root user
sudo systemctl stop mailserver-api
sudo sed -i 's/User=mailapi/User=root/' /etc/systemd/system/mailserver-api.service
sudo systemctl daemon-reload
sudo systemctl start mailserver-api
```

### Full Rollback (via Git)
```bash
cd /tmp/mailrice
git revert <commit-hash>
git push origin main
# Redeploy with Ansible
```

---

## Success Criteria

- [ ] API runs as `mailapi` user (not root)
- [ ] All shell commands replaced with Node.js native functions
- [ ] Input validation on all user inputs
- [ ] No command injection vulnerabilities
- [ ] Directory traversal attacks prevented
- [ ] Minimal sudo privileges (only 2 commands allowed)
- [ ] All functional tests pass
- [ ] Security tests confirm vulnerabilities are fixed
- [ ] Ansible deployment updated and tested
- [ ] Documentation updated

---

## Files to Modify

1. `templates/server.js` - Main security refactoring
2. `templates/mailserver-api.service.j2` - Change user from root to mailapi
3. `templates/.env.j2` - Add VMAIL_UID/VMAIL_GID
4. `deploy.yml` - Add user creation, permissions, sudoers
5. `README.md` - Update security documentation

---

## Implementation Time Estimate

| Phase | Task | Time |
|-------|------|------|
| 1 | Create user & permissions | 20 min |
| 2 | Refactor shell commands | 60 min |
| 3 | Add input validation | 20 min |
| 4 | Update helper functions | 10 min |
| 5 | Update systemd service | 5 min |
| 6 | Update Ansible | 20 min |
| 7 | Update environment | 5 min |
| **Total** | **Core Implementation** | **2 hours 20 min** |
| Testing | Security & functional tests | 30 min |
| Documentation | Update docs | 10 min |
| **Grand Total** | | **3 hours** |

---

## Ready to Implement?

**Shall I proceed with the implementation?**

I'll start by refactoring the code, then we can test it thoroughly before pushing to the repository.
