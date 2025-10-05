# Quick Start Guide

## Fastest Way to Deploy

### 1. Ansible Method (3 Commands)

```bash
# Create inventory
echo "your-server-ip ansible_user=root" > inventory

# Run playbook
ansible-playbook -i inventory deploy.yml \
  --extra-vars "domain=yourdomain.com hostname=mail.yourdomain.com db_password=SecurePass123"

# Done! Server is ready
```

### 2. Shell Script Method (2 Commands)

```bash
# Copy files to server
scp -r mailserver-deployment/ root@your-server:/tmp/

# SSH and run installer
ssh root@your-server "cd /tmp/mailserver-deployment/scripts && ./install.sh yourdomain.com mail.yourdomain.com SecurePass123"
```

## After Installation (Required)

### Step 1: Generate API Key
```bash
curl -X POST http://mail.yourdomain.com/api/api-keys \
  -H "x-api-key: default_key_change_me" \
  -H "Content-Type: application/json" \
  -d '{"description":"Production"}'
```

**Save the returned API key!**

### Step 2: Add Domain
```bash
curl -X POST http://mail.yourdomain.com/api/domains \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain":"yourdomain.com"}'
```

**Save the DKIM record from response!**

### Step 3: Configure DNS

Add these records in your DNS provider:

| Type | Name | Value | Priority |
|------|------|-------|----------|
| A | mail.yourdomain.com | YOUR_SERVER_IP | - |
| MX | yourdomain.com | mail.yourdomain.com | 10 |
| TXT | yourdomain.com | v=spf1 ip4:YOUR_SERVER_IP ~all | - |
| TXT | mail._domainkey.yourdomain.com | (from step 2) | - |
| TXT | _dmarc.yourdomain.com | v=DMARC1; p=quarantine | - |

### Step 4: Create Mailbox
```bash
curl -X POST http://mail.yourdomain.com/api/mailboxes \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"MailboxPass123"}'
```

## Test Your Mail Server

### Send Test Email

Use any SMTP client (Thunderbird, Outlook, etc.):
- **Server:** mail.yourdomain.com
- **Port:** 587
- **Username:** admin@yourdomain.com
- **Password:** MailboxPass123
- **Encryption:** STARTTLS

### Check If It Works

```bash
# Via command line
echo "Test" | mail -s "Test Email" someone@gmail.com

# Check logs
tail -f /var/log/mail.log
```

## Next Steps

- Set up SSL certificates (Let's Encrypt)
- Configure firewall (UFW)
- Set reverse DNS (PTR record)
- Install fail2ban
- See full [README.md](README.md) for details

## One-Line Deployment (Copy-Paste Ready)

### For Ansible:
```bash
echo "YOUR_SERVER_IP ansible_user=root" > inventory && ansible-playbook -i inventory deploy.yml --extra-vars "domain=YOURDOMAIN.com hostname=mail.YOURDOMAIN.com db_password=YOURPASSWORD"
```

### For Shell Script:
```bash
scp -r . root@YOUR_SERVER_IP:/tmp/deploy && ssh root@YOUR_SERVER_IP "cd /tmp/deploy/scripts && ./install.sh YOURDOMAIN.com mail.YOURDOMAIN.com DBPASSWORD"
```

**Replace:**
- `YOUR_SERVER_IP` - Your server IP
- `YOURDOMAIN.com` - Your domain
- `YOURPASSWORD` - Secure database password
- `DBPASSWORD` - Database password
