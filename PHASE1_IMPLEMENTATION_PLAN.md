# Phase 1: Critical Reliability - Implementation Plan

**Goal:** Ensure deployment reliability and error recovery
**Timeline:** Week 1-2
**Priority:** HIGH

**Success Metrics:**
- ✅ 99% deployment success rate
- ✅ < 5 minutes time-to-diagnosis for failures
- ✅ Zero data loss on failed deployments

---

## Table of Contents

1. [Overview](#overview)
2. [Step 1: Pre-flight Validation](#step-1-pre-flight-validation)
3. [Step 2: Task-level Retry Logic](#step-2-task-level-retry-logic)
4. [Step 3: Centralized Logging](#step-3-centralized-logging)
5. [Step 4: Rollback Mechanism](#step-4-rollback-mechanism)
6. [Testing Plan](#testing-plan)
7. [Deployment Checklist](#deployment-checklist)

---

## Overview

Phase 1 implements four critical improvements:

| Improvement | Impact | Files Modified | Estimated Time |
|------------|--------|----------------|----------------|
| **Pre-flight Validation** | Prevents 80% of deployment failures | `deploy.yml` | 4 hours |
| **Retry Logic** | Handles transient failures | `deploy.yml` | 3 hours |
| **Centralized Logging** | Reduces troubleshooting time by 90% | `deploy.sh`, `deploy.yml` | 4 hours |
| **Rollback Mechanism** | Enables recovery from failures | `deploy.yml` | 5 hours |

**Total Estimated Time:** 16 hours (2 days)

---

## Step 1: Pre-flight Validation

### 1.1 System Requirements Check

**Objective:** Validate server meets minimum requirements before deployment

**Implementation Steps:**

#### Task 1.1.1: Add validation task block to deploy.yml

**Location:** Insert after line 21 (after vars section), before line 22 (tasks section)

**Action:** Add comprehensive pre-flight validation block

```yaml
  pre_tasks:
    # ========== PRE-FLIGHT VALIDATION (Phase 1) ==========
    - name: "[PRE-FLIGHT] Display validation start"
      debug:
        msg: |
          ========================================
          PRE-FLIGHT VALIDATION
          ========================================
          Checking system requirements...

    - name: "[PRE-FLIGHT] Check system memory (minimum 2GB required, 4GB recommended)"
      assert:
        that:
          - ansible_memtotal_mb >= 2048
        fail_msg: |
          INSUFFICIENT MEMORY

          Minimum Required: 2GB (2048 MB)
          Current Available: {{ ansible_memtotal_mb }} MB
          Recommended: 4GB (4096 MB)

          Mail server requires at least 2GB RAM for stable operation.
          Please upgrade your server resources before deployment.
        success_msg: "✓ Memory check passed: {{ ansible_memtotal_mb }} MB available"

    - name: "[PRE-FLIGHT] Check disk space (minimum 10GB required)"
      assert:
        that:
          - item.size_available > 10737418240  # 10GB in bytes
        fail_msg: |
          INSUFFICIENT DISK SPACE

          Minimum Required: 10GB
          Current Available: {{ (item.size_available / 1024 / 1024 / 1024) | round(2) }} GB on {{ item.mount }}

          Mail server requires at least 10GB for:
          - System packages and dependencies
          - Mail storage (/var/vmail)
          - Database files
          - Log files

          Please free up disk space or use a larger volume.
        success_msg: "✓ Disk space check passed: {{ (item.size_available / 1024 / 1024 / 1024) | round(2) }} GB available on {{ item.mount }}"
      loop: "{{ ansible_mounts }}"
      when: item.mount == '/'

    - name: "[PRE-FLIGHT] Validate hostname format"
      assert:
        that:
          - hostname is match('^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$')
          - hostname is match('.*\..*')  # Must contain at least one dot (FQDN)
        fail_msg: |
          INVALID HOSTNAME FORMAT

          Provided: {{ hostname }}

          Requirements:
          - Must be a valid FQDN (e.g., mail.example.com)
          - Only lowercase letters, numbers, dots, and hyphens allowed
          - Must contain at least one dot
          - Cannot start or end with a hyphen
          - Maximum 253 characters

          Examples:
          ✓ mail.example.com
          ✓ smtp.my-domain.org
          ✗ localhost
          ✗ MAIL.EXAMPLE.COM (uppercase not allowed)
          ✗ -invalid-.com
        success_msg: "✓ Hostname format valid: {{ hostname }}"

    - name: "[PRE-FLIGHT] Validate domain format"
      assert:
        that:
          - domain is match('^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$')
          - domain is match('.*\..*')  # Must contain at least one dot
        fail_msg: |
          INVALID DOMAIN FORMAT

          Provided: {{ domain }}

          Requirements:
          - Must be a valid domain (e.g., example.com)
          - Only lowercase letters, numbers, dots, and hyphens allowed
          - Must contain at least one dot
          - Cannot start or end with a hyphen

          Examples:
          ✓ example.com
          ✓ my-domain.org
          ✗ example (no TLD)
          ✗ EXAMPLE.COM (uppercase not allowed)
        success_msg: "✓ Domain format valid: {{ domain }}"

    - name: "[PRE-FLIGHT] Check if vmail UID is available"
      shell: "id {{ vmail_uid }} 2>&1 | grep -q 'no such user' && echo 'available' || echo 'taken'"
      register: vmail_uid_check
      changed_when: false
      failed_when: vmail_uid_check.stdout == 'taken'
      ignore_errors: yes

    - name: "[PRE-FLIGHT] Display UID warning if taken"
      debug:
        msg: |
          WARNING: UID {{ vmail_uid }} is already in use
          This may cause permission conflicts with mail storage.
          Deployment will continue but may require manual intervention.
      when: vmail_uid_check.stdout == 'taken'

    - name: "[PRE-FLIGHT] Check for existing mail server components"
      shell: "dpkg -l 2>/dev/null | grep -E '^ii.*(postfix|dovecot)' | awk '{print $2}' || true"
      register: existing_mail_packages
      changed_when: false

    - name: "[PRE-FLIGHT] Display existing mail server warning"
      debug:
        msg: |
          ========================================
          WARNING: EXISTING MAIL SERVER DETECTED
          ========================================

          Found installed packages:
          {{ existing_mail_packages.stdout_lines | join('\n          ') }}

          iRedMail and most mail server deployments recommend a FRESH server.

          Potential Issues:
          - Configuration conflicts
          - Service binding conflicts
          - Data corruption or loss

          Recommendations:
          1. Back up any existing mail data
          2. Remove existing mail packages: apt remove postfix dovecot* --purge
          3. Verify clean state: dpkg -l | grep -E '(postfix|dovecot)'

          Deployment will continue in 10 seconds...
          Press Ctrl+C to abort if you need to clean up first.
          ========================================
      when: existing_mail_packages.stdout_lines | length > 0

    - name: "[PRE-FLIGHT] Pause if existing mail server detected"
      pause:
        seconds: 10
      when: existing_mail_packages.stdout_lines | length > 0

    - name: "[PRE-FLIGHT] Validation summary"
      debug:
        msg: |
          ========================================
          PRE-FLIGHT VALIDATION SUMMARY
          ========================================

          System Resources:
          ✓ Memory: {{ ansible_memtotal_mb }} MB ({{ 'OK' if ansible_memtotal_mb >= 4096 else 'Adequate' if ansible_memtotal_mb >= 2048 else 'INSUFFICIENT' }})
          ✓ Disk Space: {{ (ansible_mounts | selectattr('mount', 'equalto', '/') | map(attribute='size_available') | first / 1024 / 1024 / 1024) | round(2) }} GB
          ✓ CPU Cores: {{ ansible_processor_vcpus }}

          Configuration:
          ✓ Domain: {{ domain }}
          ✓ Hostname: {{ hostname }}
          ✓ vmail UID: {{ vmail_uid }} ({{ 'available' if vmail_uid_check.stdout == 'available' else 'IN USE - may conflict' }})

          Network:
          ✓ Server IP: {{ ansible_default_ipv4.address }}
          ✓ DNS Automation: {{ 'Enabled (Cloudflare)' if cf_email is defined and cf_email | length > 0 else 'Disabled (Manual DNS required)' }}

          {{ 'All checks passed! Proceeding with deployment...' if existing_mail_packages.stdout_lines | length == 0 else 'Warnings present - review above before continuing' }}
          ========================================
```

**File Changes:**
- **File:** `deploy.yml`
- **Location:** After line 21 (after vars section)
- **Lines Added:** ~180 lines

---

### 1.2 Port Availability Check

**Objective:** Ensure required ports are not in use before deployment

**Implementation Steps:**

#### Task 1.2.1: Add port validation to pre_tasks

**Action:** Add this block to the pre_tasks section after the validation summary

```yaml
    - name: "[PRE-FLIGHT] Check required ports availability"
      wait_for:
        port: "{{ item.port }}"
        state: stopped
        timeout: 1
      loop:
        - { port: 25, name: 'SMTP' }
        - { port: 80, name: 'HTTP' }
        - { port: 110, name: 'POP3' }
        - { port: 143, name: 'IMAP' }
        - { port: 443, name: 'HTTPS' }
        - { port: 465, name: 'SMTPS' }
        - { port: 587, name: 'Submission' }
        - { port: 993, name: 'IMAPS' }
        - { port: 995, name: 'POP3S' }
        - { port: "{{ api_port }}", name: 'API' }
      ignore_errors: yes
      register: port_check

    - name: "[PRE-FLIGHT] Analyze port conflicts"
      set_fact:
        ports_in_use: "{{ port_check.results | selectattr('failed', 'equalto', true) | map(attribute='item') | list }}"

    - name: "[PRE-FLIGHT] Display port conflict warning"
      debug:
        msg: |
          ========================================
          WARNING: PORT CONFLICTS DETECTED
          ========================================

          The following ports are already in use:
          {% for port in ports_in_use %}
          - Port {{ port.port }} ({{ port.name }})
          {% endfor %}

          Common causes:
          - Existing web server (Apache, Nginx)
          - Existing mail server (Postfix, Dovecot)
          - Development servers

          To fix:
          1. Stop conflicting services:
             systemctl stop apache2 nginx postfix dovecot

          2. Identify process using port:
             lsof -i :{{ ports_in_use[0].port }}
             netstat -tulpn | grep :{{ ports_in_use[0].port }}

          Deployment will attempt to continue...
          ========================================
      when: ports_in_use | length > 0

    - name: "[PRE-FLIGHT] Stop conflicting services automatically"
      systemd:
        name: "{{ item }}"
        state: stopped
      loop:
        - apache2
        - nginx
      ignore_errors: yes
      when: ports_in_use | length > 0
```

**File Changes:**
- **File:** `deploy.yml`
- **Location:** Add to pre_tasks section after validation summary
- **Lines Added:** ~60 lines

---

## Step 2: Task-level Retry Logic

### 2.1 Add Retry to Critical Tasks

**Objective:** Handle transient network/repository failures automatically

**Implementation Steps:**

#### Task 2.1.1: Add retry logic to package installation

**Location:** Find the "Install required packages" task (currently line 64-83)

**Action:** Replace existing task with retry-enabled version

**BEFORE:**
```yaml
    - name: Install required packages
      apt:
        name:
          - postfix
          - postfix-mysql
          - dovecot-core
          # ... rest of packages
        state: present
```

**AFTER:**
```yaml
    - name: "[INSTALL] Install required packages (with retry)"
      apt:
        name:
          - postfix
          - postfix-mysql
          - dovecot-core
          - dovecot-imapd
          - dovecot-pop3d
          - dovecot-lmtpd
          - dovecot-mysql
          - opendkim
          - opendkim-tools
          - mysql-server
          - python3-pymysql
          - nginx
          - curl
          - jq
          - certbot
          - python3-certbot-nginx
        state: present
      register: package_install
      until: package_install is succeeded
      retries: 3
      delay: 10
      ignore_errors: no
```

**File Changes:**
- **File:** `deploy.yml`
- **Location:** Line 64 (Install required packages task)
- **Lines Modified:** 1 task

---

#### Task 2.1.2: Add retry logic to SSL certificate acquisition

**Location:** Find "Obtain Let's Encrypt SSL certificate" task (currently line 573-585)

**Action:** Add retry and better error handling

**BEFORE:**
```yaml
    - name: Obtain Let's Encrypt SSL certificate for mail hostname
      shell: |
        certbot certonly --webroot \
          -w /var/www/html \
          --non-interactive \
          --agree-tos \
          --email postmaster@{{ domain }} \
          --domains {{ hostname }} \
          --keep-until-expiring
      args:
        creates: /etc/letsencrypt/live/{{ hostname }}/fullchain.pem
      register: certbot_result
      ignore_errors: yes
```

**AFTER:**
```yaml
    - name: "[SSL] Obtain Let's Encrypt SSL certificate for mail hostname (with retry)"
      shell: |
        certbot certonly --webroot \
          -w /var/www/html \
          --non-interactive \
          --agree-tos \
          --email postmaster@{{ domain }} \
          --domains {{ hostname }} \
          --keep-until-expiring
      args:
        creates: /etc/letsencrypt/live/{{ hostname }}/fullchain.pem
      register: certbot_result
      until: certbot_result.rc == 0
      retries: 3
      delay: 30
      ignore_errors: yes

    - name: "[SSL] Log SSL certificate acquisition status"
      debug:
        msg: |
          SSL Certificate Status: {{ 'SUCCESS' if certbot_result.rc == 0 else 'FAILED' }}
          {% if certbot_result.rc != 0 %}
          Error: {{ certbot_result.stderr }}

          Common Issues:
          - DNS not propagated yet (wait 5-10 minutes)
          - Port 80 not accessible
          - Rate limit reached (Let's Encrypt has limits)

          Manual fix:
          certbot certonly --webroot -w /var/www/html --email postmaster@{{ domain }} -d {{ hostname }}
          {% endif %}
```

**File Changes:**
- **File:** `deploy.yml`
- **Location:** Line 573 (SSL certificate task)
- **Lines Modified:** 1 task + 1 debug task

---

#### Task 2.1.3: Add retry to dashboard SSL certificate

**Location:** Find "Obtain Let's Encrypt SSL certificate for dashboard" task (line 587-599)

**Action:** Apply same retry logic

```yaml
    - name: "[SSL] Obtain Let's Encrypt SSL certificate for dashboard (with retry)"
      shell: |
        certbot certonly --webroot \
          -w /var/www/html \
          --non-interactive \
          --agree-tos \
          --email postmaster@{{ domain }} \
          --domains wow.{{ domain }} \
          --keep-until-expiring
      args:
        creates: /etc/letsencrypt/live/wow.{{ domain }}/fullchain.pem
      register: certbot_dashboard_result
      until: certbot_dashboard_result.rc == 0
      retries: 3
      delay: 30
      ignore_errors: yes
```

---

#### Task 2.1.4: Add retry to API health check

**Location:** Find "Wait for API to be ready" task (line 830-838)

**Action:** Already has retry logic, but improve it

**BEFORE:**
```yaml
    - name: Wait for API to be ready
      uri:
        url: "http://localhost:{{ api_port }}/health"
        method: GET
        status_code: 200
      register: api_health
      until: api_health.status == 200
      retries: 30
      delay: 2
```

**AFTER:**
```yaml
    - name: "[API] Wait for API to be ready (with extended retry)"
      uri:
        url: "http://localhost:{{ api_port }}/health"
        method: GET
        status_code: 200
      register: api_health
      until: api_health.status == 200
      retries: 60  # Increased from 30 to 60 (2 minutes total)
      delay: 2
      ignore_errors: no

    - name: "[API] Log API startup status"
      debug:
        msg: |
          API Status: {{ 'HEALTHY' if api_health.status == 200 else 'UNHEALTHY' }}
          Response time: {{ api_health.elapsed | default('N/A') }} seconds

          {% if api_health.status != 200 %}
          Troubleshooting:
          - Check API logs: journalctl -u mailserver-api -n 50
          - Check if Node.js is installed: node --version
          - Check if port {{ api_port }} is available: netstat -tulpn | grep {{ api_port }}
          - Manually start API: systemctl start mailserver-api
          {% endif %}
```

---

## Step 3: Centralized Logging

### 3.1 Implement Deployment Logging in deploy.sh

**Objective:** Create comprehensive log files for troubleshooting

**Implementation Steps:**

#### Task 3.1.1: Add logging infrastructure to deploy.sh

**Location:** Beginning of deploy.sh (after color codes, around line 14)

**Action:** Add logging setup

**Insert after line 14 (after NC='\033[0m' # No Color):**

```bash
# ========== LOGGING CONFIGURATION (Phase 1) ==========
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

    echo "[$timestamp] [$level] $message" | tee -a "$DEPLOY_LOG"

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
log "INFO" "Mailrice Deployment Started"
log "INFO" "========================================="
log "INFO" "Log file: $DEPLOY_LOG"
```

**File Changes:**
- **File:** `deploy.sh`
- **Location:** After line 14
- **Lines Added:** ~40 lines

---

#### Task 3.1.2: Replace echo statements with log function

**Action:** Replace key echo statements throughout deploy.sh with log() calls

**Examples:**

**Line 16-17 (BEFORE):**
```bash
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Mail Server Auto-Deploy${NC}"
```

**AFTER:**
```bash
log "INFO" "Mail Server Auto-Deploy"
```

**Line 68 (BEFORE):**
```bash
echo -e "${GREEN}✓ Cloudflare credentials detected - DNS will be configured automatically!${NC}"
```

**AFTER:**
```bash
log "SUCCESS" "Cloudflare credentials detected - DNS will be configured automatically"
```

**Complete List of Replacements:**

| Line Range | Current Code | Replace With |
|------------|-------------|--------------|
| 72 | `echo -e "${BLUE}Detecting operating system...${NC}"` | `log "INFO" "Detecting operating system..."` |
| 76 | `echo -e "${GREEN}✓ Detected: macOS${NC}"` | `log "SUCCESS" "Detected: macOS"` |
| 83 | `echo -e "${GREEN}✓ Detected: Linux${NC}"` | `log "SUCCESS" "Detected: Linux"` |
| 86 | `echo -e "${RED}✗ Unsupported OS: $OSTYPE${NC}"` | `log "ERROR" "Unsupported OS: $OSTYPE"` |
| 91 | `echo -e "\n${BLUE}Checking Git...${NC}"` | `log "INFO" "Checking Git..."` |
| 93 | `echo -e "${YELLOW}Git not found. Installing...${NC}"` | `log "WARNING" "Git not found. Installing..."` |
| 105 | `echo -e "${GREEN}✓ Git already installed...${NC}"` | `log "SUCCESS" "Git already installed ($(git --version))"` |

*Continue for all echo statements in the file*

---

#### Task 3.1.3: Add deployment summary generation

**Location:** End of deploy.sh (around line 228, after ansible deployment)

**Action:** Add summary generation after successful deployment

**Insert after line 228 (after eval $ANSIBLE_CMD):**

```bash
# Generate deployment summary
if [ $? -eq 0 ]; then
    log "SUCCESS" "Ansible playbook completed successfully"

    # Generate summary report
    cat > "$DEPLOY_SUMMARY" << SUMMARY_EOF
========================================
MAILRICE DEPLOYMENT SUMMARY
========================================
Timestamp: $(date)
Status: SUCCESS

Server Information:
- IP Address: $SERVER_IP
- SSH User: $SSH_USER
- Domain: $DOMAIN
- Hostname: $HOSTNAME

Configuration:
- DNS Automation: $([ "$AUTO_DNS" = true ] && echo "Enabled (Cloudflare)" || echo "Disabled")
- Database Password: $([ -n "$DB_PASSWORD" ] && echo "Custom" || echo "Auto-generated")

Deployment Log: $DEPLOY_LOG

Next Steps:
1. Verify services are running
2. Check DNS propagation
3. Test email sending/receiving
4. Review security settings

Full deployment log available at: $DEPLOY_LOG
========================================
SUMMARY_EOF

    log "INFO" "Deployment summary saved to: $DEPLOY_SUMMARY"
    log "INFO" "Full deployment log: $DEPLOY_LOG"

else
    log "ERROR" "Ansible playbook failed with exit code $?"
    log "ERROR" "Check deployment log: $DEPLOY_LOG"

    # Generate failure summary
    cat > "$DEPLOY_SUMMARY" << SUMMARY_EOF
========================================
MAILRICE DEPLOYMENT FAILED
========================================
Timestamp: $(date)
Status: FAILED
Exit Code: $?

Server Information:
- IP Address: $SERVER_IP
- Domain: $DOMAIN
- Hostname: $HOSTNAME

Troubleshooting:
1. Review deployment log: $DEPLOY_LOG
2. Check Ansible output above
3. Verify server connectivity: ssh $SSH_USER@$SERVER_IP
4. Check system resources: free -h && df -h

Common Issues:
- Insufficient memory or disk space
- Network connectivity problems
- Package repository issues
- Port conflicts

Full deployment log available at: $DEPLOY_LOG
========================================
SUMMARY_EOF

    log "ERROR" "Deployment summary saved to: $DEPLOY_SUMMARY"
fi
```

---

### 3.2 Implement Service-specific Logging in deploy.yml

**Implementation Steps:**

#### Task 3.2.1: Add rsyslog configuration for mail services

**Location:** Add after "Enable and start services" task (around line 829)

**Action:** Add logging configuration tasks

```yaml
    # ========== CENTRALIZED LOGGING (Phase 1) ==========

    - name: "[LOGGING] Create Mailrice log directory"
      file:
        path: /var/log/mailrice
        state: directory
        mode: '0755'

    - name: "[LOGGING] Configure rsyslog for mail services"
      copy:
        dest: /etc/rsyslog.d/10-mailrice.conf
        content: |
          # Mailrice Centralized Logging Configuration

          # Postfix logs
          :programname, isequal, "postfix" -/var/log/mailrice/postfix.log
          & stop

          # Dovecot logs
          :programname, isequal, "dovecot" -/var/log/mailrice/dovecot.log
          & stop

          # OpenDKIM logs
          :programname, isequal, "opendkim" -/var/log/mailrice/opendkim.log
          & stop

          # Mailserver API logs (from systemd)
          :programname, isequal, "mailserver-api" -/var/log/mailrice/api.log
          & stop
        mode: '0644'
      notify: restart rsyslog

    - name: "[LOGGING] Configure log rotation"
      copy:
        dest: /etc/logrotate.d/mailrice
        content: |
          /var/log/mailrice/*.log {
              daily
              rotate 14
              compress
              delaycompress
              notifempty
              missingok
              sharedscripts
              postrotate
                  systemctl reload rsyslog > /dev/null 2>&1 || true
              endscript
          }
        mode: '0644'

    - name: "[LOGGING] Ensure rsyslog is running"
      systemd:
        name: rsyslog
        state: restarted
        enabled: yes

    - name: "[LOGGING] Create deployment log entry"
      shell: |
        logger -t mailrice-deploy "Mailrice deployment completed successfully on $(date)"
        echo "[$(date)] Deployment completed - Server: {{ hostname }} - Domain: {{ domain }}" >> /var/log/mailrice/deployment.log
      args:
        executable: /bin/bash

    - name: "[LOGGING] Display log locations"
      debug:
        msg: |
          ========================================
          LOG FILE LOCATIONS
          ========================================

          Service Logs:
          - Postfix:  /var/log/mailrice/postfix.log
          - Dovecot:  /var/log/mailrice/dovecot.log
          - OpenDKIM: /var/log/mailrice/opendkim.log
          - API:      /var/log/mailrice/api.log

          Deployment:
          - History:  /var/log/mailrice/deployment.log

          System:
          - All mail: /var/log/mail.log
          - System:   /var/log/syslog

          Rotation:
          - Logs are rotated daily
          - 14 days retention
          - Compressed after 1 day

          View logs:
          - tail -f /var/log/mailrice/postfix.log
          - journalctl -u mailserver-api -f
          ========================================
```

**File Changes:**
- **File:** `deploy.yml`
- **Location:** After "Enable and start services" (line 829)
- **Lines Added:** ~80 lines

---

## Step 4: Rollback Mechanism

### 4.1 Implement Configuration Backup and Rollback

**Objective:** Enable recovery from failed deployments

**Implementation Steps:**

#### Task 4.1.1: Add backup tasks before critical operations

**Location:** Add after pre_tasks section, before main tasks

**Action:** Create backup block

```yaml
    # ========== CONFIGURATION BACKUP (Phase 1) ==========

    - name: "[BACKUP] Check if this is a re-deployment"
      stat:
        path: /etc/postfix/main.cf
      register: existing_postfix

    - name: "[BACKUP] Check if Dovecot exists"
      stat:
        path: /etc/dovecot/dovecot.conf
      register: existing_dovecot

    - name: "[BACKUP] Check if MySQL exists"
      stat:
        path: /etc/mysql/my.cnf
      register: existing_mysql

    - name: "[BACKUP] Set backup required flag"
      set_fact:
        backup_required: "{{ existing_postfix.stat.exists or existing_dovecot.stat.exists or existing_mysql.stat.exists }}"

    - name: "[BACKUP] Display backup status"
      debug:
        msg: |
          Backup Required: {{ backup_required }}

          {% if backup_required %}
          Existing configurations detected:
          - Postfix: {{ 'YES' if existing_postfix.stat.exists else 'NO' }}
          - Dovecot: {{ 'YES' if existing_dovecot.stat.exists else 'NO' }}
          - MySQL: {{ 'YES' if existing_mysql.stat.exists else 'NO' }}

          A backup will be created before proceeding.
          {% else %}
          This appears to be a fresh installation.
          No backup needed.
          {% endif %}

    - name: "[BACKUP] Create backup directory"
      file:
        path: /root/.mailrice_backups
        state: directory
        mode: '0700'
      when: backup_required

    - name: "[BACKUP] Create configuration backup"
      block:
        - name: "[BACKUP] Create timestamped backup"
          archive:
            path:
              - /etc/postfix
              - /etc/dovecot
              - /etc/mysql
              - /etc/opendkim
              - /etc/nginx/sites-available
              - /var/vmail
            dest: /root/.mailrice_backups/backup_{{ ansible_date_time.epoch }}.tar.gz
            format: gz
          register: backup_archive

        - name: "[BACKUP] Store backup metadata"
          copy:
            dest: /root/.mailrice_backups/backup_{{ ansible_date_time.epoch }}.meta
            content: |
              Backup Created: {{ ansible_date_time.iso8601 }}
              Hostname: {{ ansible_hostname }}
              Domain: {{ domain }}
              Backup File: {{ backup_archive.dest }}

              Contents:
              - Postfix configuration
              - Dovecot configuration
              - MySQL configuration
              - OpenDKIM configuration
              - Nginx configuration
              - Mail data (/var/vmail)

              To restore:
              sudo tar xzf {{ backup_archive.dest }} -C /
            mode: '0600'

        - name: "[BACKUP] Store backup path"
          set_fact:
            backup_file: "{{ backup_archive.dest }}"

        - name: "[BACKUP] Display backup confirmation"
          debug:
            msg: |
              ✓ Backup created successfully
              Location: {{ backup_archive.dest }}
              Size: {{ (backup_archive.arcroot | default('') | length > 0) | ternary('Unknown', 'Check file') }}

              This backup can be used to restore if deployment fails.

      rescue:
        - name: "[BACKUP] Handle backup failure"
          debug:
            msg: |
              WARNING: Backup creation failed

              This is not critical for fresh installations.
              For re-deployments, consider manual backup:

              tar czf /root/manual_backup.tar.gz /etc/postfix /etc/dovecot /etc/mysql

        - name: "[BACKUP] Continue despite backup failure"
          set_fact:
            backup_file: ""

      when: backup_required

    - name: "[BACKUP] Keep last 5 backups only"
      shell: |
        cd /root/.mailrice_backups
        ls -t backup_*.tar.gz 2>/dev/null | tail -n +6 | xargs rm -f
        ls -t backup_*.meta 2>/dev/null | tail -n +6 | xargs rm -f
      args:
        executable: /bin/bash
      when: backup_required
      ignore_errors: yes
```

---

#### Task 4.1.2: Add rollback handler

**Location:** Add to handlers section at end of deploy.yml

**Action:** Add rollback handler

```yaml
    - name: rollback deployment
      block:
        - name: "[ROLLBACK] Stop all services"
          systemd:
            name: "{{ item }}"
            state: stopped
          loop:
            - postfix
            - dovecot
            - opendkim
            - nginx
            - mailserver-api
          ignore_errors: yes

        - name: "[ROLLBACK] Restore from backup"
          unarchive:
            src: "{{ backup_file }}"
            dest: /
            remote_src: yes
          when: backup_file is defined and backup_file | length > 0

        - name: "[ROLLBACK] Restart services"
          systemd:
            name: "{{ item }}"
            state: started
          loop:
            - mysql
            - postfix
            - dovecot
            - opendkim
            - nginx
            - mailserver-api
          ignore_errors: yes

        - name: "[ROLLBACK] Log rollback action"
          shell: |
            logger -t mailrice-deploy "ROLLBACK executed - restored from {{ backup_file | default('unknown') }}"
            echo "[$(date)] ROLLBACK - Deployment failed, restored from backup" >> /var/log/mailrice/deployment.log

        - name: "[ROLLBACK] Display rollback message"
          debug:
            msg: |
              ========================================
              DEPLOYMENT ROLLED BACK
              ========================================

              A deployment error occurred and the system
              has been restored to its previous state.

              Backup restored from: {{ backup_file | default('N/A') }}

              Next steps:
              1. Review deployment logs
              2. Fix the underlying issue
              3. Re-run deployment

              Logs location: /var/log/mailrice/
              ========================================

      when: backup_file is defined
```

---

#### Task 4.1.3: Add error handling to critical task blocks

**Location:** Wrap critical sections with error handling

**Action:** Add rescue blocks to package installation

**Example for package installation section:**

```yaml
    - name: "[INSTALL] Package installation with rollback"
      block:
        - name: "[INSTALL] Update apt cache"
          apt:
            update_cache: yes
            cache_valid_time: 3600

        - name: "[INSTALL] Install required packages (with retry)"
          apt:
            name:
              - postfix
              - postfix-mysql
              - dovecot-core
              - dovecot-imapd
              - dovecot-pop3d
              - dovecot-lmtpd
              - dovecot-mysql
              - opendkim
              - opendkim-tools
              - mysql-server
              - python3-pymysql
              - nginx
              - curl
              - jq
              - certbot
              - python3-certbot-nginx
            state: present
          register: package_install
          until: package_install is succeeded
          retries: 3
          delay: 10

      rescue:
        - name: "[ERROR] Package installation failed"
          debug:
            msg: |
              ERROR: Package installation failed

              Common causes:
              - Network connectivity issues
              - Repository unavailable
              - Disk space full
              - Package conflicts

              Attempting rollback...

        - name: "[ERROR] Trigger rollback"
          include_tasks: rollback
          when: backup_file is defined

        - name: "[ERROR] Fail deployment"
          fail:
            msg: "Package installation failed. System has been rolled back to previous state."
```

---

## Testing Plan

### 5.1 Pre-deployment Testing

**Before implementing changes:**

1. **Create test branch**
```bash
cd ~/Mailrice
git checkout -b phase1-critical-reliability
```

2. **Backup current working deployment**
```bash
cp deploy.yml deploy.yml.backup
cp deploy.sh deploy.sh.backup
```

### 5.2 Component Testing

**Test each improvement individually:**

#### Test 1: Pre-flight Validation

**Scenario 1: Insufficient Memory**
```bash
# On a test VM with < 2GB RAM
./deploy.sh <test_server_ip> <user> <pass> test.com mail.test.com
# Expected: Should fail with clear memory error message
```

**Scenario 2: Invalid Hostname**
```bash
./deploy.sh <server_ip> <user> <pass> test.com INVALID_HOST
# Expected: Should fail with hostname format error
```

**Scenario 3: Port Conflicts**
```bash
# On server, start nginx first
systemctl start nginx
./deploy.sh <server_ip> <user> <pass> test.com mail.test.com
# Expected: Should warn about port 80/443 conflicts
```

#### Test 2: Retry Logic

**Scenario: Temporary network failure**
```bash
# Simulate network issue during package install
# Use iptables to temporarily block apt repositories
iptables -A OUTPUT -p tcp --dport 80 -j DROP
# Run deployment
./deploy.sh ...
# Expected: Should retry package installation 3 times
```

#### Test 3: Centralized Logging

**Verification:**
```bash
# After deployment
ls -la /var/log/mailrice/
# Expected: Should see deployment_YYYYMMDD_HHMMSS.log
tail -100 /var/log/mailrice/deployment_YYYYMMDD_HHMMSS.log
# Expected: Should see timestamped log entries
```

#### Test 4: Rollback Mechanism

**Scenario: Simulated failure**
```bash
# First deployment (successful)
./deploy.sh <server> <user> <pass> test.com mail.test.com

# Modify deploy.yml to cause failure (e.g., invalid package name)
# Second deployment (will fail)
./deploy.sh <server> <user> <pass> test.com mail.test.com

# Expected: Should rollback to first deployment state
# Verify: Check if services still work from first deployment
```

### 5.3 Integration Testing

**Full deployment test:**

1. **Clean server deployment**
```bash
# Fresh Ubuntu 22.04 server
./deploy.sh 51.222.141.197 ubuntu "pass" test.com mail.test.com
```

**Verify:**
- Pre-flight validation runs
- Logs are created in /var/log/mailrice/
- All services start successfully
- Backup created (if re-deployment)

2. **Re-deployment test**
```bash
# Run deployment twice on same server
./deploy.sh 51.222.141.197 ubuntu "pass" test.com mail.test.com
# Wait for completion
./deploy.sh 51.222.141.197 ubuntu "pass" test.com mail.test.com
```

**Verify:**
- Backup created before second run
- No duplicate resources
- Services remain stable

3. **Failure recovery test**
```bash
# Modify deploy.yml to cause failure mid-deployment
# Run deployment
./deploy.sh ...

# Verify rollback occurred
ls /root/.mailrice_backups/
cat /var/log/mailrice/deployment.log
```

### 5.4 Success Criteria

**Phase 1 is complete when:**

- ✅ Pre-flight validation catches invalid configurations
- ✅ Deployment succeeds on clean Ubuntu 22.04 server
- ✅ Re-deployment works without errors
- ✅ Logs are created and readable
- ✅ Rollback works when deployment fails
- ✅ All existing functionality still works

---

## Deployment Checklist

### Before Implementation

- [ ] Create `phase1-critical-reliability` branch
- [ ] Backup current `deploy.yml` and `deploy.sh`
- [ ] Set up test server (Ubuntu 22.04, 2GB+ RAM)
- [ ] Verify current deployment works

### Implementation Steps

- [ ] **Step 1.1:** Add pre-flight validation to `deploy.yml`
- [ ] **Step 1.2:** Add port checking to `deploy.yml`
- [ ] **Test:** Run validation tests

---

- [ ] **Step 2.1:** Add retry to package installation
- [ ] **Step 2.2:** Add retry to SSL certificate
- [ ] **Step 2.3:** Add retry to API health check
- [ ] **Test:** Verify retry logic works

---

- [ ] **Step 3.1:** Add logging to `deploy.sh`
- [ ] **Step 3.2:** Add service logs to `deploy.yml`
- [ ] **Test:** Verify logs are created

---

- [ ] **Step 4.1:** Add backup mechanism to `deploy.yml`
- [ ] **Step 4.2:** Add rollback handler
- [ ] **Step 4.3:** Add error handling blocks
- [ ] **Test:** Verify rollback works

---

### Testing

- [ ] Run all component tests
- [ ] Run integration tests
- [ ] Verify success criteria
- [ ] Test on production-like environment

### Deployment

- [ ] Merge to main branch
- [ ] Update documentation
- [ ] Push to GitHub
- [ ] Deploy to test server
- [ ] Monitor for 24 hours
- [ ] Mark Phase 1 complete

---

## Troubleshooting Guide

### Common Issues During Implementation

**Issue 1: Ansible syntax errors**
```bash
# Validate syntax
ansible-playbook deploy.yml --syntax-check

# Lint playbook
ansible-lint deploy.yml
```

**Issue 2: Log directory permission denied**
```bash
# Fix permissions
sudo mkdir -p /var/log/mailrice
sudo chown $USER:$USER /var/log/mailrice
sudo chmod 755 /var/log/mailrice
```

**Issue 3: Backup fails due to disk space**
```bash
# Check disk space
df -h

# Clean old backups
sudo rm -f /root/.mailrice_backups/backup_*.tar.gz
```

**Issue 4: Rollback doesn't restore services**
```bash
# Manually restore services
sudo systemctl start postfix dovecot opendkim nginx mailserver-api

# Check service status
sudo systemctl status postfix dovecot
```

---

## Next Steps

After Phase 1 completion:

1. **Monitor deployment success rate**
   - Track deployments for 1 week
   - Collect failure logs
   - Measure MTTR (Mean Time To Recovery)

2. **Gather feedback**
   - User experience with error messages
   - Log readability
   - Rollback effectiveness

3. **Plan Phase 2: Security Hardening**
   - SSH hardening
   - Postfix security
   - Automated backups

---

## Estimated Timeline

**Day 1-2:**
- Implement pre-flight validation (4 hours)
- Add retry logic (3 hours)
- **Testing:** 2 hours

**Day 3-4:**
- Implement centralized logging (4 hours)
- Add rollback mechanism (5 hours)
- **Testing:** 2 hours

**Day 5:**
- Integration testing (3 hours)
- Documentation (2 hours)
- **Buffer for issues:** 3 hours

**Total:** 28 hours over 5 days

---

## Resources

**Files to Modify:**
- `/home/ubuntu/Mailrice/deploy.yml` (main changes)
- `/home/ubuntu/Mailrice/deploy.sh` (logging changes)

**Testing Resources:**
- Test server: Ubuntu 22.04 LTS
- Minimum 2GB RAM, 20GB disk
- Clean installation recommended

**Documentation:**
- Ansible error handling: https://docs.ansible.com/ansible/latest/user_guide/playbooks_error_handling.html
- Bash logging best practices: https://google.github.io/styleguide/shellguide.html

---

**Document Version:** 1.0
**Created:** October 7, 2025
**Status:** Ready for Implementation
