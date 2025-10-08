# Mailrice v2

**Production-ready email platform with multi-tenancy, automated provisioning, and enterprise-grade reliability.**

Complete email infrastructure with FastAPI backend, Postfix/Dovecot/OpenDKIM mail stack, and one-command deployment via Ansible.

---

## 🚀 Quick Start

### One-Command Installation

Deploy complete email platform in ~10 minutes:

```bash
./install.sh your-domain.com mail.your-domain.com
```

**What it does:**
- ✅ Validates system requirements (Ubuntu 22.04/24.04, 2GB+ RAM)
- ✅ Installs PostgreSQL, Redis, Nginx, Postfix, Dovecot, OpenDKIM
- ✅ Obtains SSL certificates via Cloudflare DNS-01
- ✅ Deploys FastAPI backend with JWT authentication
- ✅ Configures firewall (UFW) and security hardening
- ✅ Generates admin credentials and saves to `/root/.mailrice-credentials.txt`

### Prerequisites

- Ubuntu 22.04 or 24.04 server
- 2GB+ RAM (4GB recommended)
- Root/sudo access
- Domain with Cloudflare DNS (optional, for automated SSL/DNS)

---

## 📚 Documentation

- **[V2 Complete Guide](V2_README.md)** - Architecture, features, deployment
- **[Testing Guide](TESTING.md)** - Comprehensive testing (10 sections, 20+ tests)
- **[Session 1 Summary](SESSION1_COMPLETE.md)** - Core infrastructure details

---

## ✨ Features

### Multi-Tenant Architecture
- **Tenants** → **Workspaces** → **Domains** → **Mailboxes**
- Complete tenant isolation with database-level security
- Support for unlimited tenants, domains, and mailboxes

### Email Infrastructure
- **Postfix** - SMTP/Submission/SMTPS (ports 25, 587, 465)
- **Dovecot** - IMAP/LMTP with Argon2id authentication (ports 143, 993)
- **OpenDKIM** - 2048-bit RSA DKIM signing for all outbound mail
- **Maildir Storage** - Standard maildir format at `/var/vmail/`

### API-First Design
- **FastAPI** backend with async/await
- **JWT Authentication** - Secure token-based auth for dashboard
- **API Keys** - Programmatic access with prefix-based lookup
- **RESTful Endpoints** - Complete domain/mailbox management

### Automation
- **Cloudflare Integration** - Automatic DNS record creation (MX, SPF, DKIM, DMARC)
- **DKIM Key Generation** - Automatic 2048-bit RSA key generation per domain
- **Maildir Provisioning** - Automatic creation with proper permissions
- **Event Logging** - Audit trail for all operations

### Security
- **Argon2id** password hashing for mailboxes
- **Bcrypt** for API keys
- **TLS 1.2+** enforcement on all mail protocols
- **Systemd Sandboxing** - ProtectSystem, PrivateTmp, NoNewPrivileges
- **UFW Firewall** - Minimal attack surface
- **No Plaintext Auth** - TLS required before authentication

### Deployment
- **Ansible-Powered** - Idempotent, reproducible deployments
- **Pre-flight Checks** - System validation before deployment
- **Zero-Configuration** - Sensible defaults, minimal required vars
- **SSL Automation** - Let's Encrypt via Cloudflare DNS-01

---

## 🏗️ Architecture

```
                    ┌──────────────────────────────────┐
                    │         FastAPI Backend          │
                    │  (JWT Auth + API Keys + Routes)  │
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────┴───────────────────┐
                    │                                  │
        ┌───────────▼──────────┐         ┌───────────▼──────────┐
        │  Domain Service      │         │  Mailbox Service     │
        │  - DKIM Generation   │         │  - Maildir Creation  │
        │  - DNS Automation    │         │  - Password Hash     │
        │  - DB Entry          │         │  - Permissions       │
        └───────────┬──────────┘         └───────────┬──────────┘
                    │                                │
        ┌───────────▼──────────┐         ┌──────────▼───────────┐
        │  Cloudflare API      │         │   PostgreSQL DB      │
        │  (MX, SPF, DKIM,     │         │  (Multi-tenant)      │
        │   DMARC records)     │         │                      │
        └──────────────────────┘         └──────────────────────┘
                                                    │
                    ┌───────────────────────────────┘
                    │
        ┌───────────▼──────────┐
        │    Mail Stack        │
        │  - Postfix (SMTP)    │
        │  - Dovecot (IMAP)    │
        │  - OpenDKIM (Sign)   │
        └──────────────────────┘
```

---

## 📖 API Usage

### Authentication

All requests require either JWT token (for dashboard) or API key (for automation):

```bash
# Login to get JWT token
curl -X POST https://mail.your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@your-domain.com","password":"your-password"}'

# Use JWT for subsequent requests
curl https://mail.your-domain.com/api/domains \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Or use API key
curl https://mail.your-domain.com/api/domains \
  -H "X-API-Key: YOUR_API_KEY"
```

### Domain Management

```bash
# Create domain with automated provisioning
curl -X POST https://mail.your-domain.com/api/domains \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": 1,
    "domain": "testmail.com",
    "hostname": "mail.your-domain.com",
    "dkim_selector": "mail"
  }'

# Get DNS records for manual setup
curl https://mail.your-domain.com/api/domains/1/dns-records \
  -H "Authorization: Bearer $JWT_TOKEN"

# Rotate DKIM key
curl -X POST https://mail.your-domain.com/api/domains/1/rotate-dkim \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"new_selector":"mail2025"}'
```

### Mailbox Management

```bash
# Create mailbox
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

# Update password
curl -X PUT https://mail.your-domain.com/api/mailboxes/1/password \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"new_password":"NewSecure456!"}'

# List mailboxes (filter by workspace or domain)
curl https://mail.your-domain.com/api/mailboxes?workspace_id=1 \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### API Key Management

```bash
# Create API key for programmatic access
curl -X POST https://mail.your-domain.com/api/apikeys \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Production Key","scopes":[]}'

# ⚠️ Save the returned `api_key` - it's only shown once!
```

---

## 🔧 Post-Deployment

### 1. Get Admin Credentials

```bash
ssh root@your-server
cat /root/.mailrice-credentials.txt
```

### 2. Test Health

```bash
curl https://mail.your-domain.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "database": "connected",
  "version": "2.0.0"
}
```

### 3. Create First Domain

```bash
# Login to get JWT token
JWT=$(curl -X POST https://mail.your-domain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@your-domain.com","password":"your-password"}' \
  | jq -r '.access_token')

# Create domain
curl -X POST https://mail.your-domain.com/api/domains \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": 1,
    "domain": "testmail.com",
    "hostname": "mail.your-domain.com"
  }'
```

### 4. Create First Mailbox

```bash
curl -X POST https://mail.your-domain.com/api/mailboxes \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "workspace_id": 1,
    "domain_id": 1,
    "local_part": "hello",
    "password": "SecurePassword123!",
    "quota_mb": 1024
  }'
```

### 5. Test Email Flow

See [TESTING.md](TESTING.md) for comprehensive testing guide.

---

## 🛠️ Service Management

### Check Status

```bash
sudo systemctl status mailrice-api
sudo systemctl status postfix
sudo systemctl status dovecot
sudo systemctl status opendkim
sudo systemctl status nginx
```

### View Logs

```bash
# API logs
sudo journalctl -u mailrice-api -f

# Mail logs
sudo tail -f /var/log/mail.log

# Nginx logs
sudo tail -f /var/log/nginx/error.log
```

### Restart Services

```bash
sudo systemctl restart mailrice-api
sudo systemctl restart postfix
sudo systemctl restart dovecot
```

---

## 📊 What's New in V2

### vs V1 (MySQL/Node.js)

| Feature | V1 | V2 |
|---------|----|----|
| Backend | Node.js/Express | FastAPI (async/await) |
| Database | MySQL | PostgreSQL |
| Authentication | API keys only | JWT + API keys |
| Multi-tenancy | ❌ | ✅ Complete isolation |
| DNS Automation | ❌ | ✅ Cloudflare API |
| DKIM Rotation | ❌ | ✅ API endpoint |
| Password Hashing | MD5-CRYPT | Argon2id |
| Deployment | Shell scripts | Ansible automation |
| Testing Guide | ❌ | ✅ 20+ tests |
| SSL | Manual | Automated (Certbot) |
| Event Logging | ❌ | ✅ Audit trail |

### Reliability Improvements

- ✅ **Pre-flight validation** - System checks before deployment
- ✅ **Idempotent deployment** - Safe to re-run Ansible playbook
- ✅ **Health checks** - API health endpoint for monitoring
- ✅ **Structured logging** - Better debugging and troubleshooting
- ✅ **Error handling** - Graceful failures with rollback support

---

## 🎯 Use Cases

### Cold Email Agencies
- Multi-tenant: Separate workspace per client
- Bulk mailbox creation via API
- Automated DKIM configuration
- IP rotation ready (GRE tunnels supported)

### SaaS Email Platforms
- White-label ready
- API-first design for integrations
- Complete tenant isolation
- Scalable architecture

### Self-Hosted Email
- Full control over data
- No third-party dependencies
- Open source (customizable)
- Cost-effective (no per-mailbox fees)

---

## 🔒 Security

### Password Storage
- **Mailboxes**: Argon2id (memory-hard, GPU-resistant)
- **API Keys**: Bcrypt with 12 rounds
- **JWT Tokens**: HS256 with configurable expiration

### Network Security
- **TLS Enforcement**: Required for IMAP/SMTP authentication
- **Firewall**: UFW with minimal open ports
- **Systemd Sandboxing**: ProtectSystem, PrivateTmp, NoNewPrivileges
- **No Root**: Services run as unprivileged users (mailrice, vmail)

### Database Security
- **Tenant Isolation**: All queries filter by tenant_id
- **Connection Pooling**: Async connection management
- **Prepared Statements**: SQL injection protection

---

## 🧪 Testing

Comprehensive testing guide with 10 sections:

1. API Health Check
2. Domain Provisioning
3. Mailbox Provisioning
4. Email Flow Testing
5. DKIM Verification
6. API Key Testing
7. Advanced Testing (rotation, deletion)
8. Security Testing (TLS, auth)
9. Performance Testing (load tests)
10. Troubleshooting

See [TESTING.md](TESTING.md) for complete guide.

---

## 📂 File Structure

```
mailrice/
├── install.sh                    # One-command installer
├── ansible/
│   ├── playbook.yml             # Main deployment playbook
│   ├── group_vars/
│   │   └── all.yml.example      # Configuration template
│   └── roles/
│       ├── postfix/             # SMTP server role
│       ├── dovecot/             # IMAP server role
│       └── opendkim/            # DKIM signing role
├── apps/api/
│   ├── alembic/                 # Database migrations
│   │   └── versions/
│   │       └── 001_initial_schema.py
│   ├── app/
│   │   ├── main.py              # FastAPI application
│   │   ├── models.py            # SQLAlchemy models
│   │   ├── auth.py              # JWT + API key auth
│   │   ├── config.py            # Settings management
│   │   ├── database.py          # DB connection
│   │   ├── routes_domains.py   # Domain API endpoints
│   │   ├── routes_mailboxes.py # Mailbox API endpoints
│   │   ├── services/            # Business logic
│   │   │   ├── domain.py        # Domain provisioning
│   │   │   └── mailbox.py       # Mailbox provisioning
│   │   └── utils/               # Utilities
│   │       ├── cloudflare.py    # DNS automation
│   │       ├── dkim.py          # DKIM key generation
│   │       └── network.py       # IP detection
│   └── requirements.txt         # Python dependencies
├── V2_README.md                 # Complete v2 documentation
├── TESTING.md                   # Testing guide
└── SESSION1_COMPLETE.md         # Session 1 summary
```

---

## 🚧 Roadmap

### Completed ✅
- [x] Session 1: Core Infrastructure (FastAPI, PostgreSQL, JWT, Ansible)
- [x] Session 2: Mail Stack (Postfix, Dovecot, OpenDKIM, DNS automation)

### Planned 🎯
- [ ] Session 3: Monitoring & Observability (Prometheus, Grafana)
- [ ] Session 4: Backup Automation (PostgreSQL + maildir)
- [ ] Session 5: Rate Limiting (Redis-based)
- [ ] Session 6: Frontend Dashboard (React/Vue)
- [ ] Session 7: Webhook Notifications
- [ ] Session 8: IP Rotation (GRE tunnel automation)

---

## 🤝 Contributing

This is a side project open for contributions. Areas for improvement:

- Frontend dashboard
- Advanced monitoring
- Additional DNS providers (Route53, DigitalOcean)
- SMTP relay integration
- Email analytics

---

## 📄 License

MIT License - Free to use for personal and commercial projects.

---

## 💡 Support

- **Documentation**: [V2_README.md](V2_README.md)
- **Testing**: [TESTING.md](TESTING.md)
- **Issues**: Check logs in `/var/log/mail.log` and `journalctl -u mailrice-api`
- **Health Check**: `curl https://mail.your-domain.com/api/health`

---

**Built with ❤️ using FastAPI, PostgreSQL, Ansible, Postfix, Dovecot, and OpenDKIM.**

🤖 Generated with [Claude Code](https://claude.com/claude-code)
