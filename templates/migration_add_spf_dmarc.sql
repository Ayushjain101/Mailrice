-- Migration script to add SPF and DMARC fields to existing Mailrice installations
-- Run this on your mail server if you're upgrading from an older version

USE mailserver;

-- Add new columns to virtual_domains table
ALTER TABLE virtual_domains
ADD COLUMN IF NOT EXISTS spf_record TEXT AFTER dkim_public_key,
ADD COLUMN IF NOT EXISTS dmarc_record TEXT AFTER spf_record,
ADD COLUMN IF NOT EXISTS server_ip VARCHAR(45) AFTER dmarc_record;

-- The columns will be NULL for existing domains
-- Use the API to regenerate DNS records or manually set them:
--
-- For each domain, you can update manually:
-- UPDATE virtual_domains SET
--   server_ip = 'YOUR_SERVER_IP',
--   spf_record = 'v=spf1 ip4:YOUR_SERVER_IP -all',
--   dmarc_record = 'v=DMARC1; p=reject; rua=mailto:dmarc@YOUR_DOMAIN; ruf=mailto:dmarc@YOUR_DOMAIN; fo=1; adkim=s; aspf=s; pct=100'
-- WHERE name = 'YOUR_DOMAIN';
--
-- Or delete and re-add the domain via API to auto-generate all records

SELECT 'Migration completed. SPF and DMARC columns added to virtual_domains table.' AS status;
