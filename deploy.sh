#!/bin/bash
set -e

# Mail Server One-Line Deployment Script
# Auto-detects OS, installs dependencies, and deploys mail server
# Usage: ./deploy.sh <server_ip> <ssh_user> <ssh_password> <domain> <hostname> [db_password]

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Mail Server Auto-Deploy${NC}"
echo -e "${GREEN}========================================${NC}"

# Parse arguments
SERVER_IP="${1:-}"
SSH_USER="${2:-}"
SSH_PASS="${3:-}"
DOMAIN="${4:-}"
HOSTNAME="${5:-}"
DB_PASSWORD="${6:-}"

# Validate required arguments
if [ -z "$SERVER_IP" ] || [ -z "$SSH_USER" ] || [ -z "$SSH_PASS" ] || [ -z "$DOMAIN" ] || [ -z "$HOSTNAME" ]; then
  echo -e "${RED}Error: Missing required arguments${NC}"
  echo ""
  echo "Usage: $0 <server_ip> <ssh_user> <ssh_password> <domain> <hostname> [db_password]"
  echo ""
  echo "Example:"
  echo "  $0 1.2.3.4 ubuntu mypassword example.com mail.example.com"
  echo ""
  echo "Arguments:"
  echo "  server_ip     - Target server IP address"
  echo "  ssh_user      - SSH username (usually 'ubuntu' or 'root')"
  echo "  ssh_password  - SSH password"
  echo "  domain        - Your domain (e.g., example.com)"
  echo "  hostname      - Mail server hostname (e.g., mail.example.com)"
  echo "  db_password   - Optional: Database password (auto-generated if not provided)"
  echo ""
  exit 1
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

# Check and install sshpass
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

# Clone or update repository
echo -e "\n${BLUE}Setting up deployment files...${NC}"
DEPLOY_DIR="$HOME/mailserver-deployment"

if [ -d "$DEPLOY_DIR" ]; then
  echo -e "${YELLOW}Deployment directory exists. Updating...${NC}"
  cd "$DEPLOY_DIR"
  git pull origin main > /dev/null 2>&1
  echo -e "${GREEN}✓ Updated to latest version${NC}"
else
  echo -e "${YELLOW}Cloning deployment repository...${NC}"
  git clone https://github.com/Ayushjain101/mailserver-deployment.git "$DEPLOY_DIR" > /dev/null 2>&1
  cd "$DEPLOY_DIR"
  echo -e "${GREEN}✓ Repository cloned${NC}"
fi

# Create inventory file
echo -e "\n${BLUE}Creating Ansible inventory...${NC}"
cat > inventory << EOF
[mailserver]
$SERVER_IP ansible_user=$SSH_USER ansible_ssh_pass=$SSH_PASS ansible_become=yes ansible_become_pass=$SSH_PASS
EOF
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
  echo "  3. Verify SSH password is correct"
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

# Run deployment
eval $ANSIBLE_CMD

# Check deployment success
if [ $? -eq 0 ]; then
  echo ""
  echo -e "${GREEN}========================================${NC}"
  echo -e "${GREEN}  ✓ Deployment Successful!${NC}"
  echo -e "${GREEN}========================================${NC}"
  echo ""
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
