# Mailrice v2 - Production Email Platform

**One-command deployment** of a complete email infrastructure on Ubuntu 22.04/24.04.

## 🚀 Quick Start

Deploy on a fresh **Ubuntu 22.04 or 24.04** server in 5 minutes:

```bash
curl -fsSL https://raw.githubusercontent.com/Ayushjain101/Mailrice/v2-rewrite/install.sh | \
  sudo bash -s -- \
    --domain "yourdomain.com" \
    --hostname "mail.yourdomain.com" \
    --cf-email "you@example.com" \
    --cf-token "your_cloudflare_token" \
    --cf-zone "your_zone_id" \
    --admin-email "admin@yourdomain.com" \
    --admin-password "SecurePassword123!"
```

**What it does:**
- ✅ Installs PostgreSQL, Redis, Nginx, Certbot
- ✅ Obtains SSL certificates via Cloudflare DNS-01
- ✅ Deploys FastAPI backend (auth, health, API keys)
- ✅ Creates admin user and database
- ✅ Configures firewall (UFW)
- ✅ **Idempotent**: Safe to re-run

**Access your API:**
- Health: `https://mail.yourdomain.com/api/health`
- Docs: `https://mail.yourdomain.com/api/docs`
- Admin credentials saved to `/root/.mailrice/credentials.txt`

---

## Session 1 Features (Current)

### What's Working:
✅ **Database**: PostgreSQL with multi-tenant schema
✅ **API**: FastAPI with JWT auth + API keys
✅ **Auth**: Argon2id password hashing
✅ **Infrastructure**: Nginx reverse proxy, SSL certificates
✅ **Deployment**: One-command Ansible playbook

### API Endpoints:
```bash
# Health check
GET /api/health

# Login (get JWT)
POST /api/auth/login
{
  "email": "admin@yourdomain.com",
  "password": "your_password"
}

# Get current user
GET /api/auth/me
Authorization: Bearer <jwt_token>

# Create API key
POST /api/apikeys
{
  "name": "Production Key",
  "scopes": ["domains:write", "mailboxes:write"]
}

# List API keys
GET /api/apikeys
```

---

## Coming in Session 2: Mail Stack

Next session will add:
- 📧 Postfix + Dovecot + OpenDKIM
- 🔐 DKIM key generation
- 🌐 Cloudflare DNS automation
- 📬 Domain + Mailbox provisioning APIs
- 🔁 Async worker (Celery)

---

## Architecture

```
┌─────────────┐
│  Internet   │
└──────┬──────┘
       │
       ▼
┌──────────────┐
│ Cloudflare   │  (DNS, DDoS)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Nginx      │  (HTTPS, reverse proxy)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  FastAPI     │  (REST API, auth)
│  (uvicorn)   │
└──────┬───────┘
       │
       ▼
┌──────────────┬──────────────┐
│ PostgreSQL   │    Redis     │
└──────────────┴──────────────┘
```

---

## Installation Methods

### Method 1: One-Liner (Recommended)

```bash
# With Cloudflare DNS automation
curl -fsSL https://raw.githubusercontent.com/Ayushjain101/Mailrice/v2-rewrite/install.sh | \
  sudo bash -s -- \
    --domain "example.com" \
    --hostname "mail.example.com" \
    --cf-email "you@example.com" \
    --cf-token "your_cf_token" \
    --cf-zone "your_zone_id"
```

### Method 2: Manual

```bash
# 1. Clone repository
git clone -b v2-rewrite https://github.com/Ayushjain101/Mailrice.git
cd Mailrice

# 2. Configure
cp ansible/group_vars/all.yml.example ansible/group_vars/all.yml
# Edit all.yml with your values

# 3. Run playbook
cd ansible
ansible-playbook playbook.yml -i inventory/hosts.ini
```

---

## Configuration

### Required:
- `main_domain`: Your domain (e.g., `example.com`)
- `hostname`: Mail server hostname (e.g., `mail.example.com`)

### Optional:
- `cf_email`: Cloudflare email (for DNS automation)
- `cf_api_token`: Cloudflare API token
- `cf_zone_id`: Cloudflare zone ID
- `admin_email`: Admin user (default: `admin@domain`)
- `admin_password`: Admin password (auto-generated if empty)

### Cloudflare Setup:

1. **Create API Token**: https://dash.cloudflare.com/profile/api-tokens
2. **Permissions**: `Zone:Read` + `DNS:Edit`
3. **Zone Resources**: Specific zone (your domain)

---

## Testing Your Deployment

```bash
# Health check
curl https://mail.example.com/api/health

# Login
curl -X POST https://mail.example.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your_password"}'

# Create API key (use JWT from login)
curl -X POST https://mail.example.com/api/apikeys \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Key"}'
```

---

## Database Schema

Multi-tenant architecture:

```
Tenants (organizations)
  └── Workspaces (projects/clients)
        ├── Domains (email domains)
        │     └── Mailboxes (email accounts)
        ├── Events (audit log)
        └── Webhooks (notifications)

Users (access to tenant)
API Keys (programmatic access)
```

---

## Development

### Local Setup:

```bash
cd apps/api

# Create virtualenv
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env

# Run migrations
alembic upgrade head

# Start dev server
uvicorn app.main:app --reload
```

### API Documentation:
- Swagger UI: http://localhost:8000/api/docs
- ReDoc: http://localhost:8000/api/redoc

---

## Troubleshooting

### Check Service Status:
```bash
sudo systemctl status mailrice-api
sudo systemctl status postgresql
sudo systemctl status redis
sudo systemctl status nginx
```

### View Logs:
```bash
# API logs
sudo journalctl -u mailrice-api -f

# Nginx logs
sudo tail -f /var/log/nginx/error.log

# PostgreSQL logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

### Common Issues:

**API not starting:**
```bash
# Check database connection
sudo -u mailrice /opt/mailrice/api/venv/bin/python -c \
  "from app.database import engine; engine.connect()"
```

**SSL certificate failed:**
```bash
# Verify DNS propagation
dig mail.example.com

# Check Cloudflare token
ls -la /root/.secrets/cloudflare.ini
```

---

## File Locations

```
/opt/mailrice/api/          # API application
/opt/mailrice/api/.env      # Configuration
/etc/nginx/sites-enabled/   # Nginx config
/etc/letsencrypt/           # SSL certificates
/root/.mailrice/            # Credentials
/var/log/postgresql/        # Database logs
```

---

## Security

### Firewall (UFW):
- ✅ Port 22 (SSH)
- ✅ Port 80 (HTTP - redirects to HTTPS)
- ✅ Port 443 (HTTPS)
- ❌ All other ports blocked

### Secrets:
- Database passwords auto-generated (32 chars)
- JWT secrets auto-generated (64 chars)
- API keys hashed with bcrypt before storage
- Passwords hashed with argon2id

### Hardening:
- Systemd sandboxing (NoNewPrivileges, PrivateTmp)
- Read-only file systems where possible
- No root access for application processes

---

## What's Next?

**Session 2** (Next):
- Mail stack (Postfix, Dovecot, OpenDKIM)
- Domain provisioning with DNS automation
- Mailbox management
- DKIM key generation

**Session 3** (Future):
- Next.js admin dashboard
- Monitoring (Prometheus, Grafana)
- Testing suite
- CI/CD pipeline

---

## Support

- **Issues**: https://github.com/Ayushjain101/Mailrice/issues
- **Docs**: See `docs/` directory
- **Logs**: Check `/root/.mailrice/` and journalctl

---

## License

MIT License - see LICENSE file

---

**Built with:** FastAPI • PostgreSQL • Redis • Nginx • Ansible • Certbot
