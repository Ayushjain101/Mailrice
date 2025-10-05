#!/bin/bash
set -e

# Mail Server Installation Script
# Alternative to Ansible for simple deployment

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Mail Server Installation Script${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (use sudo)${NC}"
  exit 1
fi

# Get configuration from command line or prompt
DOMAIN="${1:-}"
HOSTNAME="${2:-}"
DB_PASSWORD="${3:-}"

if [ -z "$DOMAIN" ]; then
  read -p "Enter your domain (e.g., example.com): " DOMAIN
fi

if [ -z "$HOSTNAME" ]; then
  read -p "Enter hostname (e.g., mail.example.com): " HOSTNAME
fi

if [ -z "$DB_PASSWORD" ]; then
  read -sp "Enter database password: " DB_PASSWORD
  echo
fi

# Configuration variables
DB_NAME="mailserver"
DB_USER="mailuser"
API_PORT=3000
VMAIL_UID=5000
VMAIL_GID=5000

echo -e "${YELLOW}Installing packages...${NC}"

# Update package list
apt-get update -qq

# Install required packages
apt-get install -y \
  postfix \
  postfix-mysql \
  dovecot-core \
  dovecot-imapd \
  dovecot-pop3d \
  dovecot-lmtpd \
  dovecot-mysql \
  opendkim \
  opendkim-tools \
  mysql-server \
  python3-pymysql \
  curl \
  jq > /dev/null 2>&1

# Install Node.js 20.x
echo -e "${YELLOW}Installing Node.js...${NC}"
if [ ! -f /usr/bin/node ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y nodejs > /dev/null 2>&1
fi

# Create vmail user
echo -e "${YELLOW}Creating vmail user...${NC}"
if ! id -u vmail > /dev/null 2>&1; then
  groupadd -g $VMAIL_GID vmail
  useradd -u $VMAIL_UID -g vmail -d /var/vmail -m -s /usr/sbin/nologin vmail
fi

# Setup MySQL database
echo -e "${YELLOW}Setting up database...${NC}"
mysql -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;"
mysql -e "CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASSWORD';"
mysql -e "GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost';"
mysql -e "FLUSH PRIVILEGES;"

# Import database schema
cat > /tmp/schema.sql << 'SCHEMA_EOF'
CREATE TABLE IF NOT EXISTS virtual_domains (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  dkim_selector VARCHAR(50) DEFAULT 'mail',
  dkim_private_key TEXT,
  dkim_public_key TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS virtual_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  domain_id INT NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  quota_mb INT DEFAULT 1000,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (domain_id) REFERENCES virtual_domains(id) ON DELETE CASCADE,
  INDEX idx_email (email),
  INDEX idx_domain_id (domain_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS virtual_aliases (
  id INT AUTO_INCREMENT PRIMARY KEY,
  domain_id INT NOT NULL,
  source VARCHAR(255) NOT NULL,
  destination VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (domain_id) REFERENCES virtual_domains(id) ON DELETE CASCADE,
  INDEX idx_source (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS api_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  api_key VARCHAR(64) NOT NULL UNIQUE,
  description VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_api_key (api_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO api_keys (api_key, description) VALUES
('default_key_change_me', 'Default API Key - Change immediately')
ON DUPLICATE KEY UPDATE api_key=api_key;
SCHEMA_EOF

mysql $DB_NAME < /tmp/schema.sql
rm /tmp/schema.sql

# Configure Postfix
echo -e "${YELLOW}Configuring Postfix...${NC}"

# Backup original config
cp /etc/postfix/main.cf /etc/postfix/main.cf.bak

# Create main.cf
cat > /etc/postfix/main.cf << EOF
myhostname = $HOSTNAME
mydomain = $DOMAIN
myorigin = \$mydomain
mydestination = localhost
inet_interfaces = all
inet_protocols = ipv4

virtual_mailbox_domains = mysql:/etc/postfix/mysql-virtual-mailbox-domains.cf
virtual_mailbox_maps = mysql:/etc/postfix/mysql-virtual-mailbox-maps.cf
virtual_alias_maps = mysql:/etc/postfix/mysql-virtual-alias-maps.cf

virtual_transport = lmtp:unix:private/dovecot-lmtp
virtual_uid_maps = static:$VMAIL_UID
virtual_gid_maps = static:$VMAIL_GID

smtpd_sasl_auth_enable = yes
smtpd_sasl_type = dovecot
smtpd_sasl_path = private/auth
smtpd_sasl_security_options = noanonymous
smtpd_sasl_local_domain = \$myhostname
broken_sasl_auth_clients = yes

smtpd_tls_cert_file = /etc/ssl/certs/ssl-cert-snakeoil.pem
smtpd_tls_key_file = /etc/ssl/private/ssl-cert-snakeoil.key
smtpd_use_tls = yes
smtpd_tls_security_level = may
smtp_tls_security_level = may

smtpd_recipient_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination
smtpd_relay_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_unauth_destination

message_size_limit = 52428800
mailbox_size_limit = 0
recipient_delimiter = +
compatibility_level = 2
EOF

# Configure MySQL connection files
cat > /etc/postfix/mysql-virtual-mailbox-domains.cf << EOF
user = $DB_USER
password = $DB_PASSWORD
hosts = 127.0.0.1
dbname = $DB_NAME
query = SELECT 1 FROM virtual_domains WHERE name='%s'
EOF

cat > /etc/postfix/mysql-virtual-mailbox-maps.cf << EOF
user = $DB_USER
password = $DB_PASSWORD
hosts = 127.0.0.1
dbname = $DB_NAME
query = SELECT 1 FROM virtual_users WHERE email='%s'
EOF

cat > /etc/postfix/mysql-virtual-alias-maps.cf << EOF
user = $DB_USER
password = $DB_PASSWORD
hosts = 127.0.0.1
dbname = $DB_NAME
query = SELECT destination FROM virtual_aliases WHERE source='%s'
EOF

# Add submission ports to master.cf
if ! grep -q "^submission inet" /etc/postfix/master.cf; then
  cat >> /etc/postfix/master.cf << 'EOF'

submission inet n       -       y       -       -       smtpd
  -o syslog_name=postfix/submission
  -o smtpd_tls_security_level=encrypt
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_client_restrictions=permit_sasl_authenticated,reject

smtps     inet  n       -       y       -       -       smtpd
  -o syslog_name=postfix/smtps
  -o smtpd_tls_wrappermode=yes
  -o smtpd_sasl_auth_enable=yes
  -o smtpd_client_restrictions=permit_sasl_authenticated,reject
EOF
fi

# Configure Dovecot
echo -e "${YELLOW}Configuring Dovecot...${NC}"

# Dovecot SQL config
cat > /etc/dovecot/dovecot-sql.conf.ext << EOF
driver = mysql
connect = host=127.0.0.1 dbname=$DB_NAME user=$DB_USER password=$DB_PASSWORD
default_pass_scheme = PLAIN
password_query = SELECT email as user, password FROM virtual_users WHERE email='%u'
user_query = SELECT email as user, 'maildir:/var/vmail/%d/%n' as mail, $VMAIL_UID AS uid, $VMAIL_GID AS gid FROM virtual_users WHERE email='%u'
EOF

chmod 640 /etc/dovecot/dovecot-sql.conf.ext
chown root:dovecot /etc/dovecot/dovecot-sql.conf.ext

# Update mail location
sed -i 's|^mail_location.*|mail_location = maildir:/var/vmail/%d/%n|' /etc/dovecot/conf.d/10-mail.conf

# Update auth settings
sed -i 's|^!include auth-system.conf.ext|#!include auth-system.conf.ext|' /etc/dovecot/conf.d/10-auth.conf
sed -i 's|^#!include auth-sql.conf.ext|!include auth-sql.conf.ext|' /etc/dovecot/conf.d/10-auth.conf
sed -i 's|^#auth_mechanisms|auth_mechanisms|' /etc/dovecot/conf.d/10-auth.conf
sed -i 's|^#disable_plaintext_auth|disable_plaintext_auth|' /etc/dovecot/conf.d/10-auth.conf

# Configure LMTP and auth sockets
if ! grep -q "service lmtp {" /etc/dovecot/conf.d/10-master.conf; then
  cat >> /etc/dovecot/conf.d/10-master.conf << 'EOF'

service lmtp {
  unix_listener /var/spool/postfix/private/dovecot-lmtp {
    mode = 0600
    user = postfix
    group = postfix
  }
}

service auth {
  unix_listener /var/spool/postfix/private/auth {
    mode = 0660
    user = postfix
    group = postfix
  }
  unix_listener auth-userdb {
    mode = 0600
    user = vmail
  }
  user = dovecot
}

service auth-worker {
  user = vmail
}
EOF
fi

# Setup API
echo -e "${YELLOW}Setting up REST API...${NC}"
mkdir -p /opt/mailserver-api

# Copy API files from templates directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
TEMPLATE_DIR="$SCRIPT_DIR/../templates"

if [ -f "$TEMPLATE_DIR/server.js" ]; then
  cp "$TEMPLATE_DIR/server.js" /opt/mailserver-api/
  cp "$TEMPLATE_DIR/package.json" /opt/mailserver-api/
else
  echo -e "${RED}Error: Template files not found in $TEMPLATE_DIR${NC}"
  exit 1
fi

# Create .env file
cat > /opt/mailserver-api/.env << EOF
DB_HOST=127.0.0.1
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME
PORT=$API_PORT
EOF

# Install API dependencies
cd /opt/mailserver-api
npm install --silent > /dev/null 2>&1

# Create systemd service
cat > /etc/systemd/system/mailserver-api.service << 'EOF'
[Unit]
Description=Mail Server REST API
After=network.target mysql.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/mailserver-api
ExecStart=/usr/bin/node /opt/mailserver-api/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Enable and start services
echo -e "${YELLOW}Starting services...${NC}"
systemctl daemon-reload
systemctl enable postfix dovecot mailserver-api > /dev/null 2>&1
systemctl restart postfix dovecot mailserver-api

# Wait for services to start
sleep 2

# Check service status
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Installation Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

echo -e "\n${YELLOW}Service Status:${NC}"
systemctl is-active --quiet postfix && echo -e "Postfix:        ${GREEN}✓ Running${NC}" || echo -e "Postfix:        ${RED}✗ Failed${NC}"
systemctl is-active --quiet dovecot && echo -e "Dovecot:        ${GREEN}✓ Running${NC}" || echo -e "Dovecot:        ${RED}✗ Failed${NC}"
systemctl is-active --quiet mailserver-api && echo -e "API:            ${GREEN}✓ Running${NC}" || echo -e "API:            ${RED}✗ Failed${NC}"

# Get server IP
SERVER_IP=$(hostname -I | awk '{print $1}')

echo -e "\n${YELLOW}Configuration:${NC}"
echo -e "Domain:         $DOMAIN"
echo -e "Hostname:       $HOSTNAME"
echo -e "API URL:        http://$SERVER_IP:$API_PORT"
echo -e "Database:       $DB_NAME"
echo -e "DB User:        $DB_USER"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo "1. Generate API key:"
echo "   curl -X POST http://localhost:$API_PORT/api-keys -H 'x-api-key: default_key_change_me' -H 'Content-Type: application/json' -d '{\"description\":\"Production Key\"}'"
echo ""
echo "2. Add your domain:"
echo "   curl -X POST http://localhost:$API_PORT/domains -H 'x-api-key: YOUR_API_KEY' -H 'Content-Type: application/json' -d '{\"domain\":\"$DOMAIN\"}'"
echo ""
echo "3. Create mailbox:"
echo "   curl -X POST http://localhost:$API_PORT/mailboxes -H 'x-api-key: YOUR_API_KEY' -H 'Content-Type: application/json' -d '{\"email\":\"user@$DOMAIN\",\"password\":\"password123\"}'"
echo ""
echo "4. Configure DNS records (A, MX, SPF, DKIM, DMARC)"
echo ""
echo -e "${GREEN}========================================${NC}"
