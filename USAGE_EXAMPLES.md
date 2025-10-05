# Usage Examples

Complete examples for deploying and managing your mail server.

## Deployment Examples

### Example 1: Deploy to Single Server with Ansible

```bash
# Step 1: Create inventory file
cat > inventory << EOF
[mailserver]
15.204.242.87 ansible_user=ubuntu ansible_become=yes
EOF

# Step 2: Run deployment
ansible-playbook -i inventory deploy.yml \
  --extra-vars "domain=mycompany.com hostname=mail.mycompany.com db_password=SuperSecure123!"

# Output:
# PLAY [Deploy Custom Mail Server] *******************
# TASK [Update apt cache] ****************************
# TASK [Install required packages] *******************
# ...
# PLAY RECAP *****************************************
# 15.204.242.87 : ok=25 changed=22 unreachable=0 failed=0
```

### Example 2: Deploy with Shell Script

```bash
# Step 1: Copy package to server
scp -r mailserver-deployment/ ubuntu@15.204.242.87:/tmp/

# Step 2: SSH and install
ssh ubuntu@15.204.242.87

# Step 3: Run installer
cd /tmp/mailserver-deployment/scripts
sudo ./install.sh mycompany.com mail.mycompany.com DbPass123

# Output:
# ========================================
#   Mail Server Installation Script
# ========================================
# Installing packages...
# Installing Node.js...
# Creating vmail user...
# ...
# Installation Complete!
```

### Example 3: Deploy Multiple Servers in Parallel

```bash
# Create inventory for 3 servers
cat > multi-inventory << EOF
[mailserver]
server1.example.com ansible_user=root
server2.example.com ansible_user=root
server3.example.com ansible_user=root
EOF

# Deploy to all servers (each with different domain)
ansible-playbook -i multi-inventory deploy.yml \
  --extra-vars "domain={{ inventory_hostname }} hostname=mail.{{ inventory_hostname }}"
```

## API Usage Examples

### Setup: Get Your API Key

```bash
# Step 1: Generate production API key
curl -X POST http://mail.mycompany.com/api/api-keys \
  -H "x-api-key: default_key_change_me" \
  -H "Content-Type: application/json" \
  -d '{"description":"Production API Key"}'

# Response:
{
  "success": true,
  "api_key": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2",
  "description": "Production API Key",
  "message": "API key created. Store it securely - it cannot be retrieved later."
}

# Step 2: Save it as environment variable
export MAIL_API_KEY="a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2"
```

### Example 1: Add Domain and Create Mailbox

```bash
# Add domain
curl -X POST http://mail.mycompany.com/api/domains \
  -H "x-api-key: $MAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"domain":"mycompany.com","dkim_selector":"mail"}'

# Response:
{
  "success": true,
  "domain": {
    "id": 1,
    "name": "mycompany.com",
    "dkim_selector": "mail",
    "dkim_public_key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...",
    "dkim_dns_record": "mail._domainkey.mycompany.com IN TXT \"v=DKIM1; k=rsa; p=MIIBIjAN...\""
  },
  "message": "Domain added successfully. Add the DKIM DNS record to your DNS provider."
}

# Create admin mailbox
curl -X POST http://mail.mycompany.com/api/mailboxes \
  -H "x-api-key: $MAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@mycompany.com",
    "password": "AdminSecurePass123!",
    "quota_mb": 5000
  }'

# Response:
{
  "success": true,
  "mailbox": {
    "id": 1,
    "email": "admin@mycompany.com",
    "quota_mb": 5000
  },
  "message": "Mailbox created successfully"
}
```

### Example 2: Bulk Create Mailboxes

```bash
# Create multiple mailboxes for team
for user in sales support info contact; do
  curl -X POST http://mail.mycompany.com/api/mailboxes \
    -H "x-api-key: $MAIL_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${user}@mycompany.com\",\"password\":\"TempPass123\",\"quota_mb\":2000}"
  echo ""
done

# Output:
{"success":true,"mailbox":{"id":2,"email":"sales@mycompany.com","quota_mb":2000},...}
{"success":true,"mailbox":{"id":3,"email":"support@mycompany.com","quota_mb":2000},...}
{"success":true,"mailbox":{"id":4,"email":"info@mycompany.com","quota_mb":2000},...}
{"success":true,"mailbox":{"id":5,"email":"contact@mycompany.com","quota_mb":2000},...}
```

### Example 3: List All Domains and Mailboxes

```bash
# List all domains
curl http://mail.mycompany.com/api/domains \
  -H "x-api-key: $MAIL_API_KEY" | jq .

# Response:
{
  "domains": [
    {
      "id": 1,
      "name": "mycompany.com",
      "dkim_selector": "mail",
      "dkim_public_key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...",
      "created_at": "2024-10-05T12:00:00.000Z"
    }
  ]
}

# List all mailboxes
curl http://mail.mycompany.com/api/mailboxes \
  -H "x-api-key: $MAIL_API_KEY" | jq .

# Response:
{
  "mailboxes": [
    {
      "id": 1,
      "email": "admin@mycompany.com",
      "quota_mb": 5000,
      "created_at": "2024-10-05T12:05:00.000Z",
      "domain": "mycompany.com"
    },
    ...
  ]
}
```

### Example 4: Update Mailbox Password

```bash
# Update password for specific mailbox
curl -X PUT http://mail.mycompany.com/api/mailboxes/admin@mycompany.com/password \
  -H "x-api-key: $MAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"password":"NewSecurePassword456!"}'

# Response:
{
  "success": true,
  "message": "Password updated successfully"
}
```

### Example 5: Get DKIM Record for DNS

```bash
# Get DKIM record for domain
curl http://mail.mycompany.com/api/domains/mycompany.com/dkim \
  -H "x-api-key: $MAIL_API_KEY" | jq .

# Response:
{
  "domain": "mycompany.com",
  "selector": "mail",
  "public_key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...",
  "dns_record": "mail._domainkey.mycompany.com IN TXT \"v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A...\""
}
```

## DNS Configuration Examples

### Example 1: Cloudflare via CLI

```bash
# Install cloudflare CLI
npm install -g cloudflare-cli

# Set credentials
export CF_API_TOKEN="your_cloudflare_token"

# Add A record
curl -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "A",
    "name": "mail.mycompany.com",
    "content": "15.204.242.87",
    "ttl": 3600,
    "proxied": false
  }'

# Add MX record
curl -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "MX",
    "name": "mycompany.com",
    "content": "mail.mycompany.com",
    "priority": 10,
    "ttl": 3600
  }'

# Add SPF record
curl -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "TXT",
    "name": "mycompany.com",
    "content": "v=spf1 ip4:15.204.242.87 a:mail.mycompany.com ~all",
    "ttl": 3600
  }'

# Add DKIM record
curl -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "TXT",
    "name": "mail._domainkey.mycompany.com",
    "content": "v=DKIM1; k=rsa; p=YOUR_DKIM_PUBLIC_KEY",
    "ttl": 3600
  }'

# Add DMARC record
curl -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "TXT",
    "name": "_dmarc.mycompany.com",
    "content": "v=DMARC1; p=quarantine; rua=mailto:postmaster@mycompany.com",
    "ttl": 3600
  }'
```

### Example 2: Route53 via AWS CLI

```bash
# Create DNS records in Route53
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [
      {
        "Action": "CREATE",
        "ResourceRecordSet": {
          "Name": "mail.mycompany.com",
          "Type": "A",
          "TTL": 3600,
          "ResourceRecords": [{"Value": "15.204.242.87"}]
        }
      },
      {
        "Action": "CREATE",
        "ResourceRecordSet": {
          "Name": "mycompany.com",
          "Type": "MX",
          "TTL": 3600,
          "ResourceRecords": [{"Value": "10 mail.mycompany.com"}]
        }
      },
      {
        "Action": "CREATE",
        "ResourceRecordSet": {
          "Name": "mycompany.com",
          "Type": "TXT",
          "TTL": 3600,
          "ResourceRecords": [{"Value": "\"v=spf1 ip4:15.204.242.87 ~all\""}]
        }
      }
    ]
  }'
```

## Email Client Configuration Examples

### Example 1: Thunderbird

1. Open Thunderbird
2. Go to: Account Settings → Account Actions → Add Mail Account
3. Configure:
   - **Name:** Admin
   - **Email:** admin@mycompany.com
   - **Password:** AdminSecurePass123!
4. Manual Config:
   - **Incoming (IMAP):**
     - Server: mail.mycompany.com (or 15.204.242.87)
     - Port: 993
     - SSL: SSL/TLS
     - Auth: Normal password
   - **Outgoing (SMTP):**
     - Server: mail.mycompany.com (or 15.204.242.87)
     - Port: 587
     - SSL: STARTTLS
     - Auth: Normal password

### Example 2: Outlook

1. Open Outlook → File → Add Account
2. Select "Manual setup"
3. Choose "POP or IMAP"
4. Configure:
   - **Account Type:** IMAP
   - **Incoming server:** mail.mycompany.com
   - **Outgoing server (SMTP):** mail.mycompany.com
   - **User Name:** admin@mycompany.com
   - **Password:** AdminSecurePass123!
5. More Settings → Advanced:
   - **Incoming (IMAP):** 993, SSL
   - **Outgoing (SMTP):** 587, TLS

### Example 3: Gmail (Send As)

1. Gmail → Settings → Accounts and Import
2. Send mail as → Add another email address
3. Configure:
   - **Name:** My Company
   - **Email:** admin@mycompany.com
   - **SMTP Server:** mail.mycompany.com
   - **Port:** 587
   - **Username:** admin@mycompany.com
   - **Password:** AdminSecurePass123!
   - **TLS:** Yes

## Testing Examples

### Example 1: Test SMTP with Telnet

```bash
# Connect to SMTP
telnet mail.mycompany.com 25

# Output:
220 mail.mycompany.com ESMTP Postfix

# Send test email
EHLO test.com
MAIL FROM:<admin@mycompany.com>
RCPT TO:<recipient@gmail.com>
DATA
Subject: Test Email
This is a test email from my mail server.
.
QUIT
```

### Example 2: Test IMAP Authentication

```bash
# Test with openssl
openssl s_client -connect mail.mycompany.com:993

# After connection:
a1 LOGIN admin@mycompany.com AdminSecurePass123!
a2 LIST "" "*"
a3 SELECT INBOX
a4 LOGOUT
```

### Example 3: Send Test Email via Command Line

```bash
# Using mail command
echo "Test email body" | mail -s "Test Subject" \
  -r "admin@mycompany.com" \
  recipient@gmail.com

# Using sendmail
sendmail -f admin@mycompany.com recipient@gmail.com << EOF
Subject: Test from sendmail
From: admin@mycompany.com
To: recipient@gmail.com

This is a test email.
EOF
```

### Example 4: Check Email Deliverability

```bash
# Test DNS records
dig MX mycompany.com +short
dig TXT mail._domainkey.mycompany.com +short
dig TXT mycompany.com | grep spf

# Test SMTP connection
nc -zv mail.mycompany.com 25
nc -zv mail.mycompany.com 587
nc -zv mail.mycompany.com 465

# Test with mail-tester.com
# Send email to the address provided by mail-tester.com
echo "Test" | mail -s "Deliverability Test" test-xxxxx@mail-tester.com
# Then check score at mail-tester.com
```

## Automation Examples

### Example 1: Auto-provision Mailboxes from CSV

```bash
# Create CSV file: mailboxes.csv
cat > mailboxes.csv << EOF
email,password,quota_mb
sales@mycompany.com,TempPass123,2000
support@mycompany.com,TempPass123,5000
info@mycompany.com,TempPass123,1000
EOF

# Provision all mailboxes
while IFS=, read -r email password quota_mb; do
  [ "$email" = "email" ] && continue  # Skip header
  curl -X POST http://mail.mycompany.com/api/mailboxes \
    -H "x-api-key: $MAIL_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"$password\",\"quota_mb\":$quota_mb}"
  echo ""
done < mailboxes.csv
```

### Example 2: Monitor Mail Queue

```bash
# Create monitoring script
cat > /usr/local/bin/check-mail-queue.sh << 'EOF'
#!/bin/bash
QUEUE_COUNT=$(mailq | tail -1 | awk '{print $5}')
if [ "$QUEUE_COUNT" -gt 100 ]; then
  echo "WARNING: Mail queue has $QUEUE_COUNT messages"
  # Send alert
fi
EOF

chmod +x /usr/local/bin/check-mail-queue.sh

# Add to crontab
echo "*/5 * * * * /usr/local/bin/check-mail-queue.sh" | crontab -
```

### Example 3: Backup Automation

```bash
# Create backup script
cat > /usr/local/bin/backup-mailserver.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backup/mailserver"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
mysqldump mailserver > $BACKUP_DIR/db-$DATE.sql

# Backup mail
tar -czf $BACKUP_DIR/vmail-$DATE.tar.gz /var/vmail

# Backup config
tar -czf $BACKUP_DIR/config-$DATE.tar.gz /etc/postfix /etc/dovecot /opt/mailserver-api

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

chmod +x /usr/local/bin/backup-mailserver.sh

# Run daily at 2 AM
echo "0 2 * * * /usr/local/bin/backup-mailserver.sh" | crontab -
```

## Scaling Examples

### Example 1: Deploy Across Multiple Regions

```bash
# Deploy to US server
ansible-playbook -i us-inventory deploy.yml \
  --extra-vars "domain=us.mycompany.com hostname=mail-us.mycompany.com"

# Deploy to EU server
ansible-playbook -i eu-inventory deploy.yml \
  --extra-vars "domain=eu.mycompany.com hostname=mail-eu.mycompany.com"

# Deploy to APAC server
ansible-playbook -i apac-inventory deploy.yml \
  --extra-vars "domain=apac.mycompany.com hostname=mail-apac.mycompany.com"
```

### Example 2: Load Balancing with HAProxy

```bash
# Install HAProxy on separate server
apt-get install haproxy

# Configure /etc/haproxy/haproxy.cfg
cat >> /etc/haproxy/haproxy.cfg << 'EOF'
frontend smtp_front
    bind *:25
    mode tcp
    default_backend smtp_back

backend smtp_back
    mode tcp
    balance roundrobin
    server mail1 15.204.242.87:25 check
    server mail2 15.204.242.88:25 check
    server mail3 15.204.242.89:25 check
EOF

systemctl restart haproxy
```

This completes the usage examples covering deployment, API usage, DNS configuration, email clients, testing, automation, and scaling scenarios.
