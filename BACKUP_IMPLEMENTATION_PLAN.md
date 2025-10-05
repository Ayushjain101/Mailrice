# Automated Backup System - Complete Implementation Plan

## Executive Summary

Implementing a comprehensive automated backup system for Mailrice to prevent data loss and enable disaster recovery for cold email agencies managing hundreds of mailboxes across multiple IPs.

**Implementation Time:** 2-3 hours
**Complexity:** Low-Medium
**Impact:** Critical - Prevents catastrophic data loss

---

## Current State

### Existing Backup Documentation
Mailrice currently has **manual backup commands** in README.md:
- Manual MySQL dump
- Manual tar of /var/vmail
- Manual tar of config files
- **No automation**
- **No scheduling**
- **No retention policy**
- **No cloud storage**
- **No restore procedures**

### What Needs Backup

1. **MySQL Database** (Critical)
   - `virtual_domains` - Domain configurations + DKIM keys
   - `virtual_users` - Mailbox credentials (hashed passwords)
   - `virtual_aliases` - Email forwarding rules
   - `api_keys` - API authentication tokens
   - **Size:** ~10-100MB for 1000 mailboxes
   - **Change Frequency:** High (multiple times per day)

2. **Mail Data** (Important)
   - Path: `/var/vmail/`
   - Format: Maildir (one file per email)
   - **Size:** Varies (1GB-1TB+)
   - **Change Frequency:** Constant

3. **Configuration Files** (Important)
   - `/etc/postfix/` - SMTP configuration
   - `/etc/dovecot/` - IMAP/POP3 configuration
   - `/etc/opendkim/` - DKIM private keys
   - `/opt/mailserver-api/` - API code and .env
   - **Size:** ~10-50MB
   - **Change Frequency:** Low (only on config changes)

4. **SSL Certificates** (Medium)
   - `/etc/letsencrypt/` - Let's Encrypt certificates
   - **Size:** ~1MB
   - **Change Frequency:** Every 90 days

---

## Architecture Design

### Backup Strategy

#### 3-Tier Backup System

**Tier 1: Hot Backups (Database)**
- MySQL dumps every 6 hours
- Stored locally and in cloud
- Fast recovery (minutes)
- 7-day retention

**Tier 2: Warm Backups (Configurations)**
- Config snapshots daily
- Stored locally and in cloud
- 30-day retention

**Tier 3: Cold Backups (Mail Data)**
- Incremental mail backups daily
- Stored in cloud only
- 7-day retention (configurable)
- Optional - can be disabled for cost savings

### Storage Options

#### Option A: Local + S3 (Recommended)
- **Local:** `/var/backups/mailserver/`
- **Remote:** AWS S3 / DigitalOcean Spaces / Backblaze B2
- **Cost:** ~$5-20/month for typical usage
- **Benefits:** Fast local restore + offsite safety

#### Option B: Local Only
- **Storage:** `/var/backups/mailserver/`
- **Cost:** Free (uses server disk)
- **Risk:** Server failure = data loss
- **Use Case:** Development/testing only

#### Option C: Cloud Only
- **Storage:** S3-compatible cloud storage
- **Cost:** ~$5-20/month
- **Benefits:** Offsite safety
- **Drawback:** Slower restore

### Backup Schedule

| Component | Frequency | Time | Retention | Size (est) |
|-----------|-----------|------|-----------|------------|
| MySQL Database | Every 6 hours | 00:00, 06:00, 12:00, 18:00 | 7 days | 10-100MB |
| Configurations | Daily | 02:00 | 30 days | 10-50MB |
| Mail Data (Incremental) | Daily | 03:00 | 7 days | Varies |
| Full System Backup | Weekly | Sunday 04:00 | 4 weeks | Full size |

---

## Implementation Plan

### Phase 1: Core Backup Scripts (1 hour)

#### File 1: `/opt/mailserver-backup/backup.sh`
Main backup orchestration script

**Features:**
- MySQL dump with gzip compression
- Configuration files backup
- Mail data incremental backup (optional)
- Timestamped backups
- Retention policy enforcement
- Email notifications on failure
- Logging to `/var/log/mailserver-backup.log`

**Functions:**
```bash
backup_database()      # MySQL dump
backup_configs()       # Tar config files
backup_mail()          # Rsync incremental mail data
cleanup_old_backups()  # Enforce retention
upload_to_cloud()      # S3 sync (if configured)
send_notification()    # Email alerts
```

#### File 2: `/opt/mailserver-backup/restore.sh`
Restore script for disaster recovery

**Features:**
- Interactive restore wizard
- List available backups
- Restore database from backup
- Restore configs from backup
- Restore mail data from backup
- Dry-run mode
- Verification checks

#### File 3: `/opt/mailserver-backup/config.env`
Backup configuration file

**Settings:**
```bash
# Backup paths
BACKUP_DIR=/var/backups/mailserver
LOCAL_RETENTION_DAYS=7
CONFIG_RETENTION_DAYS=30

# Database settings
DB_HOST=127.0.0.1
DB_USER=root
DB_NAME=mailserver

# Cloud storage (optional)
ENABLE_CLOUD_BACKUP=false
S3_BUCKET=s3://your-backup-bucket
S3_ENDPOINT=https://s3.amazonaws.com
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=

# Mail backup settings
ENABLE_MAIL_BACKUP=true
MAIL_BACKUP_TYPE=incremental  # or 'full'

# Notifications
ENABLE_EMAIL_NOTIFICATIONS=false
NOTIFICATION_EMAIL=admin@yourdomain.com
SMTP_SERVER=localhost
SMTP_FROM=backup@yourdomain.com

# Monitoring
ENABLE_HEALTHCHECK_PING=false
HEALTHCHECK_URL=https://hc-ping.com/your-uuid
```

### Phase 2: Automation & Scheduling (30 minutes)

#### File 4: `/etc/cron.d/mailserver-backup`
Cron job configuration

```bash
# Database backup every 6 hours
0 */6 * * * root /opt/mailserver-backup/backup.sh database

# Config backup daily at 2 AM
0 2 * * * root /opt/mailserver-backup/backup.sh configs

# Mail backup daily at 3 AM (if enabled)
0 3 * * * root /opt/mailserver-backup/backup.sh mail

# Full backup weekly on Sunday at 4 AM
0 4 * * 0 root /opt/mailserver-backup/backup.sh full

# Cleanup old backups daily at 5 AM
0 5 * * * root /opt/mailserver-backup/backup.sh cleanup
```

#### File 5: `/etc/systemd/system/mailserver-backup.service`
Systemd service for manual backups

```ini
[Unit]
Description=Mailserver Backup Service
After=mysql.service

[Service]
Type=oneshot
User=root
ExecStart=/opt/mailserver-backup/backup.sh full
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### Phase 3: Cloud Integration (30 minutes)

#### Support for Multiple Cloud Providers

**AWS S3:**
```bash
aws s3 sync $BACKUP_DIR/ s3://$S3_BUCKET/$(hostname)/
```

**DigitalOcean Spaces:**
```bash
s3cmd sync $BACKUP_DIR/ s3://$S3_BUCKET/$(hostname)/
```

**Backblaze B2:**
```bash
b2 sync $BACKUP_DIR/ b2://$S3_BUCKET/$(hostname)/
```

**Rsync to Remote Server:**
```bash
rsync -avz $BACKUP_DIR/ user@backup-server:/backups/$(hostname)/
```

#### File 6: `/opt/mailserver-backup/cloud-sync.sh`
Cloud synchronization script

**Features:**
- Auto-detect cloud provider
- Incremental uploads
- Bandwidth throttling option
- Retry logic
- Upload verification
- Cost estimation logging

### Phase 4: Monitoring & Alerts (30 minutes)

#### File 7: `/opt/mailserver-backup/healthcheck.sh`
Backup health monitoring

**Checks:**
- Last backup timestamp
- Backup file integrity
- Available disk space
- Cloud sync status
- Database replication lag (if applicable)

**Integrations:**
- Healthchecks.io ping
- Email notifications
- Slack/Discord webhooks (optional)
- Prometheus metrics endpoint (optional)

#### File 8: `/opt/mailserver-backup/verify-backup.sh`
Backup verification script

**Features:**
- Test restore to temporary database
- Verify backup file integrity (checksums)
- Check backup completeness
- Report generation

### Phase 5: API Integration (30 minutes)

#### API Endpoints to Add to `server.js`

**Trigger Manual Backup:**
```javascript
POST /system/backup
{
  "type": "full" | "database" | "configs" | "mail"
}
```

**List Available Backups:**
```javascript
GET /system/backups
Response: {
  "backups": [
    {
      "timestamp": "2025-10-05T12:00:00Z",
      "type": "database",
      "size": "45MB",
      "location": "local",
      "cloud_synced": true
    }
  ]
}
```

**Get Backup Status:**
```javascript
GET /system/backup/status
Response: {
  "last_backup": "2025-10-05T12:00:00Z",
  "next_backup": "2025-10-05T18:00:00Z",
  "status": "healthy",
  "disk_usage": "2.3GB / 100GB",
  "cloud_status": "synced"
}
```

**Restore from Backup:**
```javascript
POST /system/restore
{
  "backup_id": "2025-10-05T12:00:00Z",
  "type": "database",
  "dry_run": true
}
```

### Phase 6: Ansible Deployment Integration (30 minutes)

#### File 9: `ansible/roles/backup/tasks/main.yml`
Ansible role for backup setup

**Tasks:**
1. Create backup directories
2. Copy backup scripts
3. Set proper permissions
4. Install dependencies (awscli, s3cmd, etc.)
5. Configure cron jobs
6. Set up log rotation
7. Run initial backup
8. Verify backup functionality

#### File 10: `ansible/roles/backup/defaults/main.yml`
Default variables for backup role

```yaml
backup_enabled: true
backup_local_retention_days: 7
backup_config_retention_days: 30
backup_cloud_enabled: false
backup_cloud_provider: "s3"  # s3, spaces, b2, rsync
backup_mail_enabled: true
backup_mail_type: "incremental"
backup_notification_email: ""
```

---

## File Structure

```
/opt/mailserver-backup/
├── backup.sh              # Main backup script
├── restore.sh             # Restore script
├── cloud-sync.sh          # Cloud upload script
├── healthcheck.sh         # Health monitoring
├── verify-backup.sh       # Backup verification
├── config.env             # Configuration
└── lib/
    ├── database.sh        # Database backup functions
    ├── mail.sh            # Mail backup functions
    ├── config.sh          # Config backup functions
    ├── cloud.sh           # Cloud provider integrations
    └── notifications.sh   # Notification handlers

/var/backups/mailserver/
├── database/
│   ├── mailserver-20251005-120000.sql.gz
│   ├── mailserver-20251005-060000.sql.gz
│   └── ...
├── configs/
│   ├── configs-20251005.tar.gz
│   └── ...
├── mail/
│   ├── vmail-20251005-incremental.tar.gz
│   └── ...
└── full/
    └── full-backup-20251005.tar.gz

/var/log/
├── mailserver-backup.log
└── mailserver-restore.log

/etc/cron.d/
└── mailserver-backup

/etc/systemd/system/
└── mailserver-backup.service
```

---

## Implementation Steps

### Step 1: Create Directory Structure
```bash
sudo mkdir -p /opt/mailserver-backup/lib
sudo mkdir -p /var/backups/mailserver/{database,configs,mail,full}
sudo chmod 700 /var/backups/mailserver
```

### Step 2: Install Dependencies
```bash
# AWS CLI (for S3)
apt-get install -y awscli

# s3cmd (alternative S3 client)
apt-get install -y s3cmd

# Backup utilities
apt-get install -y pigz pv rsync
```

### Step 3: Create Backup Scripts
- Write all scripts from Phase 1-5
- Set executable permissions
- Test each script individually

### Step 4: Configure Automation
- Set up cron jobs
- Configure systemd service
- Enable log rotation

### Step 5: Test Backup & Restore
- Run initial backup
- Verify backup files
- Test restore to temporary location
- Validate restored data

### Step 6: Integrate with Ansible
- Add backup role to deployment
- Update deploy.yml
- Test on fresh server

### Step 7: Documentation
- Update README.md
- Create BACKUP_GUIDE.md
- Add restore procedures
- Document cloud setup

---

## Testing Plan

### Unit Tests (Per Script)

**backup.sh:**
- [ ] Database backup creates valid SQL dump
- [ ] Config backup includes all directories
- [ ] Mail backup creates valid archive
- [ ] Cleanup removes old backups correctly
- [ ] Script handles missing directories gracefully
- [ ] Script handles insufficient disk space

**restore.sh:**
- [ ] Lists available backups correctly
- [ ] Restores database without errors
- [ ] Restores configs to correct locations
- [ ] Dry-run mode doesn't modify data
- [ ] Validates backup before restore

**cloud-sync.sh:**
- [ ] Uploads to S3 successfully
- [ ] Handles network failures gracefully
- [ ] Retries failed uploads
- [ ] Verifies upload integrity

### Integration Tests

**Full Backup & Restore Cycle:**
1. Create test domain + mailboxes
2. Run full backup
3. Delete test data
4. Restore from backup
5. Verify all data restored correctly

**Disaster Recovery Simulation:**
1. Set up fresh server
2. Install Mailrice
3. Restore latest backup
4. Verify mail server operational
5. Test sending/receiving email

**Cloud Storage Test:**
1. Configure S3/Spaces
2. Run backup with cloud sync
3. Delete local backups
4. Restore from cloud only
5. Verify functionality

### Performance Tests

- [ ] Backup time for 1GB database
- [ ] Backup time for 10GB mail data
- [ ] Cloud upload time (various sizes)
- [ ] Restore time for full backup
- [ ] Disk I/O impact during backup
- [ ] CPU usage during compression

---

## Success Metrics

### Reliability
- [ ] Backups run successfully 99.9% of the time
- [ ] All backups verified for integrity
- [ ] Restore successful in < 15 minutes (database)
- [ ] Zero data loss in disaster recovery tests

### Performance
- [ ] Database backup completes in < 2 minutes (100MB DB)
- [ ] Incremental mail backup completes in < 10 minutes (10GB)
- [ ] Cloud sync completes in < 30 minutes (typical size)
- [ ] Minimal impact on mail server performance during backup

### Usability
- [ ] One-command restore process
- [ ] Clear logs and error messages
- [ ] Email notifications on failures
- [ ] API integration for programmatic access

---

## Cost Analysis

### Storage Costs (Monthly Estimates)

**Scenario 1: Small Agency (100 mailboxes)**
- Database: 10MB × 28 backups = 280MB
- Configs: 20MB × 30 backups = 600MB
- Mail (optional): 10GB × 7 backups = 70GB
- **Total:** ~71GB
- **Cost:** AWS S3 = $1.60/month, Backblaze B2 = $0.35/month

**Scenario 2: Medium Agency (500 mailboxes)**
- Database: 50MB × 28 backups = 1.4GB
- Configs: 20MB × 30 backups = 600MB
- Mail (optional): 50GB × 7 backups = 350GB
- **Total:** ~352GB
- **Cost:** AWS S3 = $8/month, Backblaze B2 = $1.76/month

**Scenario 3: Large Agency (2000 mailboxes)**
- Database: 200MB × 28 backups = 5.6GB
- Configs: 50MB × 30 backups = 1.5GB
- Mail (optional): 200GB × 7 backups = 1.4TB
- **Total:** ~1.4TB
- **Cost:** AWS S3 = $32/month, Backblaze B2 = $7/month

**Recommendation:** Backblaze B2 for cost efficiency, AWS S3 for performance

### Cost Optimization Strategies

1. **Disable Mail Backup** - Save 95% of storage costs
   - Rationale: Cold email agencies care about configs, not received mail
   - Keep: Database + configs only
   - New cost: $0.10-0.50/month

2. **Shorter Retention** - Reduce to 3-day retention
   - Save: 50% of storage
   - Risk: Less disaster recovery flexibility

3. **Compression Tuning** - Use higher compression (pigz -9)
   - Save: 20-40% of storage
   - Cost: Slightly slower backups

4. **Incremental-Only** - Skip full backups
   - Save: 30-50% of storage
   - Risk: More complex restore process

---

## Risk Analysis & Mitigation

### Risk 1: Backup Failure Goes Unnoticed
**Probability:** Medium
**Impact:** High
**Mitigation:**
- Email notifications on every failure
- Healthchecks.io integration (free tier)
- Daily automated verification
- API status endpoint for monitoring

### Risk 2: Insufficient Disk Space
**Probability:** Medium
**Impact:** High
**Mitigation:**
- Pre-check available space before backup
- Automatic cleanup of old backups
- Alert when disk usage > 80%
- Cloud-only mode option

### Risk 3: Corrupted Backups
**Probability:** Low
**Impact:** Critical
**Mitigation:**
- Generate checksums for all backups
- Weekly verification of random backup
- Test restore monthly (automated)
- Store backups in multiple locations

### Risk 4: Cloud Upload Failure
**Probability:** Medium
**Impact:** Medium
**Mitigation:**
- Retry logic (3 attempts)
- Keep local copies until cloud confirmed
- Alert on repeated failures
- Fallback to secondary cloud provider

### Risk 5: Slow Backups Impact Performance
**Probability:** Low
**Impact:** Medium
**Mitigation:**
- Run backups during low-traffic hours
- Use nice/ionice for low priority
- Incremental backups instead of full
- Parallel compression (pigz)

---

## Security Considerations

### Backup Security

1. **Encryption at Rest**
   - Encrypt backups before cloud upload
   - Use GPG encryption for sensitive data
   - Store encryption keys separately

2. **Access Control**
   - Backup files owned by root
   - 600 permissions on all backups
   - Separate cloud credentials per environment

3. **Credential Protection**
   - Store DB password in separate config
   - Use IAM roles instead of access keys (AWS)
   - Rotate cloud credentials regularly

4. **Audit Trail**
   - Log all backup/restore operations
   - Include who triggered operation (API)
   - Retention of audit logs (90 days)

### Compliance

**GDPR Considerations:**
- Backups contain personal data (emails)
- Document backup locations
- Ability to delete user data from backups
- Encryption in transit and at rest

**Data Retention Policy:**
- Define maximum backup retention
- Automatic deletion after retention period
- Document legal hold procedures

---

## Documentation Deliverables

### For End Users (README.md section)

1. **Backup Overview**
   - What gets backed up
   - Backup schedule
   - Where backups are stored

2. **Restore Guide**
   - How to list available backups
   - How to restore database
   - How to restore full system
   - Emergency contact info

3. **Configuration Guide**
   - How to enable cloud backups
   - How to adjust retention
   - How to set up notifications

### For Developers (BACKUP_GUIDE.md)

1. **Architecture Documentation**
   - System design
   - Component interactions
   - Data flow diagrams

2. **API Reference**
   - Endpoint documentation
   - Request/response examples
   - Error codes

3. **Troubleshooting**
   - Common issues and solutions
   - Log file locations
   - Debug mode instructions

4. **Maintenance Procedures**
   - How to update backup scripts
   - Testing procedures
   - Rollback procedures

---

## Timeline

### Day 1 (2-3 hours)
- ✅ Create backup directory structure
- ✅ Write core backup.sh script
- ✅ Write restore.sh script
- ✅ Create config.env template
- ✅ Set up cron jobs
- ✅ Test database backup/restore
- ✅ Basic documentation

### Day 2 (Optional Enhancements - 2-3 hours)
- ⭐ Cloud integration (S3/Spaces)
- ⭐ Email notifications
- ⭐ Health check monitoring
- ⭐ API endpoints
- ⭐ Ansible integration
- ⭐ Advanced documentation

---

## Success Criteria

- [ ] Automated backups run every 6 hours without manual intervention
- [ ] Database backup completes successfully 99%+ of the time
- [ ] Restore process completes in under 15 minutes
- [ ] Backups stored both locally and in cloud (if enabled)
- [ ] Old backups automatically cleaned up
- [ ] Email alerts sent on backup failures
- [ ] Full disaster recovery tested successfully
- [ ] Documentation complete and clear
- [ ] Integrated into Ansible deployment
- [ ] API endpoints functional

---

## Post-Implementation

### Maintenance Tasks

**Weekly:**
- [ ] Review backup logs for errors
- [ ] Check disk space usage
- [ ] Verify cloud sync status

**Monthly:**
- [ ] Test restore procedure
- [ ] Review and adjust retention policy
- [ ] Update documentation if needed

**Quarterly:**
- [ ] Full disaster recovery drill
- [ ] Review storage costs
- [ ] Optimize backup strategy
- [ ] Rotate cloud credentials

---

## Next Steps After Approval

1. **Confirm Scope**
   - Which phases to implement? (Core vs. Full)
   - Cloud provider preference? (S3, Spaces, B2, None)
   - Mail backup needed? (Yes/No)

2. **Gather Information**
   - Current database size?
   - Current mail data size?
   - Available disk space?
   - Cloud credentials (if applicable)?

3. **Implementation Order**
   - Start with Phase 1 (Core Scripts)
   - Test thoroughly
   - Add phases incrementally
   - Deploy via Ansible

**Ready to proceed? Which phases should I implement first?**
