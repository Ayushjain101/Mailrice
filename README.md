# Mail Server Deployment Package

Complete mail server solution with Postfix, Dovecot, MySQL, and REST API for automation.

## 🚀 One-Line Installation (Recommended)

Deploy a complete mail server with a single command - **no manual setup required!**

### Basic Installation
```bash
curl -fsSL https://raw.githubusercontent.com/Ayushjain101/mailserver-deployment/main/deploy.sh | bash -s -- \
  SERVER_IP SSH_USER SSH_PASSWORD DOMAIN HOSTNAME
```

### With Auto DNS (Cloudflare) - Zero Configuration!
```bash
curl -fsSL https://raw.githubusercontent.com/Ayushjain101/mailserver-deployment/main/deploy.sh | bash -s -- \
  SERVER_IP SSH_USER SSH_PASSWORD DOMAIN HOSTNAME DB_PASSWORD CF_EMAIL CF_API_KEY CF_ZONE_ID
```

**Example:**
```bash
curl -fsSL https://raw.githubusercontent.com/Ayushjain101/mailserver-deployment/main/deploy.sh | bash -s -- \
  144.217.165.40 ubuntu MyPassword example.com mail.example.com '' \
  you@email.com your_cf_api_key your_zone_id
```

**What it does:**
- ✅ Auto-detects your OS (macOS/Linux/WSL)
- ✅ Auto-installs all dependencies (Git, Ansible, sshpass)
- ✅ Deploys complete mail server in 7-10 minutes
- ✅ **Auto-configures DNS via Cloudflare** (when credentials provided)
- ✅ Generates API key and adds domain automatically
- ✅ Works on any provider (AWS, DigitalOcean, OVH, etc.)

📖 **[Full One-Line Install Guide](ONE_LINE_INSTALL.md)**

---

## Features

- **Postfix** - SMTP server for sending/receiving emails
- **Dovecot** - IMAP/POP3 server for mailbox access
- **MySQL** - Virtual domains and users database
- **REST API** - Node.js API for domain/mailbox automation
- **DKIM Support** - Email authentication (OpenDKIM)
- **Multi-domain** - Support for multiple domains on one server
- **IP Rotation Ready** - Native installation supports GRE tunnels

## Quick Start

### Option 1: Ansible Deployment (Recommended)

**Prerequisites:**
- Ubuntu 20.04/22.04 server
- Ansible installed on your local machine
- Root/sudo access to target server

**Steps:**

1. Clone this deployment package to your local machine

2. Create inventory file:
```bash
cat > inventory << EOF
[mailserver]
your-server-ip ansible_user=root
EOF
```

3. Run the playbook:
```bash
ansible-playbook -i inventory deploy.yml \
  --extra-vars "domain=yourdomain.com hostname=mail.yourdomain.com db_password=YourSecurePassword"
```

**Variables:**
- `domain` - Your primary domain (required)
- `hostname` - Mail server hostname (required)
- `db_password` - MySQL database password (optional, auto-generated if not provided)
- `api_port` - API port (default: 3000)
- `vmail_uid` - Virtual mail user UID (default: 5000)
- `vmail_gid` - Virtual mail user GID (default: 5000)

### Option 2: Shell Script Installation

**Steps:**

1. Copy the entire deployment package to your server:
```bash
scp -r mailserver-deployment/ root@your-server:/tmp/
```

2. SSH to your server:
```bash
ssh root@your-server
```

3. Run the installation script:
```bash
cd /tmp/mailserver-deployment/scripts
sudo ./install.sh yourdomain.com mail.yourdomain.com YourDBPassword
```

Or run interactively:
```bash
sudo ./install.sh
```

The script will prompt for:
- Domain name
- Hostname
- Database password

## Post-Installation

### 1. Generate API Key

The default API key is `default_key_change_me`. Generate a secure one:

```bash
curl -X POST http://mail.yourdomain.com/api/api-keys \
  -H "x-api-key: default_key_change_me" \
  -H "Content-Type: application/json" \
  -d '{"description":"Production Key"}'
```

Save the returned API key securely.

### 2. Add Your Domain

```bash
curl -X POST http://mail.yourdomain.com/api/domains \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain":"yourdomain.com"}'
```

This will return DKIM DNS record information.

### 3. Configure DNS Records

Add these DNS records in your DNS provider (Cloudflare, Route53, etc.):

**A Record:**
```
mail.yourdomain.com → YOUR_SERVER_IP
```

**MX Record:**
```
yourdomain.com → mail.yourdomain.com (Priority: 10)
```

**SPF Record (TXT):**
```
yourdomain.com → v=spf1 ip4:YOUR_SERVER_IP a:mail.yourdomain.com ~all
```

**DKIM Record (TXT):**
```
mail._domainkey.yourdomain.com → v=DKIM1; k=rsa; p=YOUR_PUBLIC_KEY
```
*(Get the public key from the domain creation response)*

**DMARC Record (TXT):**
```
_dmarc.yourdomain.com → v=DMARC1; p=quarantine; rua=mailto:postmaster@yourdomain.com
```

### 4. Create Mailboxes

```bash
curl -X POST http://mail.yourdomain.com/api/mailboxes \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"user@yourdomain.com","password":"SecurePassword123","quota_mb":1000}'
```

## API Documentation

### Authentication

All API requests require the `x-api-key` header:
```
x-api-key: YOUR_API_KEY
```

### Endpoints

#### Health Check
```bash
GET /health
```

#### Domain Management

**List all domains:**
```bash
GET /domains
```

**Get specific domain:**
```bash
GET /domains/:domain
```

**Add domain:**
```bash
POST /domains
Content-Type: application/json

{
  "domain": "example.com",
  "dkim_selector": "mail"  # optional, defaults to "mail"
}
```

**Delete domain:**
```bash
DELETE /domains/:domain
```

**Get DKIM record:**
```bash
GET /domains/:domain/dkim
```

#### Mailbox Management

**List all mailboxes:**
```bash
GET /mailboxes
```

**Get specific mailbox:**
```bash
GET /mailboxes/:email
```

**Create mailbox:**
```bash
POST /mailboxes
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "quota_mb": 1000  # optional, defaults to 1000
}
```

**Update password:**
```bash
PUT /mailboxes/:email/password
Content-Type: application/json

{
  "password": "NewSecurePassword"
}
```

**Delete mailbox:**
```bash
DELETE /mailboxes/:email
```

#### API Key Management

**Generate new API key:**
```bash
POST /api-keys
Content-Type: application/json

{
  "description": "Production API Key"
}
```

## Email Client Configuration

### SMTP (Sending)
- **Server:** mail.yourdomain.com or YOUR_SERVER_IP
- **Port:** 587 (STARTTLS) or 465 (SSL) or 25
- **Username:** user@yourdomain.com
- **Password:** Your mailbox password
- **Authentication:** Required
- **Encryption:** STARTTLS (port 587) or SSL/TLS (port 465)

### IMAP (Receiving)
- **Server:** mail.yourdomain.com or YOUR_SERVER_IP
- **Port:** 143 (STARTTLS) or 993 (SSL)
- **Username:** user@yourdomain.com
- **Password:** Your mailbox password
- **Encryption:** STARTTLS or SSL/TLS

### POP3 (Alternative)
- **Server:** mail.yourdomain.com or YOUR_SERVER_IP
- **Port:** 110 (STARTTLS) or 995 (SSL)
- **Username:** user@yourdomain.com
- **Password:** Your mailbox password

## Service Management

### Check Service Status
```bash
sudo systemctl status postfix
sudo systemctl status dovecot
sudo systemctl status mailserver-api
```

### Restart Services
```bash
sudo systemctl restart postfix
sudo systemctl restart dovecot
sudo systemctl restart mailserver-api
```

### View Logs
```bash
# Mail logs
sudo tail -f /var/log/mail.log

# Postfix logs
sudo journalctl -u postfix -f

# Dovecot logs
sudo journalctl -u dovecot -f

# API logs
sudo journalctl -u mailserver-api -f
```

## Database Access

```bash
sudo mysql mailserver

# View domains
SELECT * FROM virtual_domains;

# View mailboxes
SELECT * FROM virtual_users;

# View API keys
SELECT * FROM api_keys;
```

## Security Hardening

### 1. Install SSL/TLS Certificates

Using Let's Encrypt:
```bash
sudo apt-get install certbot
sudo certbot certonly --standalone -d mail.yourdomain.com

# Update Postfix
sudo postconf -e "smtpd_tls_cert_file=/etc/letsencrypt/live/mail.yourdomain.com/fullchain.pem"
sudo postconf -e "smtpd_tls_key_file=/etc/letsencrypt/live/mail.yourdomain.com/privkey.pem"

# Update Dovecot
sudo sed -i 's|ssl_cert = .*|ssl_cert = </etc/letsencrypt/live/mail.yourdomain.com/fullchain.pem|' /etc/dovecot/conf.d/10-ssl.conf
sudo sed -i 's|ssl_key = .*|ssl_key = </etc/letsencrypt/live/mail.yourdomain.com/privkey.pem|' /etc/dovecot/conf.d/10-ssl.conf

# Restart services
sudo systemctl restart postfix dovecot
```

### 2. Configure Firewall

```bash
sudo ufw allow 25/tcp    # SMTP
sudo ufw allow 587/tcp   # Submission
sudo ufw allow 465/tcp   # SMTPS
sudo ufw allow 143/tcp   # IMAP
sudo ufw allow 993/tcp   # IMAPS
sudo ufw allow 110/tcp   # POP3
sudo ufw allow 995/tcp   # POP3S
sudo ufw allow 3000/tcp  # API (restrict to specific IPs in production)
sudo ufw enable
```

### 3. Install Fail2ban

```bash
sudo apt-get install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 4. Set Reverse DNS (PTR Record)

Contact your hosting provider to set:
```
YOUR_SERVER_IP → mail.yourdomain.com
```

This improves email deliverability.

### 5. Restrict API Access

Limit API port to specific IPs:
```bash
sudo ufw delete allow 3000/tcp
sudo ufw allow from YOUR_TRUSTED_IP to any port 3000
```

## IP Rotation Setup

Since this is a native installation (not Dockerized), you can add IP rotation using GRE tunnels.

### Add Additional IPs

**Option 1: Multiple IPs on Interface**
```bash
sudo ip addr add NEW_IP/32 dev eth0
```

**Option 2: GRE Tunnel**
```bash
sudo ip tunnel add gre1 mode gre remote REMOTE_IP local YOUR_SERVER_IP
sudo ip addr add NEW_IP/32 dev gre1
sudo ip link set gre1 up
```

### Configure Postfix for IP Rotation

Edit `/etc/postfix/main.cf`:
```
# Default outbound IP
smtp_bind_address = YOUR_DEFAULT_IP

# Or use per-domain routing
# Add to /etc/postfix/sender_dependent_default_transport_maps
# domain1.com    smtp-ip1:
# domain2.com    smtp-ip2:
```

## Troubleshooting

### Mail Not Sending

1. Check Postfix logs:
```bash
sudo tail -f /var/log/mail.log
```

2. Test SMTP:
```bash
telnet localhost 25
```

3. Verify DNS records are propagated:
```bash
dig MX yourdomain.com
dig TXT mail._domainkey.yourdomain.com
```

### IMAP Authentication Failing

1. Check Dovecot logs:
```bash
sudo journalctl -u dovecot -f
```

2. Test authentication:
```bash
doveadm auth test user@yourdomain.com password
```

3. Verify database connection:
```bash
sudo mysql mailserver -e "SELECT * FROM virtual_users WHERE email='user@yourdomain.com';"
```

### API Not Responding

1. Check API logs:
```bash
sudo journalctl -u mailserver-api -f
```

2. Verify API is running:
```bash
curl http://mail.yourdomain.com/api/health -H "x-api-key: YOUR_API_KEY"
```

3. Check database connection:
```bash
cat /opt/mailserver-api/.env
```

## File Locations

- **API Code:** `/opt/mailserver-api/`
- **Postfix Config:** `/etc/postfix/main.cf`
- **Dovecot Config:** `/etc/dovecot/`
- **DKIM Keys:** `/etc/opendkim/keys/`
- **Mail Storage:** `/var/vmail/`
- **Database:** MySQL `mailserver` database

## Backup Strategy

### Backup Database
```bash
sudo mysqldump mailserver > mailserver-backup-$(date +%Y%m%d).sql
```

### Backup Mail
```bash
sudo tar -czf vmail-backup-$(date +%Y%m%d).tar.gz /var/vmail
```

### Backup Configuration
```bash
sudo tar -czf config-backup-$(date +%Y%m%d).tar.gz \
  /etc/postfix \
  /etc/dovecot \
  /opt/mailserver-api
```

## Scaling to Multiple Servers

### Deploy to New Server

1. Copy this deployment package to new server
2. Run installation with different domain:
```bash
ansible-playbook -i new-inventory deploy.yml \
  --extra-vars "domain=newdomain.com hostname=mail.newdomain.com"
```

3. Configure DNS for new domain
4. Generate API key for new server
5. Add domains and mailboxes via API

### Load Balancing

For high availability, use:
- **DNS Round Robin** - Multiple A records for MX
- **HAProxy** - Load balance SMTP/IMAP
- **Database Replication** - MySQL master-slave setup

## Support

For issues or questions:
1. Check logs in `/var/log/mail.log`
2. Review service status: `systemctl status postfix dovecot mailserver-api`
3. Test connectivity: `telnet localhost 25` and `telnet localhost 143`
4. Verify DNS records are correct

## License

This deployment package is provided as-is for mail server automation.
