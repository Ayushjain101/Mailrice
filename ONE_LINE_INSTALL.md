# One-Line Mail Server Installation

Deploy a complete mail server with a single command - no manual setup required!

## 🚀 Quick Install

### Method 1: Direct Download & Deploy

```bash
curl -fsSL https://raw.githubusercontent.com/Ayushjain101/mailserver-deployment/main/deploy.sh | bash -s -- \
  SERVER_IP SSH_USER SSH_PASSWORD DOMAIN HOSTNAME
```

**Example:**
```bash
curl -fsSL https://raw.githubusercontent.com/Ayushjain101/mailserver-deployment/main/deploy.sh | bash -s -- \
  144.217.165.40 ubuntu MyPassword123 example.com mail.example.com
```

---

### Method 2: Clone & Deploy

```bash
git clone https://github.com/Ayushjain101/mailserver-deployment.git && \
cd mailserver-deployment && \
./deploy.sh SERVER_IP SSH_USER SSH_PASSWORD DOMAIN HOSTNAME
```

**Example:**
```bash
git clone https://github.com/Ayushjain101/mailserver-deployment.git && \
cd mailserver-deployment && \
./deploy.sh 144.217.165.40 ubuntu MyPassword123 example.com mail.example.com
```

---

## 📋 Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| SERVER_IP | Target server IP address | `144.217.165.40` |
| SSH_USER | SSH username | `ubuntu` or `root` |
| SSH_PASSWORD | SSH password | `MyPassword123` |
| DOMAIN | Your domain name | `example.com` |
| HOSTNAME | Mail server hostname | `mail.example.com` |
| DB_PASSWORD | Database password (optional) | `SecureDB2024` |

---

## ✨ What It Does Automatically

The script automatically:

1. **Detects Your OS** (macOS, Linux, or WSL)
2. **Installs Dependencies:**
   - Git (if missing)
   - Ansible (if missing)
   - sshpass (if missing)
3. **Tests SSH Connection** to your server
4. **Deploys Complete Mail Server:**
   - Postfix (SMTP)
   - Dovecot (IMAP/POP3)
   - MySQL (Database)
   - Nginx (Reverse Proxy)
   - REST API (Automation)
5. **Configures All Services**

---

## 🖥️ Supported Platforms

**Control Machine (where you run the command):**
- ✅ macOS (Intel & Apple Silicon)
- ✅ Linux (Ubuntu, Debian, Fedora, etc.)
- ✅ WSL (Windows Subsystem for Linux)

**Target Server:**
- ✅ Ubuntu 20.04
- ✅ Ubuntu 22.04
- ✅ Debian 10/11

---

## 📝 Complete Example

### Step 1: Run One-Line Install
```bash
curl -fsSL https://raw.githubusercontent.com/Ayushjain101/mailserver-deployment/main/deploy.sh | bash -s -- \
  15.204.242.87 ubuntu Atoz123456789@ mycompany.com mail.mycompany.com
```

**Output:**
```
========================================
  Mail Server Auto-Deploy
========================================
✓ Detected: macOS
✓ Git already installed
✓ Ansible already installed
✓ sshpass already installed
✓ Repository cloned
✓ SSH connection successful

========================================
  Starting Mail Server Deployment
========================================
Configuration:
  Server IP:  15.204.242.87
  Domain:     mycompany.com
  Hostname:   mail.mycompany.com

[Deployment runs...]

✓ Deployment Successful!
```

### Step 2: Configure DNS

Add these records in your DNS provider:

**A Record:**
```
mail.mycompany.com → 15.204.242.87
```

**MX Record:**
```
mycompany.com → mail.mycompany.com (Priority: 10)
```

### Step 3: Generate API Key

```bash
curl -X POST http://mail.mycompany.com/api/api-keys \
  -H "x-api-key: default_key_change_me" \
  -H "Content-Type: application/json" \
  -d '{"description":"Production"}'
```

**Save the returned API key!**

### Step 4: Add Domain

```bash
curl -X POST http://mail.mycompany.com/api/domains \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain":"mycompany.com"}'
```

Add the DKIM record from the response to your DNS.

### Step 5: Create Mailbox

```bash
curl -X POST http://mail.mycompany.com/api/mailboxes \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mycompany.com","password":"SecurePass123"}'
```

---

## 🔧 Advanced Options

### With Custom Database Password

```bash
./deploy.sh 1.2.3.4 ubuntu password example.com mail.example.com MySecureDB2024
```

### Update Existing Deployment

The script automatically updates if the repository already exists:

```bash
./deploy.sh NEW_IP ubuntu password newdomain.com mail.newdomain.com
```

---

## 🛠️ Troubleshooting

### Script fails with "permission denied"

Make it executable:
```bash
chmod +x deploy.sh
./deploy.sh ...
```

### SSH connection fails

Verify:
1. Server IP is correct
2. SSH user exists (usually `ubuntu` or `root`)
3. SSH password is correct
4. Port 22 is open on the server

### Ansible not installing on macOS

Install Homebrew first:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then run the deploy script again.

---

## 📊 Deployment Time

| Step | Time |
|------|------|
| Dependency check/install | 1-2 min |
| Repository clone | 5 sec |
| SSH connection test | 5 sec |
| Mail server deployment | 5-8 min |
| **Total** | **~7-10 min** |

---

## 🎯 What You Get

After deployment:

✅ **Complete Mail Server:**
- SMTP (sending on ports 25, 587, 465)
- IMAP (receiving on ports 143, 993)
- POP3 (receiving on ports 110, 995)
- REST API on port 80 (via Nginx)

✅ **API Access:**
- Full REST API for automation
- Domain management
- Mailbox management
- DKIM key generation

✅ **Production Ready:**
- Nginx reverse proxy
- SSL/TLS ready
- Multi-domain support
- IP rotation capable

✅ **Documentation:**
- Complete API docs
- Email client settings
- Troubleshooting guide

---

## 🔗 Links

- **GitHub:** https://github.com/Ayushjain101/mailserver-deployment
- **Full Documentation:** [README.md](README.md)
- **API Examples:** [USAGE_EXAMPLES.md](USAGE_EXAMPLES.md)
- **Quick Start:** [QUICK_START.md](QUICK_START.md)

---

## 🆘 Support

If you encounter issues:

1. Check the error output from the script
2. Review deployment logs: `journalctl -u mailserver-api`
3. Open an issue on GitHub with full error output

---

**Deploy your mail server in one command! 🚀**
