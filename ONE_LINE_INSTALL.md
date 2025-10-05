# One-Line Mail Server Installation

Deploy a complete mail server with a single command - no manual setup required!

## 🚀 Quick Install

### Method 1: Auto DNS + Email Notification (Recommended - Ultimate Zero Configuration!)

**With Cloudflare DNS automation AND email notification - truly hands-free deployment:**

```bash
curl -fsSL https://raw.githubusercontent.com/Ayushjain101/mailserver-deployment/main/deploy.sh | bash -s -- \
  SERVER_IP SSH_USER SSH_PASSWORD DOMAIN HOSTNAME DB_PASSWORD CF_EMAIL CF_API_KEY CF_ZONE_ID EMAIL_RECIPIENT
```

**Example:**
```bash
curl -fsSL https://raw.githubusercontent.com/Ayushjain101/mailserver-deployment/main/deploy.sh | bash -s -- \
  144.217.165.40 ubuntu MyPassword123 example.com mail.example.com '' \
  you@email.com your_cloudflare_global_api_key your_zone_id you@email.com
```

**What it does automatically:**
- ✅ Installs all dependencies (Git, Ansible, sshpass)
- ✅ Deploys complete mail server
- ✅ Generates production API key
- ✅ Adds domain and generates DKIM
- ✅ **Creates all DNS records automatically** (A, MX, SPF, DKIM, DMARC)
- ✅ **Emails you complete documentation with all credentials and setup details**
- ✅ Returns API key and ready-to-use setup

---

### Method 2: Auto DNS Only (No Email Notification)

**With Cloudflare DNS automation - no manual DNS setup required:**

```bash
curl -fsSL https://raw.githubusercontent.com/Ayushjain101/mailserver-deployment/main/deploy.sh | bash -s -- \
  SERVER_IP SSH_USER SSH_PASSWORD DOMAIN HOSTNAME DB_PASSWORD CF_EMAIL CF_API_KEY CF_ZONE_ID
```

**Example:**
```bash
curl -fsSL https://raw.githubusercontent.com/Ayushjain101/mailserver-deployment/main/deploy.sh | bash -s -- \
  144.217.165.40 ubuntu MyPassword123 example.com mail.example.com '' \
  you@email.com your_cloudflare_global_api_key your_zone_id
```

---

### Method 3: Manual DNS (Basic Install)

**Without DNS automation - you configure DNS manually:**

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

### Method 4: Clone & Deploy

```bash
git clone https://github.com/Ayushjain101/mailserver-deployment.git && \
cd mailserver-deployment && \
./deploy.sh SERVER_IP SSH_USER SSH_PASSWORD DOMAIN HOSTNAME DB_PASSWORD CF_EMAIL CF_API_KEY CF_ZONE_ID
```

**Example (with auto DNS):**
```bash
git clone https://github.com/Ayushjain101/mailserver-deployment.git && \
cd mailserver-deployment && \
./deploy.sh 144.217.165.40 ubuntu MyPassword123 example.com mail.example.com '' \
  you@email.com cf_api_key zone_id
```

---

## 📋 Parameters

| Parameter | Description | Example | Required |
|-----------|-------------|---------|----------|
| SERVER_IP | Target server IP address | `144.217.165.40` | Yes |
| SSH_USER | SSH username | `ubuntu` or `root` | Yes |
| SSH_PASSWORD | SSH password | `MyPassword123` | Yes |
| DOMAIN | Your domain name | `example.com` | Yes |
| HOSTNAME | Mail server hostname | `mail.example.com` | Yes |
| DB_PASSWORD | Database password (use '' to auto-generate) | `SecureDB2024` or `''` | Optional |
| CF_EMAIL | Cloudflare account email (for auto DNS) | `you@email.com` | Optional |
| CF_API_KEY | Cloudflare Global API Key (for auto DNS) | `your_api_key` | Optional |
| CF_ZONE_ID | Cloudflare Zone ID (for auto DNS) | `zone_id` | Optional |
| EMAIL_RECIPIENT | Email address to receive deployment docs | `you@email.com` | Optional |

**Notes:**
- If all three Cloudflare parameters (CF_EMAIL, CF_API_KEY, CF_ZONE_ID) are provided, DNS will be configured automatically!
- If EMAIL_RECIPIENT is provided, you'll receive a comprehensive deployment documentation email with all credentials and setup details!

---

## 🔑 Getting Cloudflare Credentials (For Auto DNS)

### 1. Get your Cloudflare Email
- This is the email you use to log into Cloudflare

### 2. Get your Global API Key
1. Log into Cloudflare Dashboard
2. Click on your profile (top right)
3. Go to **My Profile** → **API Tokens**
4. Scroll to **Global API Key** and click "View"
5. Copy the key

### 3. Get your Zone ID
1. Go to your domain in Cloudflare
2. Scroll down on the Overview page
3. Find **Zone ID** in the right sidebar (under API section)
4. Copy the Zone ID

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

### Example 1: With Auto DNS + Email Notification (Ultimate Zero Configuration!)

**Step 1: Run One-Line Install**
```bash
curl -fsSL https://raw.githubusercontent.com/Ayushjain101/mailserver-deployment/main/deploy.sh | bash -s -- \
  15.204.242.87 ubuntu MyPassword mycompany.com mail.mycompany.com '' \
  you@email.com cf_global_api_key cf_zone_id you@email.com
```

**Output:**
```
========================================
  Mail Server Auto-Deploy
========================================
✓ Cloudflare credentials detected - DNS will be configured automatically!
✓ Detected: macOS
✓ Git already installed
✓ Ansible already installed
✓ sshpass already installed
✓ Repository cloned
✓ SSH connection successful

========================================
  Starting Mail Server Deployment
========================================
[Deployment runs...]

✓ Deployment Successful!

Configuring DNS automatically via Cloudflare...
1. Generating API key...
✓ API key generated

2. Adding domain to mail server...
✓ Domain added, DKIM key generated

3. Creating DNS records in Cloudflare...
   ✓ A record created
   ✓ MX record created
   ✓ SPF record created
   ✓ DKIM record created
   ✓ DMARC record created

✓ DNS configuration completed!

What was configured:
  ✓ A Record:    mail.mycompany.com → 15.204.242.87
  ✓ MX Record:   mycompany.com → mail.mycompany.com
  ✓ SPF Record:  mycompany.com
  ✓ DKIM Record: mail._domainkey.mycompany.com
  ✓ DMARC Record: _dmarc.mycompany.com

API Details:
  URL:     http://mail.mycompany.com/api
  API Key: abc123xyz...

Your mail server is ready with DNS configured! 🚀

Sending deployment documentation via email...
Creating email message...
Sending email to you@email.com...
✓ Deployment documentation sent to you@email.com
  (Note: Email may take a few minutes to arrive)
```

**Step 2: Check your email inbox**

You'll receive a comprehensive email with:
- Complete deployment details
- API key and endpoints
- DNS configuration summary
- Email client setup instructions
- Full API documentation
- Next steps and support links

**Step 3: Create your first mailbox**
```bash
curl -X POST http://mail.mycompany.com/api/mailboxes \
  -H "x-api-key: abc123xyz..." \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@mycompany.com","password":"SecurePass123"}'
```

**That's it! Your mail server is fully configured and ready to use!**

---

### Example 2: Without Auto DNS (Manual Configuration)

**Step 1: Run One-Line Install**
```bash
curl -fsSL https://raw.githubusercontent.com/Ayushjain101/mailserver-deployment/main/deploy.sh | bash -s -- \
  15.204.242.87 ubuntu MyPassword mycompany.com mail.mycompany.com
```

**Step 2: Configure DNS**

Add these records in your DNS provider:

**A Record:**
```
mail.mycompany.com → 15.204.242.87
```

**MX Record:**
```
mycompany.com → mail.mycompany.com (Priority: 10)
```

**Step 3: Generate API Key**

```bash
curl -X POST http://mail.mycompany.com/api/api-keys \
  -H "x-api-key: default_key_change_me" \
  -H "Content-Type: application/json" \
  -d '{"description":"Production"}'
```

**Save the returned API key!**

**Step 4: Add Domain**

```bash
curl -X POST http://mail.mycompany.com/api/domains \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain":"mycompany.com"}'
```

Add the DKIM record from the response to your DNS.

**Step 5: Create Mailbox**

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
