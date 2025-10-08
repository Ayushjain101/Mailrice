#!/bin/bash
set -euo pipefail

################################################################################
# Mailrice v2 - One-Command Installer
################################################################################
#
# Usage:
#   ./install.sh --domain example.com --hostname mail.example.com \
#     --cf-email you@example.com --cf-token TOKEN --cf-zone ZONE_ID \
#     --admin-email admin@example.com --admin-password SecurePass123
#
# Or via curl:
#   curl -fsSL https://raw.githubusercontent.com/.../install.sh | sudo bash -s -- \
#     --domain example.com --hostname mail.example.com ...
#
################################################################################

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $*"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# Default values
DOMAIN=""
HOSTNAME=""
CF_EMAIL=""
CF_TOKEN=""
CF_ZONE=""
ADMIN_EMAIL=""
ADMIN_PASSWORD=""
DB_PASSWORD=""
JWT_SECRET=""
INSTALL_DIR="/opt/mailrice"
REPO_URL="https://github.com/Ayushjain101/Mailrice.git"
REPO_BRANCH="v2-rewrite"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --hostname)
            HOSTNAME="$2"
            shift 2
            ;;
        --cf-email)
            CF_EMAIL="$2"
            shift 2
            ;;
        --cf-token)
            CF_TOKEN="$2"
            shift 2
            ;;
        --cf-zone)
            CF_ZONE="$2"
            shift 2
            ;;
        --admin-email)
            ADMIN_EMAIL="$2"
            shift 2
            ;;
        --admin-password)
            ADMIN_PASSWORD="$2"
            shift 2
            ;;
        --db-password)
            DB_PASSWORD="$2"
            shift 2
            ;;
        --help)
            echo "Mailrice v2 - One-Command Installer"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Required:"
            echo "  --domain DOMAIN              Main domain (e.g., example.com)"
            echo "  --hostname HOSTNAME          Mail server hostname (e.g., mail.example.com)"
            echo ""
            echo "Optional:"
            echo "  --cf-email EMAIL             Cloudflare account email"
            echo "  --cf-token TOKEN             Cloudflare API token"
            echo "  --cf-zone ZONE_ID            Cloudflare zone ID"
            echo "  --admin-email EMAIL          Admin user email (default: admin@DOMAIN)"
            echo "  --admin-password PASS        Admin user password (auto-generated if empty)"
            echo "  --db-password PASS           Database password (auto-generated if empty)"
            echo ""
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Banner
echo -e "${GREEN}"
cat << 'EOF'
╔═══════════════════════════════════════╗
║     Mailrice v2 - Installer           ║
║  Production Email Platform            ║
╚═══════════════════════════════════════╝
EOF
echo -e "${NC}"

# Validate required arguments
if [[ -z "$DOMAIN" ]] || [[ -z "$HOSTNAME" ]]; then
    log_error "Missing required arguments: --domain and --hostname"
    echo "Run with --help for usage information"
    exit 1
fi

# Set defaults
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@$DOMAIN}"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 24)}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-$(openssl rand -base64 16)}"
JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 32)}"

# Check root privileges
if [[ $EUID -ne 0 ]]; then
   log_error "This script must be run as root (use sudo)"
   exit 1
fi

log_info "Configuration:"
echo "  Domain:          $DOMAIN"
echo "  Hostname:        $HOSTNAME"
echo "  Admin Email:     $ADMIN_EMAIL"
echo "  Cloudflare:      $([ -n "$CF_TOKEN" ] && echo "Enabled" || echo "Disabled")"
echo ""

# Confirm
read -p "Continue with installation? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warning "Installation cancelled"
    exit 0
fi

# Pre-flight checks
log_info "Running pre-flight checks..."

# Check OS
if [[ ! -f /etc/os-release ]]; then
    log_error "Cannot detect OS"
    exit 1
fi

source /etc/os-release
if [[ "$ID" != "ubuntu" ]] || [[ ! "$VERSION_ID" =~ ^(22|24) ]]; then
    log_error "This script requires Ubuntu 22.04 or 24.04"
    exit 1
fi
log_success "OS: Ubuntu $VERSION_ID"

# Check memory
TOTAL_MEM=$(free -m | awk '/^Mem:/{print $2}')
if [[ $TOTAL_MEM -lt 2048 ]]; then
    log_warning "System has less than 2GB RAM ($TOTAL_MEM MB)"
    log_warning "Deployment may fail or run slowly"
fi
log_success "Memory: ${TOTAL_MEM}MB"

# Check disk space
DISK_FREE=$(df / | awk 'NR==2 {print $4}')
if [[ $DISK_FREE -lt 10485760 ]]; then  # 10GB in KB
    log_error "Insufficient disk space (need 10GB+, have $(($DISK_FREE / 1024 / 1024))GB)"
    exit 1
fi
log_success "Disk: $(($DISK_FREE / 1024 / 1024))GB free"

# Install Ansible
log_info "Installing Ansible..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq software-properties-common > /dev/null
add-apt-repository --yes --update ppa:ansible/ansible > /dev/null 2>&1
apt-get install -y -qq ansible python3-pip > /dev/null
log_success "Ansible installed"

# Clone repository
log_info "Cloning Mailrice repository..."
if [[ -d "$INSTALL_DIR" ]]; then
    log_warning "Installation directory exists, updating..."
    cd "$INSTALL_DIR"
    git pull origin "$REPO_BRANCH" > /dev/null 2>&1 || true
else
    git clone -b "$REPO_BRANCH" "$REPO_URL" "$INSTALL_DIR" > /dev/null 2>&1
    cd "$INSTALL_DIR"
fi
log_success "Repository ready"

# Create Ansible vars
log_info "Generating configuration..."
mkdir -p ansible/group_vars
cat > ansible/group_vars/all.yml << EOF
---
main_domain: "$DOMAIN"
hostname: "$HOSTNAME"
cf_email: "$CF_EMAIL"
cf_api_token: "$CF_TOKEN"
cf_zone_id: "$CF_ZONE"
admin_email: "$ADMIN_EMAIL"
admin_password: "$ADMIN_PASSWORD"
db_password: "$DB_PASSWORD"
jwt_secret: "$JWT_SECRET"
db_name: "mailrice"
db_user: "mailrice"
api_port: 8000
install_dir: "$INSTALL_DIR"
EOF
log_success "Configuration generated"

# Run Ansible playbook
log_info "Running Ansible deployment (this takes 5-10 minutes)..."
echo ""
cd "$INSTALL_DIR/ansible"
ansible-playbook playbook.yml -i inventory/hosts.ini

# Save credentials
log_info "Saving credentials..."
cat > /root/.mailrice/credentials.txt << EOF
========================================
Mailrice v2 - Deployment Credentials
========================================
Deployed: $(date)

API URL: https://$HOSTNAME/api
Docs: https://$HOSTNAME/api/docs

Admin Email: $ADMIN_EMAIL
Admin Password: $ADMIN_PASSWORD

Database: mailrice
Database User: mailrice
Database Password: $DB_PASSWORD

JWT Secret: $JWT_SECRET

========================================
Quick Test:
========================================
# Health check
curl https://$HOSTNAME/api/health

# Login
curl -X POST https://$HOSTNAME/api/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{"email":"$ADMIN_EMAIL","password":"$ADMIN_PASSWORD"}'

========================================
EOF

log_success "Credentials saved to: /root/.mailrice/credentials.txt"

# Final message
echo ""
echo -e "${GREEN}"
cat << 'EOF'
╔═══════════════════════════════════════╗
║   ✓ Mailrice v2 Deployed!             ║
╚═══════════════════════════════════════╝
EOF
echo -e "${NC}"

echo "API URL:  https://$HOSTNAME/api"
echo "Health:   https://$HOSTNAME/api/health"
echo "Docs:     https://$HOSTNAME/api/docs"
echo ""
echo "Admin:    $ADMIN_EMAIL"
echo "Password: $ADMIN_PASSWORD"
echo ""
echo "Credentials: /root/.mailrice/credentials.txt"
echo ""
log_success "Installation complete!"
echo ""
echo "Next: Deploy mail stack with Session 2 playbook (coming soon!)"
