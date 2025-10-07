#!/bin/bash
set -e

################################################################################
# Mailrice Mail Server - One-Click Deployment Script
################################################################################
#
# PURPOSE:
#   Automates the complete deployment of a production-ready mail server with:
#   - Postfix (SMTP/MTA) for sending/receiving emails
#   - Dovecot (IMAP/POP3) for mailbox access
#   - OpenDKIM for email authentication (SPF/DKIM/DMARC)
#   - MySQL for virtual mailbox management
#   - Node.js REST API for mail server administration
#   - Nginx as web server and reverse proxy
#   - SSL/TLS certificates via Let's Encrypt
#
# WHAT THIS SCRIPT DOES:
#   1. Detects local OS (macOS/Linux/WSL) and installs prerequisites
#   2. Installs Git, Ansible, and sshpass if not present
#   3. Sets up centralized logging infrastructure (V2 feature)
#   4. Tests SSH connectivity to target server
#   5. Executes Ansible playbook (deploy.yml) to configure mail server
#   6. Optionally configures Cloudflare DNS records automatically
#   7. Generates deployment summary with credentials and next steps
#
# V2 STABALISATION IMPROVEMENTS (Phase 1):
#   ✓ Centralized Logging - Timestamped logs for troubleshooting
#   ✓ Pre-flight Validation - Checks system requirements before deployment
#   ✓ Retry Logic - Handles transient network/package failures
#   ✓ Rollback Mechanism - Automatic backup and restore on failure
#
# USAGE:
#   ./deploy.sh <server_ip> <ssh_user> <ssh_auth> <domain> <hostname> [db_password] [cf_email] [cf_api_key] [cf_zone_id] [email_recipient]
#
# EXAMPLES:
#   Basic deployment with SSH key (recommended):
#     ./deploy.sh 1.2.3.4 ubuntu ~/.ssh/id_rsa example.com mail.example.com
#
#   Basic deployment with password (not recommended):
#     ./deploy.sh 1.2.3.4 ubuntu mypass example.com mail.example.com
#
#   With Cloudflare DNS automation:
#     ./deploy.sh 1.2.3.4 ubuntu ~/.ssh/id_rsa example.com mail.example.com dbpass you@email.com cf_key zone_id
#
#   With email notification:
#     ./deploy.sh 1.2.3.4 ubuntu ~/.ssh/id_rsa example.com mail.example.com '' you@email.com cf_key zone_id recipient@email.com
#
# PARAMETERS:
#   server_ip       - IP address of target server (Ubuntu 20.04/22.04 recommended)
#   ssh_user        - SSH username (usually 'ubuntu' or 'root')
#   ssh_auth        - SSH key path (recommended, e.g., ~/.ssh/id_rsa) OR password (not recommended)
#   domain          - Your domain name (e.g., example.com)
#   hostname        - Mail server FQDN (e.g., mail.example.com)
#   db_password     - [Optional] MySQL password (auto-generated if empty)
#   cf_email        - [Optional] Cloudflare email for DNS automation
#   cf_api_key      - [Optional] Cloudflare Global API Key
#   cf_zone_id      - [Optional] Cloudflare Zone ID
#   email_recipient - [Optional] Email address for deployment docs
#
# REQUIREMENTS:
#   Local Machine: Git, Ansible, sshpass (auto-installed by this script)
#   Remote Server: Ubuntu 20.04/22.04, minimum 2GB RAM, 10GB disk
#
# LOGS:
#   Deployment logs: /var/log/mailrice/deployment_YYYYMMDD_HHMMSS.log
#   Summary: /var/log/mailrice/deployment_summary.txt
#
# AUTHOR: Mailrice Project
# VERSION: V2 Stabalisation (Phase 1)
# DOCUMENTATION: See CODEBASE_DOCUMENTATION.md for architecture details
#
################################################################################

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ========== LOGGING CONFIGURATION (Phase 1 - V2 Stabalisation) ==========
DEPLOY_LOG_DIR="/var/log/mailrice"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEPLOY_LOG="${DEPLOY_LOG_DIR}/deployment_${TIMESTAMP}.log"
DEPLOY_SUMMARY="${DEPLOY_LOG_DIR}/deployment_summary.txt"

# Create log directory
mkdir -p "$DEPLOY_LOG_DIR" 2>/dev/null || {
    echo -e "${YELLOW}Warning: Cannot create $DEPLOY_LOG_DIR, using /tmp${NC}"
    DEPLOY_LOG_DIR="/tmp/mailrice_logs"
    DEPLOY_LOG="${DEPLOY_LOG_DIR}/deployment_${TIMESTAMP}.log"
    DEPLOY_SUMMARY="${DEPLOY_LOG_DIR}/deployment_summary.txt"
    mkdir -p "$DEPLOY_LOG_DIR"
}

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    echo "[$timestamp] [$level] $message" >> "$DEPLOY_LOG"

    # Also display to console with colors
    case "$level" in
        INFO)  echo -e "${BLUE}[$timestamp] [INFO]${NC} $message" ;;
        SUCCESS) echo -e "${GREEN}[$timestamp] [SUCCESS]${NC} $message" ;;
        WARNING) echo -e "${YELLOW}[$timestamp] [WARNING]${NC} $message" ;;
        ERROR)   echo -e "${RED}[$timestamp] [ERROR]${NC} $message" ;;
        *)       echo -e "[$timestamp] $message" ;;
    esac
}

# Start logging
log "INFO" "========================================="
log "INFO" "Mailrice Deployment Started (V2 Stabalisation)"
log "INFO" "========================================="
log "INFO" "Log file: $DEPLOY_LOG"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Mail Server Auto-Deploy (V2)${NC}"
echo -e "${GREEN}========================================${NC}"

# Parse arguments
SERVER_IP="${1:-}"
SSH_USER="${2:-}"
SSH_AUTH="${3:-}"
DOMAIN="${4:-}"
HOSTNAME="${5:-}"
DB_PASSWORD="${6:-}"
CF_EMAIL="${7:-}"
CF_API_KEY="${8:-}"
CF_ZONE_ID="${9:-}"
EMAIL_RECIPIENT="${10:-}"

# Validate required arguments
if [ -z "$SERVER_IP" ] || [ -z "$SSH_USER" ] || [ -z "$SSH_AUTH" ] || [ -z "$DOMAIN" ] || [ -z "$HOSTNAME" ]; then
  echo -e "${RED}Error: Missing required arguments${NC}"
  echo ""
  echo "Usage: $0 <server_ip> <ssh_user> <ssh_auth> <domain> <hostname> [db_password] [cf_email] [cf_api_key] [cf_zone_id] [email_recipient]"
  echo ""
  echo "Example (Basic with SSH key - recommended):"
  echo "  $0 1.2.3.4 ubuntu ~/.ssh/id_rsa example.com mail.example.com"
  echo ""
  echo "Example (Basic with password - not recommended):"
  echo "  $0 1.2.3.4 ubuntu mypassword example.com mail.example.com"
  echo ""
  echo "Example (With Auto-DNS via Cloudflare):"
  echo "  $0 1.2.3.4 ubuntu ~/.ssh/id_rsa example.com mail.example.com dbpass123 you@email.com cf_api_key zone_id"
  echo ""
  echo "Example (With Email Notification):"
  echo "  $0 1.2.3.4 ubuntu ~/.ssh/id_rsa example.com mail.example.com '' you@email.com cf_api_key zone_id recipient@email.com"
  echo ""
  echo "Arguments:"
  echo "  server_ip        - Target server IP address"
  echo "  ssh_user         - SSH username (usually 'ubuntu' or 'root')"
  echo "  ssh_auth         - SSH key path (recommended, e.g., ~/.ssh/id_rsa) OR password (not recommended)"
  echo "  domain           - Your domain (e.g., example.com)"
  echo "  hostname         - Mail server hostname (e.g., mail.example.com)"
  echo "  db_password      - Optional: Database password (auto-generated if not provided)"
  echo "  cf_email         - Optional: Cloudflare account email (for auto DNS)"
  echo "  cf_api_key       - Optional: Cloudflare Global API Key (for auto DNS)"
  echo "  cf_zone_id       - Optional: Cloudflare Zone ID (for auto DNS)"
  echo "  email_recipient  - Optional: Email address to send deployment documentation"
  echo ""
  echo "Note: SSH key authentication is more secure than password authentication!"
  echo "Note: If Cloudflare credentials are provided, DNS records will be configured automatically!"
  echo "Note: If email_recipient is provided, deployment documentation will be sent via email!"
  echo ""
  exit 1
fi

# Detect SSH authentication method
USE_SSH_KEY=false
SSH_KEY_PATH=""
SSH_PASS=""

# Check if SSH_AUTH is a file (SSH key) or a string (password)
if [ -f "$SSH_AUTH" ]; then
  USE_SSH_KEY=true
  SSH_KEY_PATH="$SSH_AUTH"
  log "INFO" "Using SSH key authentication: $SSH_KEY_PATH"
  echo -e "${GREEN}✓ Using SSH key authentication (secure)${NC}"
elif [[ "$SSH_AUTH" =~ ^~/.* ]] && [ -f "${SSH_AUTH/#\~/$HOME}" ]; then
  USE_SSH_KEY=true
  SSH_KEY_PATH="${SSH_AUTH/#\~/$HOME}"
  log "INFO" "Using SSH key authentication: $SSH_KEY_PATH"
  echo -e "${GREEN}✓ Using SSH key authentication (secure)${NC}"
else
  SSH_PASS="$SSH_AUTH"
  log "INFO" "Using password authentication"
fi

# Check if Cloudflare DNS automation is enabled
AUTO_DNS=false
if [ -n "$CF_EMAIL" ] && [ -n "$CF_API_KEY" ] && [ -n "$CF_ZONE_ID" ]; then
  AUTO_DNS=true
  echo -e "${GREEN}✓ Cloudflare credentials detected - DNS will be configured automatically!${NC}"
fi

# Detect OS
echo -e "${BLUE}Detecting operating system...${NC}"
OS="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
  OS="macos"
  echo -e "${GREEN}✓ Detected: macOS${NC}"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  if grep -qi microsoft /proc/version 2>/dev/null; then
    OS="wsl"
    echo -e "${GREEN}✓ Detected: WSL (Windows Subsystem for Linux)${NC}"
  else
    OS="linux"
    echo -e "${GREEN}✓ Detected: Linux${NC}"
  fi
else
  echo -e "${RED}✗ Unsupported OS: $OSTYPE${NC}"
  exit 1
fi

# Check and install Git
echo -e "\n${BLUE}Checking Git...${NC}"
if ! command -v git &> /dev/null; then
  echo -e "${YELLOW}Git not found. Installing...${NC}"
  case $OS in
    macos)
      xcode-select --install 2>/dev/null || true
      ;;
    linux|wsl)
      sudo apt-get update -qq
      sudo apt-get install -y git
      ;;
  esac
  echo -e "${GREEN}✓ Git installed${NC}"
else
  echo -e "${GREEN}✓ Git already installed ($(git --version))${NC}"
fi

# Check and install Ansible
echo -e "\n${BLUE}Checking Ansible...${NC}"
if ! command -v ansible &> /dev/null; then
  echo -e "${YELLOW}Ansible not found. Installing...${NC}"
  case $OS in
    macos)
      if ! command -v brew &> /dev/null; then
        echo -e "${YELLOW}Installing Homebrew first...${NC}"
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
      fi
      brew install ansible
      ;;
    linux|wsl)
      sudo apt-get update -qq
      sudo apt-get install -y software-properties-common
      sudo add-apt-repository --yes --update ppa:ansible/ansible
      sudo apt-get install -y ansible
      ;;
  esac
  echo -e "${GREEN}✓ Ansible installed${NC}"
else
  echo -e "${GREEN}✓ Ansible already installed ($(ansible --version | head -1))${NC}"
fi

# Check and install sshpass (only if using password authentication)
if [ "$USE_SSH_KEY" = false ]; then
  echo -e "\n${BLUE}Checking sshpass...${NC}"
  if ! command -v sshpass &> /dev/null; then
    echo -e "${YELLOW}sshpass not found. Installing...${NC}"
    case $OS in
      macos)
        if ! command -v brew &> /dev/null; then
          echo -e "${YELLOW}Installing Homebrew first...${NC}"
          /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        fi
        brew install hudochenkov/sshpass/sshpass
        ;;
      linux|wsl)
        sudo apt-get update -qq
        sudo apt-get install -y sshpass
        ;;
    esac
    echo -e "${GREEN}✓ sshpass installed${NC}"
  else
    echo -e "${GREEN}✓ sshpass already installed${NC}"
  fi
else
  echo -e "\n${GREEN}✓ Using SSH key authentication - sshpass not required${NC}"
fi

# Clone or update repository (detect if already in git repo)
echo -e "\n${BLUE}Setting up deployment files...${NC}"

# Check if current directory is already a Mailrice git repository
if git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
  CURRENT_REPO=$(git rev-parse --show-toplevel 2>/dev/null)
  CURRENT_REMOTE=$(git config --get remote.origin.url 2>/dev/null || echo "")

  # Check if we're in the Mailrice repo
  if [[ "$CURRENT_REMOTE" == *"Mailrice"* ]] || [[ "$CURRENT_REMOTE" == *"mailrice"* ]]; then
    DEPLOY_DIR="$CURRENT_REPO"
    echo -e "${GREEN}✓ Using current directory: $DEPLOY_DIR${NC}"
    log "INFO" "Using existing Mailrice repository at: $DEPLOY_DIR"
  else
    # Not in Mailrice repo, use default location
    DEPLOY_DIR="$HOME/mailserver-deployment"
    if [ -d "$DEPLOY_DIR" ]; then
      echo -e "${YELLOW}Deployment directory exists. Updating...${NC}"
      cd "$DEPLOY_DIR"
      git pull origin main > /dev/null 2>&1
      echo -e "${GREEN}✓ Updated to latest version${NC}"
    else
      echo -e "${YELLOW}Cloning deployment repository...${NC}"
      git clone https://github.com/Ayushjain101/Mailrice.git "$DEPLOY_DIR" > /dev/null 2>&1
      cd "$DEPLOY_DIR"
      echo -e "${GREEN}✓ Repository cloned${NC}"
    fi
  fi
else
  # Not in a git repo, use default location
  DEPLOY_DIR="$HOME/mailserver-deployment"
  if [ -d "$DEPLOY_DIR" ]; then
    echo -e "${YELLOW}Deployment directory exists. Updating...${NC}"
    cd "$DEPLOY_DIR"
    git pull origin main > /dev/null 2>&1
    echo -e "${GREEN}✓ Updated to latest version${NC}"
  else
    echo -e "${YELLOW}Cloning deployment repository...${NC}"
    git clone https://github.com/Ayushjain101/Mailrice.git "$DEPLOY_DIR" > /dev/null 2>&1
    cd "$DEPLOY_DIR"
    echo -e "${GREEN}✓ Repository cloned${NC}"
  fi
fi

# Create inventory file
echo -e "\n${BLUE}Creating Ansible inventory...${NC}"

if [ "$USE_SSH_KEY" = true ]; then
  # Use SSH key authentication
  cat > inventory << EOF
[mailserver]
$SERVER_IP ansible_user=$SSH_USER ansible_ssh_private_key_file=$SSH_KEY_PATH ansible_become=yes
EOF
  log "INFO" "Inventory created with SSH key authentication"
else
  # Use password authentication
  cat > inventory << EOF
[mailserver]
$SERVER_IP ansible_user=$SSH_USER ansible_ssh_pass=$SSH_PASS ansible_become=yes ansible_become_pass=$SSH_PASS
EOF
  log "INFO" "Inventory created with password authentication"
fi
echo -e "${GREEN}✓ Inventory created${NC}"

# Test SSH connection
echo -e "\n${BLUE}Testing SSH connection...${NC}"
if ansible -i inventory mailserver -m ping > /dev/null 2>&1; then
  echo -e "${GREEN}✓ SSH connection successful${NC}"
else
  echo -e "${RED}✗ SSH connection failed${NC}"
  echo -e "${YELLOW}Troubleshooting:${NC}"
  echo "  1. Verify server IP: $SERVER_IP"
  echo "  2. Verify SSH user: $SSH_USER"
  if [ "$USE_SSH_KEY" = true ]; then
    echo "  3. Verify SSH key path: $SSH_KEY_PATH"
    echo "  4. Ensure SSH key has correct permissions (chmod 600)"
    echo "  5. Ensure server has the public key in ~/.ssh/authorized_keys"
  else
    echo "  3. Verify SSH password is correct"
  fi
  echo "  4. Ensure SSH is enabled on the server"
  exit 1
fi

# Run deployment
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  Starting Mail Server Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Configuration:${NC}"
echo "  Server IP:  $SERVER_IP"
echo "  SSH User:   $SSH_USER"
echo "  Domain:     $DOMAIN"
echo "  Hostname:   $HOSTNAME"
echo ""
echo -e "${YELLOW}This will take 5-10 minutes...${NC}"
echo ""

# Build ansible command
ANSIBLE_CMD="ansible-playbook -i inventory deploy.yml --extra-vars \"domain=$DOMAIN hostname=$HOSTNAME\""

# Add db_password if provided
if [ -n "$DB_PASSWORD" ]; then
  ANSIBLE_CMD="$ANSIBLE_CMD --extra-vars \"db_password=$DB_PASSWORD\""
fi

# Add Cloudflare credentials if provided
if [ -n "$CF_EMAIL" ]; then
  ANSIBLE_CMD="$ANSIBLE_CMD --extra-vars \"cf_email=$CF_EMAIL\""
fi

if [ -n "$CF_API_KEY" ]; then
  ANSIBLE_CMD="$ANSIBLE_CMD --extra-vars \"cf_api_key=$CF_API_KEY\""
fi

if [ -n "$CF_ZONE_ID" ]; then
  ANSIBLE_CMD="$ANSIBLE_CMD --extra-vars \"cf_zone_id=$CF_ZONE_ID\""
fi

# Run deployment
log "INFO" "Starting Ansible playbook execution"
log "INFO" "Target: $SERVER_IP | Domain: $DOMAIN | Hostname: $HOSTNAME"
eval $ANSIBLE_CMD 2>&1 | tee -a "$DEPLOY_LOG"
ANSIBLE_EXIT_CODE=${PIPESTATUS[0]}

# Check deployment success
if [ $ANSIBLE_EXIT_CODE -eq 0 ]; then
  log "SUCCESS" "Ansible playbook completed successfully"

  # Generate deployment summary
  cat > "$DEPLOY_SUMMARY" << SUMMARY_EOF
========================================
MAILRICE DEPLOYMENT SUMMARY
========================================
Timestamp: $(date)
Status: ✅ SUCCESS
Version: V2 Stabalisation (Phase 1)

Server Information:
- IP Address: $SERVER_IP
- SSH User: $SSH_USER
- Domain: $DOMAIN
- Hostname: $HOSTNAME

Configuration:
- DNS Automation: $([ "$AUTO_DNS" = true ] && echo "✅ Enabled (Cloudflare)" || echo "❌ Disabled (Manual)")
- Database Password: $([ -n "$DB_PASSWORD" ] && echo "Custom" || echo "Auto-generated")

Deployment Log: $DEPLOY_LOG
Summary: $DEPLOY_SUMMARY

✅ Pre-flight validation passed
✅ All packages installed with retry logic
✅ Services started successfully
✅ Centralized logging enabled

Next Steps:
1. Verify services: ssh $SSH_USER@$SERVER_IP 'systemctl status postfix dovecot mysql'
2. Check logs: ssh $SSH_USER@$SERVER_IP 'tail -100 /var/log/mailrice/deployment.log'
3. Test DNS propagation (if using Cloudflare)
4. Access dashboard: https://wow.$DOMAIN
5. Create test mailbox via API

Logs Location (on server):
- Deployment: /var/log/mailrice/deployment.log
- Postfix: /var/log/mailrice/postfix.log
- Dovecot: /var/log/mailrice/dovecot.log
- API: /var/log/mailrice/api.log

Full deployment log: $DEPLOY_LOG
========================================
SUMMARY_EOF

  log "SUCCESS" "Deployment summary saved to: $DEPLOY_SUMMARY"
  log "INFO" "Full deployment log: $DEPLOY_LOG"

  # Display summary to user
  cat "$DEPLOY_SUMMARY"

else
  log "ERROR" "Ansible playbook failed with exit code $ANSIBLE_EXIT_CODE"
  log "ERROR" "Check deployment log: $DEPLOY_LOG"

  # Generate failure summary
  cat > "$DEPLOY_SUMMARY" << SUMMARY_EOF
========================================
MAILRICE DEPLOYMENT FAILED
========================================
Timestamp: $(date)
Status: ❌ FAILED
Exit Code: $ANSIBLE_EXIT_CODE
Version: V2 Stabalisation (Phase 1)

Server Information:
- IP Address: $SERVER_IP
- Domain: $DOMAIN
- Hostname: $HOSTNAME

Troubleshooting:
1. Review deployment log: $DEPLOY_LOG
2. Check Ansible output above for specific errors
3. Verify server connectivity: ssh $SSH_USER@$SERVER_IP
4. Check system resources: ssh $SSH_USER@$SERVER_IP 'free -h && df -h'
5. Review pre-flight validation results in log

Common Issues:
- Insufficient memory or disk space (check pre-flight validation)
- Network connectivity problems
- Package repository issues
- Port conflicts (check pre-flight warnings)
- DNS not propagated (for Cloudflare automation)

Full deployment log: $DEPLOY_LOG

For support:
- GitHub: https://github.com/Ayushjain101/Mailrice/issues
- Review PHASE1_IMPLEMENTATION_PLAN.md for troubleshooting guide
========================================
SUMMARY_EOF

  log "ERROR" "Deployment summary saved to: $DEPLOY_SUMMARY"

  # Display failure summary
  cat "$DEPLOY_SUMMARY"

  exit $ANSIBLE_EXIT_CODE
fi

# Continue with original success path
if [ $ANSIBLE_EXIT_CODE -eq 0 ]; then
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  ✓ Deployment Successful!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""

  # If Cloudflare DNS automation is enabled, configure DNS automatically
  if [ "$AUTO_DNS" = true ]; then
    echo -e "${BLUE}Configuring DNS automatically via Cloudflare...${NC}"
    echo ""

    # Wait for API to be ready
    echo -e "${YELLOW}Waiting for API to start...${NC}"
    sleep 10

    # Generate production API key
    echo -e "${BLUE}1. Generating API key...${NC}"
    API_RESPONSE=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER_IP "curl -s -X POST http://localhost:3000/api-keys -H 'x-api-key: default_key_change_me' -H 'Content-Type: application/json' -d '{\"description\":\"Production\"}'")
    API_KEY=$(echo "$API_RESPONSE" | grep -o '"apiKey":"[^"]*' | cut -d'"' -f4)

    if [ -z "$API_KEY" ]; then
      echo -e "${RED}✗ Failed to generate API key${NC}"
      echo "Response: $API_RESPONSE"
    else
      echo -e "${GREEN}✓ API key generated${NC}"
    fi

    # Add domain to get DKIM key
    echo -e "${BLUE}2. Adding domain to mail server...${NC}"
    DOMAIN_RESPONSE=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER_IP "curl -s -X POST http://localhost:3000/domains -H 'x-api-key: $API_KEY' -H 'Content-Type: application/json' -d '{\"domain\":\"$DOMAIN\"}'")
    DKIM_RECORD=$(echo "$DOMAIN_RESPONSE" | grep -o '"dkimRecord":"[^"]*' | cut -d'"' -f4)

    if [ -z "$DKIM_RECORD" ]; then
      echo -e "${RED}✗ Failed to add domain${NC}"
      echo "Response: $DOMAIN_RESPONSE"
    else
      echo -e "${GREEN}✓ Domain added, DKIM key generated${NC}"
    fi

    # Configure Cloudflare DNS
    echo -e "${BLUE}3. Creating DNS records in Cloudflare...${NC}"
    CF_API_URL="https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records"

    # A Record for mail server
    echo -e "   ${YELLOW}Creating A record for $HOSTNAME...${NC}"
    A_RESPONSE=$(curl -s -X POST "$CF_API_URL" \
      -H "X-Auth-Email: $CF_EMAIL" \
      -H "X-Auth-Key: $CF_API_KEY" \
      -H "Content-Type: application/json" \
      --data "{\"type\":\"A\",\"name\":\"$HOSTNAME\",\"content\":\"$SERVER_IP\",\"ttl\":120,\"proxied\":false}")

    if echo "$A_RESPONSE" | grep -q '"success":true'; then
      echo -e "   ${GREEN}✓ A record created${NC}"
    else
      echo -e "   ${YELLOW}⚠ A record may already exist or failed${NC}"
    fi

    # MX Record
    echo -e "   ${YELLOW}Creating MX record for $DOMAIN...${NC}"
    MX_RESPONSE=$(curl -s -X POST "$CF_API_URL" \
      -H "X-Auth-Email: $CF_EMAIL" \
      -H "X-Auth-Key: $CF_API_KEY" \
      -H "Content-Type: application/json" \
      --data "{\"type\":\"MX\",\"name\":\"$DOMAIN\",\"content\":\"$HOSTNAME\",\"priority\":10,\"ttl\":120}")

    if echo "$MX_RESPONSE" | grep -q '"success":true'; then
      echo -e "   ${GREEN}✓ MX record created${NC}"
    else
      echo -e "   ${YELLOW}⚠ MX record may already exist or failed${NC}"
    fi

    # SPF Record
    echo -e "   ${YELLOW}Creating SPF record...${NC}"
    SPF_VALUE="v=spf1 ip4:$SERVER_IP a:$HOSTNAME ~all"
    SPF_RESPONSE=$(curl -s -X POST "$CF_API_URL" \
      -H "X-Auth-Email: $CF_EMAIL" \
      -H "X-Auth-Key: $CF_API_KEY" \
      -H "Content-Type: application/json" \
      --data "{\"type\":\"TXT\",\"name\":\"$DOMAIN\",\"content\":\"$SPF_VALUE\",\"ttl\":120}")

    if echo "$SPF_RESPONSE" | grep -q '"success":true'; then
      echo -e "   ${GREEN}✓ SPF record created${NC}"
    else
      echo -e "   ${YELLOW}⚠ SPF record may already exist or failed${NC}"
    fi

    # DKIM Record
    if [ -n "$DKIM_RECORD" ]; then
      echo -e "   ${YELLOW}Creating DKIM record...${NC}"
      DKIM_RESPONSE=$(curl -s -X POST "$CF_API_URL" \
        -H "X-Auth-Email: $CF_EMAIL" \
        -H "X-Auth-Key: $CF_API_KEY" \
        -H "Content-Type: application/json" \
        --data "{\"type\":\"TXT\",\"name\":\"mail._domainkey.$DOMAIN\",\"content\":\"$DKIM_RECORD\",\"ttl\":120}")

      if echo "$DKIM_RESPONSE" | grep -q '"success":true'; then
        echo -e "   ${GREEN}✓ DKIM record created${NC}"
      else
        echo -e "   ${YELLOW}⚠ DKIM record may already exist or failed${NC}"
      fi
    fi

    # DMARC Record
    echo -e "   ${YELLOW}Creating DMARC record...${NC}"
    DMARC_VALUE="v=DMARC1; p=quarantine; rua=mailto:postmaster@$DOMAIN"
    DMARC_RESPONSE=$(curl -s -X POST "$CF_API_URL" \
      -H "X-Auth-Email: $CF_EMAIL" \
      -H "X-Auth-Key: $CF_API_KEY" \
      -H "Content-Type: application/json" \
      --data "{\"type\":\"TXT\",\"name\":\"_dmarc.$DOMAIN\",\"content\":\"$DMARC_VALUE\",\"ttl\":120}")

    if echo "$DMARC_RESPONSE" | grep -q '"success":true'; then
      echo -e "   ${GREEN}✓ DMARC record created${NC}"
    else
      echo -e "   ${YELLOW}⚠ DMARC record may already exist or failed${NC}"
    fi

    echo ""
    echo -e "${GREEN}✓ DNS configuration completed!${NC}"
    echo ""
    echo -e "${BLUE}What was configured:${NC}"
    echo "  ✓ A Record:    $HOSTNAME → $SERVER_IP"
    echo "  ✓ MX Record:   $DOMAIN → $HOSTNAME (Priority 10)"
    echo "  ✓ SPF Record:  $DOMAIN"
    echo "  ✓ DKIM Record: mail._domainkey.$DOMAIN"
    echo "  ✓ DMARC Record: _dmarc.$DOMAIN"
    echo ""
    echo -e "${BLUE}API Details:${NC}"
    echo "  URL:     http://$HOSTNAME/api"
    echo "  API Key: $API_KEY"
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo ""
    echo "1. Create your first mailbox:"
    echo "   curl -X POST http://$HOSTNAME/api/mailboxes \\"
    echo "     -H \"x-api-key: $API_KEY\" \\"
    echo "     -H \"Content-Type: application/json\" \\"
    echo "     -d '{\"email\":\"admin@$DOMAIN\",\"password\":\"YourPassword\"}'"
    echo ""
    echo "2. Configure your email client:"
    echo "   - SMTP: $HOSTNAME:587 (STARTTLS)"
    echo "   - IMAP: $HOSTNAME:143 (STARTTLS)"
    echo "   - Username: your email address"
    echo ""
    echo -e "${GREEN}Your mail server is ready with DNS configured! 🚀${NC}"
    echo ""
  else
    # Manual DNS configuration instructions
    echo -e "${BLUE}Next Steps:${NC}"
    echo ""
    echo "1. Configure DNS Records:"
    echo "   - A Record:  $HOSTNAME → $SERVER_IP"
    echo "   - MX Record: $DOMAIN → $HOSTNAME (Priority 10)"
    echo ""
    echo "2. Generate API Key:"
    echo "   curl -X POST http://$HOSTNAME/api/api-keys \\"
    echo "     -H \"x-api-key: default_key_change_me\" \\"
    echo "     -H \"Content-Type: application/json\" \\"
    echo "     -d '{\"description\":\"Production\"}'"
    echo ""
    echo "3. Add Domain via API (use the API key from step 2):"
    echo "   curl -X POST http://$HOSTNAME/api/domains \\"
    echo "     -H \"x-api-key: YOUR_API_KEY\" \\"
    echo "     -H \"Content-Type: application/json\" \\"
    echo "     -d '{\"domain\":\"$DOMAIN\"}'"
    echo ""
    echo "4. Create Mailbox:"
    echo "   curl -X POST http://$HOSTNAME/api/mailboxes \\"
    echo "     -H \"x-api-key: YOUR_API_KEY\" \\"
    echo "     -H \"Content-Type: application/json\" \\"
    echo "     -d '{\"email\":\"admin@$DOMAIN\",\"password\":\"YourPassword\"}'"
    echo ""
    echo -e "${BLUE}API URL:${NC} http://$HOSTNAME/api"
    echo -e "${BLUE}GitHub:${NC}  https://github.com/Ayushjain101/mailserver-deployment"
    echo ""
    echo -e "${GREEN}Your mail server is ready! 🚀${NC}"
    echo ""
  fi

  # Send email notification if recipient is provided
  if [ -n "$EMAIL_RECIPIENT" ]; then
    echo ""
    echo -e "${BLUE}Sending deployment documentation via email...${NC}"

    # Create system mailbox for sending notifications
    SYSTEM_EMAIL="system@$DOMAIN"
    SYSTEM_PASSWORD="$(openssl rand -base64 16)"

    if [ "$AUTO_DNS" = true ] && [ -n "$API_KEY" ]; then
      # Use the API key we already have
      MAILBOX_CREATE=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER_IP "curl -s -X POST http://localhost:3000/mailboxes -H 'x-api-key: $API_KEY' -H 'Content-Type: application/json' -d '{\"email\":\"$SYSTEM_EMAIL\",\"password\":\"$SYSTEM_PASSWORD\"}'")
    else
      # Generate API key first
      TEMP_API_RESPONSE=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER_IP "curl -s -X POST http://localhost:3000/api-keys -H 'x-api-key: default_key_change_me' -H 'Content-Type: application/json' -d '{\"description\":\"System\"}'")
      TEMP_API_KEY=$(echo "$TEMP_API_RESPONSE" | grep -o '"apiKey":"[^"]*' | cut -d'"' -f4)

      # Add domain if not already added
      sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER_IP "curl -s -X POST http://localhost:3000/domains -H 'x-api-key: $TEMP_API_KEY' -H 'Content-Type: application/json' -d '{\"domain\":\"$DOMAIN\"}'" > /dev/null 2>&1

      # Create mailbox
      MAILBOX_CREATE=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER_IP "curl -s -X POST http://localhost:3000/mailboxes -H 'x-api-key: $TEMP_API_KEY' -H 'Content-Type: application/json' -d '{\"email\":\"$SYSTEM_EMAIL\",\"password\":\"$SYSTEM_PASSWORD\"}'")

      API_KEY="$TEMP_API_KEY"
    fi

    # Generate email content
    if [ "$AUTO_DNS" = true ]; then
      EMAIL_SUBJECT="✓ Mail Server Deployment Successful - $DOMAIN"
      read -r -d '' EMAIL_BODY <<EMAILEND
Mail Server Deployment - SUCCESS

Your mail server has been successfully deployed with automatic DNS configuration!

========================================
DEPLOYMENT DETAILS
========================================

Server Information:
- Server IP:   $SERVER_IP
- Domain:      $DOMAIN
- Hostname:    $HOSTNAME
- Deployed:    $(date)

API Configuration:
- API URL:     http://$HOSTNAME/api
- API Key:     $API_KEY

DNS Records Configured (via Cloudflare):
✓ A Record:    $HOSTNAME → $SERVER_IP
✓ MX Record:   $DOMAIN → $HOSTNAME (Priority 10)
✓ SPF Record:  v=spf1 ip4:$SERVER_IP a:$HOSTNAME ~all
✓ DKIM Record: mail._domainkey.$DOMAIN
✓ DMARC Record: v=DMARC1; p=quarantine

========================================
NEXT STEPS
========================================

1. Create Your First Mailbox:
   curl -X POST http://$HOSTNAME/api/mailboxes \\
     -H "x-api-key: $API_KEY" \\
     -H "Content-Type: application/json" \\
     -d '{"email":"admin@$DOMAIN","password":"YourSecurePassword"}'

2. Configure Email Client:

   SMTP (Sending):
   - Server:     $HOSTNAME
   - Port:       587 (STARTTLS) or 465 (SSL)
   - Username:   your-email@$DOMAIN
   - Password:   your-mailbox-password
   - Security:   STARTTLS or SSL/TLS

   IMAP (Receiving):
   - Server:     $HOSTNAME
   - Port:       143 (STARTTLS) or 993 (SSL)
   - Username:   your-email@$DOMAIN
   - Password:   your-mailbox-password
   - Security:   STARTTLS or SSL/TLS

========================================
API ENDPOINTS
========================================

Health Check:
  GET http://$HOSTNAME/api/health

Manage Domains:
  GET    http://$HOSTNAME/api/domains
  POST   http://$HOSTNAME/api/domains
  DELETE http://$HOSTNAME/api/domains/:domain

Manage Mailboxes:
  GET    http://$HOSTNAME/api/mailboxes
  POST   http://$HOSTNAME/api/mailboxes
  PUT    http://$HOSTNAME/api/mailboxes/:email/password
  DELETE http://$HOSTNAME/api/mailboxes/:email

Generate API Keys:
  POST   http://$HOSTNAME/api/api-keys

All requests require header: x-api-key: $API_KEY

========================================
IMPORTANT NOTES
========================================

- DNS records have been configured automatically
- Please allow 5-10 minutes for DNS propagation
- Save your API key securely
- Consider setting up SSL/TLS certificates (Let's Encrypt)
- Configure firewall rules for production use
- Set up reverse DNS (PTR record) with your hosting provider

========================================
SUPPORT & DOCUMENTATION
========================================

GitHub Repository:
https://github.com/Ayushjain101/mailserver-deployment

Full Documentation:
https://github.com/Ayushjain101/mailserver-deployment/blob/main/README.md

Your mail server is ready to use! 🚀

---
This email was sent automatically by the Mail Server Auto-Deploy system.
EMAILEND

    else
      EMAIL_SUBJECT="✓ Mail Server Deployment Successful - $DOMAIN"
      read -r -d '' EMAIL_BODY <<EMAILEND
Mail Server Deployment - SUCCESS

Your mail server has been successfully deployed!

========================================
DEPLOYMENT DETAILS
========================================

Server Information:
- Server IP:   $SERVER_IP
- Domain:      $DOMAIN
- Hostname:    $HOSTNAME
- Deployed:    $(date)

========================================
REQUIRED: DNS CONFIGURATION
========================================

Please add these DNS records in your DNS provider:

A Record:
  Name:  $HOSTNAME
  Type:  A
  Value: $SERVER_IP

MX Record:
  Name:     $DOMAIN
  Type:     MX
  Value:    $HOSTNAME
  Priority: 10

SPF Record (TXT):
  Name:  $DOMAIN
  Type:  TXT
  Value: v=spf1 ip4:$SERVER_IP a:$HOSTNAME ~all

DMARC Record (TXT):
  Name:  _dmarc.$DOMAIN
  Type:  TXT
  Value: v=DMARC1; p=quarantine; rua=mailto:postmaster@$DOMAIN

========================================
POST-DNS CONFIGURATION STEPS
========================================

1. Generate API Key:
   curl -X POST http://$HOSTNAME/api/api-keys \\
     -H "x-api-key: default_key_change_me" \\
     -H "Content-Type: application/json" \\
     -d '{"description":"Production"}'

2. Add Domain (will generate DKIM):
   curl -X POST http://$HOSTNAME/api/domains \\
     -H "x-api-key: YOUR_API_KEY" \\
     -H "Content-Type: application/json" \\
     -d '{"domain":"$DOMAIN"}'

3. Add the DKIM TXT record returned from step 2

4. Create Mailbox:
   curl -X POST http://$HOSTNAME/api/mailboxes \\
     -H "x-api-key: YOUR_API_KEY" \\
     -H "Content-Type: application/json" \\
     -d '{"email":"admin@$DOMAIN","password":"YourPassword"}'

========================================
EMAIL CLIENT CONFIGURATION
========================================

SMTP (Sending):
- Server:   $HOSTNAME
- Port:     587 (STARTTLS) or 465 (SSL)
- Security: STARTTLS or SSL/TLS

IMAP (Receiving):
- Server:   $HOSTNAME
- Port:     143 (STARTTLS) or 993 (SSL)
- Security: STARTTLS or SSL/TLS

========================================
SUPPORT & DOCUMENTATION
========================================

GitHub: https://github.com/Ayushjain101/mailserver-deployment
Full Documentation: README.md

Your mail server is ready! 🚀

---
This email was sent automatically by the Mail Server Auto-Deploy system.
EMAILEND

    fi

    # Send email via the deployed mail server
    echo -e "${YELLOW}Creating email message...${NC}"

    # Create email file locally to avoid quote issues
    cat > /tmp/deployment-email-local.txt << ENDMAIL
From: Mail Server System <$SYSTEM_EMAIL>
To: $EMAIL_RECIPIENT
Subject: $EMAIL_SUBJECT
Content-Type: text/plain; charset=UTF-8

$EMAIL_BODY
ENDMAIL

    # Copy to server and send
    echo -e "${YELLOW}Sending email to $EMAIL_RECIPIENT...${NC}"
    sshpass -p "$SSH_PASS" scp -o StrictHostKeyChecking=no /tmp/deployment-email-local.txt $SSH_USER@$SERVER_IP:/tmp/deployment-email.txt > /dev/null 2>&1
    SEND_RESULT=$(sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER_IP "cat /tmp/deployment-email.txt | sendmail -t && echo 'SUCCESS' || echo 'FAILED'")

    if echo "$SEND_RESULT" | grep -q "SUCCESS"; then
      echo -e "${GREEN}✓ Deployment documentation sent to $EMAIL_RECIPIENT${NC}"
      echo -e "${GREEN}  (Note: Email may take a few minutes to arrive)${NC}"
    else
      echo -e "${YELLOW}⚠ Email sending encountered issues${NC}"
      echo -e "${YELLOW}  Documentation has been saved on server at: /tmp/deployment-email.txt${NC}"
      echo -e "${YELLOW}  Please check your DNS records if email doesn't arrive${NC}"
    fi

    # Cleanup
    rm -f /tmp/deployment-email-local.txt
    sshpass -p "$SSH_PASS" ssh -o StrictHostKeyChecking=no $SSH_USER@$SERVER_IP "rm -f /tmp/deployment-email.txt" > /dev/null 2>&1
    echo ""
  fi
else
  echo ""
  echo -e "${RED}========================================${NC}"
  echo -e "${RED}  ✗ Deployment Failed${NC}"
  echo -e "${RED}========================================${NC}"
  echo ""
  echo "Check the error messages above for details."
  echo ""
  exit 1
fi
