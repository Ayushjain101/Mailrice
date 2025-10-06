const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const lockFile = require('proper-lockfile');
require('dotenv').config();

// ==================== ENVIRONMENT VALIDATION ====================

// Validate required environment variables
const requiredEnvVars = [
  'DB_HOST',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'MASTER_API_KEY'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('ERROR: Missing required environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`  - ${varName}`);
  });
  console.error('\nPlease set these variables in your .env file or environment.');
  console.error('Example .env file:');
  console.error('DB_HOST=localhost');
  console.error('DB_USER=mailuser');
  console.error('DB_PASSWORD=your_secure_password');
  console.error('DB_NAME=mailserver');
  console.error('MASTER_API_KEY=your_master_api_key');
  process.exit(1);
}

// Validate MASTER_API_KEY strength
if (process.env.MASTER_API_KEY.length < 32) {
  console.error('ERROR: MASTER_API_KEY must be at least 32 characters long for security.');
  console.error('Generate a secure key with: openssl rand -hex 32');
  process.exit(1);
}

console.log('✓ Environment variables validated');

// System user IDs for file ownership
const VMAIL_UID = parseInt(process.env.VMAIL_UID) || 5000;
const VMAIL_GID = parseInt(process.env.VMAIL_GID) || 5000;

// ==================== SECURITY: INPUT VALIDATION ====================

// Validate email address (RFC 5322 compliant with security hardening)
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;

  // Explicitly reject path traversal and dangerous characters
  if (email.includes('/') || email.includes('\\') ||
      email.includes('..') || email.includes('\0')) {
    return false;
  }

  // Remove / from allowed characters for security
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(email) && email.length <= 254;
}

// Validate domain name (RFC 1035)
function isValidDomain(domain) {
  if (!domain || typeof domain !== 'string') return false;
  const domainRegex = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
  return domainRegex.test(domain) && domain.length <= 253;
}

// Validate DKIM selector
function isValidSelector(selector) {
  if (!selector || typeof selector !== 'string') return false;
  const selectorRegex = /^[a-zA-Z0-9._-]+$/;
  return selectorRegex.test(selector) && selector.length <= 63;
}

// Validate path is within allowed directory
async function isPathSafe(basePath, targetPath) {
  try {
    const normalizedBase = path.resolve(basePath);
    const normalizedTarget = path.resolve(targetPath);
    return normalizedTarget.startsWith(normalizedBase);
  } catch (error) {
    return false;
  }
}

// Validate password strength
function isStrongPassword(password) {
  if (!password || password.length < 12) return false;

  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\/'`~]/.test(password);

  return hasUpperCase && hasLowerCase && hasNumber && hasSpecial;
}

// ==================== SECURITY: SAFE COMMAND EXECUTION ====================

// Execute command without shell (prevents injection)
function spawnAsync(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      ...options,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => stdout += data);
    proc.stderr.on('data', (data) => stderr += data);

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', reject);
  });
}

// Helper function to generate SHA512-CRYPT password (Dovecot compatible)
function generateSHA512Password(password) {
  return new Promise((resolve, reject) => {
    // Use spawn to prevent shell injection
    const proc = spawn('doveadm', ['pw', '-s', 'SHA512-CRYPT', '-p', password], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => stdout += data.toString());
    proc.stderr.on('data', (data) => stderr += data.toString());

    proc.on('error', reject);

    proc.on('close', (code) => {
      // Wait for next tick to ensure all data events are processed
      setImmediate(() => {
        if (code === 0) {
          let hash = stdout.trim();
          if (!hash || hash.length < 20) {
            reject(new Error('Invalid password hash generated'));
          } else {
            // Remove {SHA512-CRYPT} prefix as Dovecot doesn't need it when default_pass_scheme is set
            hash = hash.replace(/^\{SHA512-CRYPT\}/, '');
            resolve(hash);
          }
        } else {
          reject(new Error(`Password generation failed: ${stderr}`));
        }
      });
    });
  });
}
const app = express();

// HTTP request logging
app.use(morgan('combined'));

app.use(bodyParser.json());

// Database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 100,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Rate Limiting Configuration
// General API rate limit - prevents API abuse
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000, // 1 minute default
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // 100 requests per minute default
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by API key if available, otherwise by IP
    return req.headers['x-api-key'] || req.ip;
  }
});

// Strict rate limit for resource-intensive operations (mailbox/domain creation)
const strictLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_STRICT_WINDOW_MS) || 60000, // 1 minute default
  max: parseInt(process.env.RATE_LIMIT_STRICT_MAX) || 10, // 10 creates per minute default
  message: { error: 'Too many creation requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.headers['x-api-key'] || req.ip;
  }
});

// Auth rate limit - prevents brute force attacks on API keys
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 900000, // 15 minutes default
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX) || 5, // 5 failed attempts
  message: { error: 'Too many failed authentication attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed auth attempts
});

// API Key Middleware
async function validateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id FROM api_keys WHERE api_key = ?',
      [apiKey]
    );

    if (rows.length === 0) {
      return res.status(403).json({ error: 'Invalid API key' });
    }

    // Update last_used_at timestamp (fire and forget, but log errors)
    pool.execute('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?', [rows[0].id])
      .catch((err) => {
        console.error('Failed to update API key last_used_at:', err.message);
      });

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Authentication error' });
  }
}

// Health check endpoint (no auth required for monitoring)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API key creation endpoint (uses master key, not API key) with auth limiter
app.post('/api-keys', authLimiter, async (req, res) => {
  const { description = 'API Key', master_key } = req.body;

  // Require master key from environment
  if (!process.env.MASTER_API_KEY || master_key !== process.env.MASTER_API_KEY) {
    return res.status(403).json({ error: 'Invalid master key' });
  }

  try {
    const apiKey = crypto.randomBytes(32).toString('hex');

    const [result] = await pool.execute(
      'INSERT INTO api_keys (api_key, description) VALUES (?, ?)',
      [apiKey, description]
    );

    res.status(201).json({
      success: true,
      api_key: apiKey,
      description: description,
      message: 'API key created. Store it securely - it cannot be retrieved later.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Apply authentication and rate limiting to all other routes
app.use(validateApiKey); // API key validation (removed global auth limiter)
app.use(generalLimiter); // General rate limit applies after successful auth

// Helper function to get server's public IP address
async function getServerIP() {
  try {
    // Try to get IP from environment variable first
    if (process.env.SERVER_IP) {
      return process.env.SERVER_IP;
    }

    // Otherwise, detect from network interface
    const result = await spawnAsync('hostname', ['-I']);
    const ips = result.stdout.trim().split(/\s+/);

    // Return first public IP (not localhost)
    for (const ip of ips) {
      if (ip && !ip.startsWith('127.') && !ip.startsWith('::1')) {
        return ip;
      }
    }

    throw new Error('Could not detect server IP');
  } catch (error) {
    throw new Error(`Failed to get server IP: ${error.message}`);
  }
}

// Helper function to generate SPF record
function generateSPFRecord(serverIP) {
  // Strict SPF: only this server can send emails
  return `v=spf1 ip4:${serverIP} -all`;
}

// Helper function to generate DMARC record with reject policy
function generateDMARCRecord(domain) {
  // Strict DMARC policy with reject
  return `v=DMARC1; p=reject; rua=mailto:dmarc@${domain}; ruf=mailto:dmarc@${domain}; fo=1; adkim=s; aspf=s; pct=100`;
}

// Helper function to generate DKIM keys
async function generateDKIMKeys(domain, selector = 'mail') {
  const dkimDir = path.join('/etc/opendkim/keys', domain);
  const privateKeyPath = path.join(dkimDir, 'mail.private');
  const txtPath = path.join(dkimDir, 'mail.txt');

  try {
    // Create directory using Node.js fs
    await fs.mkdir(dkimDir, { recursive: true, mode: 0o755 });

    // Generate DKIM key using spawn (no shell injection)
    // Note: opendkim-genkey requires sudo (configured in sudoers)
    await spawnAsync('sudo', [
      'opendkim-genkey',
      '-b', '2048',
      '-d', domain,
      '-D', dkimDir,
      '-s', selector,
      '-v'
    ]);

    // Change ownership to opendkim:opendkim so mailapi (in opendkim group) can read
    await spawnAsync('sudo', ['chown', '-R', 'opendkim:opendkim', dkimDir]);

    // Set permissions so group can read (640 for files, 750 for directory)
    await spawnAsync('sudo', ['chmod', '750', dkimDir]);
    await spawnAsync('sudo', ['chmod', '640', privateKeyPath]);
    await spawnAsync('sudo', ['chmod', '640', txtPath]);

    // Read keys using Node.js fs (mailapi user is in opendkim group)
    const privateKey = await fs.readFile(privateKeyPath, 'utf8');
    const publicKeyRaw = await fs.readFile(txtPath, 'utf8');

    // Extract public key from TXT record
    const publicKeyMatch = publicKeyRaw.match(/p=([^"]+)/);
    const publicKey = publicKeyMatch ? publicKeyMatch[1].replace(/\s/g, '') : '';

    // Update KeyTable and SigningTable with file locking to prevent corruption
    const keyTableEntry = `${selector}._domainkey.${domain} ${domain}:${selector}:${privateKeyPath}\n`;
    const signingTableEntry = `*@${domain} ${selector}._domainkey.${domain}\n`;

    // Lock and update KeyTable
    const keyTableRelease = await lockFile.lock('/etc/opendkim/KeyTable', {
      retries: { retries: 10, minTimeout: 100, maxTimeout: 1000 }
    });

    try {
      await fs.appendFile('/etc/opendkim/KeyTable', keyTableEntry);
    } finally {
      await keyTableRelease();
    }

    // Lock and update SigningTable
    const signingTableRelease = await lockFile.lock('/etc/opendkim/SigningTable', {
      retries: { retries: 10, minTimeout: 100, maxTimeout: 1000 }
    });

    try {
      await fs.appendFile('/etc/opendkim/SigningTable', signingTableEntry);
    } finally {
      await signingTableRelease();
    }

    // Reload OpenDKIM using spawn (allowed in sudoers) - log errors but don't fail
    try {
      await spawnAsync('sudo', ['systemctl', 'reload', 'opendkim']);
    } catch (reloadError) {
      console.error(`OpenDKIM reload failed for domain ${domain}:`, reloadError.message);
      // Log but don't fail - domain was created successfully, admin can manually reload
    }

    return {
      privateKey: privateKey.trim(),
      publicKey: publicKey,
      selector: selector,
      dnsRecord: `${selector}._domainkey.${domain} IN TXT "v=DKIM1; k=rsa; p=${publicKey}"`
    };
  } catch (error) {
    throw new Error(`Failed to generate DKIM keys: ${error.message}`);
  }
}

// ==================== DOMAIN ENDPOINTS ====================

// Get all domains
app.get('/domains', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 1000) {
      return res.status(400).json({ error: 'Invalid pagination parameters. Page must be >= 1, limit must be 1-1000' });
    }

    const offset = (page - 1) * limit;

    // Get total count
    const [countResult] = await pool.execute('SELECT COUNT(*) as total FROM virtual_domains');
    const total = countResult[0].total;

    // Get paginated results (LIMIT/OFFSET must be integers, not placeholders in MySQL)
    const [rows] = await pool.execute(
      `SELECT id, name, dkim_selector, dkim_public_key, created_at FROM virtual_domains ORDER BY created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`
    );

    res.json({
      data: rows,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific domain
app.get('/domains/:domain', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, dkim_selector, dkim_public_key, created_at FROM virtual_domains WHERE name = ?',
      [req.params.domain]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    res.json({ domain: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add domain
app.post('/domains', strictLimiter, async (req, res) => {
  const { domain, dkim_selector = 'mail' } = req.body;

  // Validate domain name
  if (!domain || !isValidDomain(domain)) {
    return res.status(400).json({ error: 'Invalid domain name' });
  }

  // Validate DKIM selector
  if (!isValidSelector(dkim_selector)) {
    return res.status(400).json({ error: 'Invalid DKIM selector' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Check if domain already exists with SELECT FOR UPDATE to prevent race condition
    const [existing] = await connection.execute(
      'SELECT id FROM virtual_domains WHERE name = ? FOR UPDATE',
      [domain]
    );

    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Domain already exists' });
    }

    // Get server IP
    const serverIP = await getServerIP();

    // Generate DKIM keys
    const dkimKeys = await generateDKIMKeys(domain, dkim_selector);

    // Generate SPF and DMARC records
    const spfRecord = generateSPFRecord(serverIP);
    const dmarcRecord = generateDMARCRecord(domain);

    // Insert domain into database with SPF and DMARC
    const [result] = await connection.execute(
      'INSERT INTO virtual_domains (name, dkim_selector, dkim_private_key, dkim_public_key, spf_record, dmarc_record, server_ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [domain, dkim_selector, dkimKeys.privateKey, dkimKeys.publicKey, spfRecord, dmarcRecord, serverIP]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      domain: {
        id: result.insertId,
        name: domain,
        dkim_selector: dkim_selector,
        dkim_public_key: dkimKeys.publicKey,
        server_ip: serverIP
      },
      dns_records: {
        dkim: dkimKeys.dnsRecord,
        spf: `${domain} IN TXT "${spfRecord}"`,
        dmarc: `_dmarc.${domain} IN TXT "${dmarcRecord}"`
      },
      message: 'Domain added successfully. Add the DNS records to your DNS provider.'
    });
  } catch (error) {
    if (connection) await connection.rollback();

    // Clean up orphaned DKIM files on failure
    const dkimDir = path.join('/etc/opendkim/keys', domain);
    if (await isPathSafe('/etc/opendkim/keys', dkimDir)) {
      await fs.rm(dkimDir, { recursive: true, force: true }).catch(() => {});
    }

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Domain already exists' });
    }
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) connection.release();
  }
});

// Delete domain
app.delete('/domains/:domain', async (req, res) => {
  // Validate domain
  if (!isValidDomain(req.params.domain)) {
    return res.status(400).json({ error: 'Invalid domain name' });
  }

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Lock domain row with FOR UPDATE to prevent race conditions
    const [domainRows] = await connection.execute(
      'SELECT id FROM virtual_domains WHERE name = ? FOR UPDATE',
      [req.params.domain]
    );

    if (domainRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domainId = domainRows[0].id;

    // Lock mailbox count check with FOR UPDATE
    const [mailboxes] = await connection.execute(
      'SELECT COUNT(*) as count FROM virtual_users WHERE domain_id = ? FOR UPDATE',
      [domainId]
    );

    if (mailboxes[0].count > 0) {
      await connection.rollback();
      return res.status(409).json({
        error: 'Cannot delete domain with existing mailboxes',
        mailbox_count: mailboxes[0].count,
        message: 'Delete all mailboxes first before deleting the domain'
      });
    }

    const [result] = await connection.execute('DELETE FROM virtual_domains WHERE name = ?', [req.params.domain]);

    await connection.commit();

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Clean up DKIM files after successful deletion
    const dkimDir = path.join('/etc/opendkim/keys', req.params.domain);

    // Validate path safety before deletion
    if (await isPathSafe('/etc/opendkim/keys', dkimDir)) {
      await fs.rm(dkimDir, { recursive: true, force: true }).catch(() => {});
    }

    res.json({ success: true, message: 'Domain deleted successfully' });
  } catch (error) {
    if (connection) await connection.rollback();
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) connection.release();
  }
});

// Get DKIM record for domain
app.get('/domains/:domain/dkim', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT dkim_selector, dkim_public_key FROM virtual_domains WHERE name = ?',
      [req.params.domain]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const { dkim_selector, dkim_public_key } = rows[0];

    res.json({
      domain: req.params.domain,
      selector: dkim_selector,
      public_key: dkim_public_key,
      dns_record: `${dkim_selector}._domainkey.${req.params.domain} IN TXT "v=DKIM1; k=rsa; p=${dkim_public_key}"`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all DNS records (DKIM, SPF, DMARC) for domain
app.get('/domains/:domain/dns', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT dkim_selector, dkim_public_key, spf_record, dmarc_record FROM virtual_domains WHERE name = ?',
      [req.params.domain]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const { dkim_selector, dkim_public_key, spf_record, dmarc_record } = rows[0];

    res.json({
      domain: req.params.domain,
      dns_records: {
        dkim: `${dkim_selector}._domainkey.${req.params.domain} IN TXT "v=DKIM1; k=rsa; p=${dkim_public_key}"`,
        spf: `${req.params.domain} IN TXT "${spf_record}"`,
        dmarc: `_dmarc.${req.params.domain} IN TXT "${dmarc_record}"`
      },
      message: 'Add these DNS records to your DNS provider for full email authentication'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== MAILBOX ENDPOINTS ====================

// Get all mailboxes
app.get('/mailboxes', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    // Validate pagination parameters
    if (page < 1 || limit < 1 || limit > 1000) {
      return res.status(400).json({ error: 'Invalid pagination parameters. Page must be >= 1, limit must be 1-1000' });
    }

    const offset = (page - 1) * limit;

    // Get total count
    const [countResult] = await pool.execute('SELECT COUNT(*) as total FROM virtual_users');
    const total = countResult[0].total;

    // Get paginated results (LIMIT/OFFSET must be integers, not placeholders in MySQL)
    const [rows] = await pool.execute(
      `SELECT u.id, u.email, u.quota_mb, u.created_at, d.name as domain FROM virtual_users u JOIN virtual_domains d ON u.domain_id = d.id ORDER BY u.created_at DESC LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}`
    );

    res.json({
      data: rows,
      pagination: {
        page: page,
        limit: limit,
        total: total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific mailbox
app.get('/mailboxes/:email', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT u.id, u.email, u.quota_mb, u.created_at, d.name as domain FROM virtual_users u JOIN virtual_domains d ON u.domain_id = d.id WHERE u.email = ?',
      [req.params.email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Mailbox not found' });
    }

    res.json({ mailbox: rows[0] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create mailbox
app.post('/mailboxes', strictLimiter, async (req, res) => {
  const { email, password, quota_mb = 1000 } = req.body;

  // Validate inputs
  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error: 'Password must be at least 12 characters with uppercase, lowercase, number, and special character (!@#$%^&* etc.)'
    });
  }

  if (typeof quota_mb !== 'number' || quota_mb < 1 || quota_mb > 100000) {
    return res.status(400).json({ error: 'Invalid quota (1-100000 MB)' });
  }

  // Extract domain from email
  const domain = email.split('@')[1];
  const username = email.split('@')[0];

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Lock domain row to prevent it from being deleted during mailbox creation
    const [domainRows] = await connection.execute(
      'SELECT id FROM virtual_domains WHERE name = ? FOR UPDATE',
      [domain]
    );

    if (domainRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Domain not found. Please add the domain first.' });
    }

    const domainId = domainRows[0].id;

    // Hash password with SHA512-CRYPT for Dovecot
    const hashedPassword = await generateSHA512Password(password);

    // Create maildir first before database insert
    const maildir = path.join('/var/vmail', domain, username);

    // Validate path safety
    if (!await isPathSafe('/var/vmail', maildir)) {
      await connection.rollback();
      throw new Error('Invalid maildir path');
    }

    // Create maildir structure
    await fs.mkdir(path.join(maildir, 'cur'), { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(maildir, 'new'), { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(maildir, 'tmp'), { recursive: true, mode: 0o700 });

    // Set ownership to vmail:vmail using sudo (configured in sudoers)
    await spawnAsync('sudo', ['chown', '-R', 'vmail:vmail', maildir]);

    // Insert mailbox into database
    const [result] = await connection.execute(
      'INSERT INTO virtual_users (domain_id, email, password, quota_mb) VALUES (?, ?, ?, ?)',
      [domainId, email, hashedPassword, quota_mb]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      mailbox: {
        id: result.insertId,
        email: email,
        quota_mb: quota_mb
      },
      message: 'Mailbox created successfully'
    });
  } catch (error) {
    if (connection) await connection.rollback();

    // Clean up maildir on failure
    const maildir = path.join('/var/vmail', domain, username);
    if (await isPathSafe('/var/vmail', maildir)) {
      await fs.rm(maildir, { recursive: true, force: true }).catch(() => {});
    }

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Mailbox already exists' });
    }
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) connection.release();
  }
});

// Update mailbox password
app.put('/mailboxes/:email/password', async (req, res) => {
  const { password } = req.body;

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error: 'Password must be at least 12 characters with uppercase, lowercase, number, and special character (!@#$%^&* etc.)'
    });
  }

  try {
    const hashedPassword = await generateSHA512Password(password);

    const [result] = await pool.execute(
      'UPDATE virtual_users SET password = ? WHERE email = ?',
      [hashedPassword, req.params.email]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Mailbox not found' });
    }

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete mailbox
app.delete('/mailboxes/:email', async (req, res) => {
  // Validate email
  if (!isValidEmail(req.params.email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const [result] = await pool.execute('DELETE FROM virtual_users WHERE email = ?', [req.params.email]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Mailbox not found' });
    }

    // Clean up maildir using Node.js fs (no sudo needed)
    const domain = req.params.email.split('@')[1];
    const username = req.params.email.split('@')[0];
    const maildir = path.join('/var/vmail', domain, username);

    // Validate path safety before deletion
    if (await isPathSafe('/var/vmail', maildir)) {
      await fs.rm(maildir, { recursive: true, force: true }).catch(() => {});
    }

    res.json({ success: true, message: 'Mailbox deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ALIAS ENDPOINTS ====================

// Get aliases for a specific domain
app.get('/domains/:domain/aliases', async (req, res) => {
  try {
    // Validate domain
    if (!isValidDomain(req.params.domain)) {
      return res.status(400).json({ error: 'Invalid domain name' });
    }

    // Check if domain exists
    const [domainRows] = await pool.execute('SELECT id FROM virtual_domains WHERE name = ?', [req.params.domain]);
    if (domainRows.length === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    const domainId = domainRows[0].id;

    // Get aliases for this domain
    const [rows] = await pool.execute(
      'SELECT id, source, destination, created_at FROM virtual_aliases WHERE domain_id = ? ORDER BY created_at DESC',
      [domainId]
    );

    res.json({ aliases: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create alias
app.post('/aliases', strictLimiter, async (req, res) => {
  const { source, destination } = req.body;

  // Validate source email
  if (!source || !isValidEmail(source)) {
    return res.status(400).json({ error: 'Invalid source email address' });
  }

  // Validate destination email
  if (!destination || !isValidEmail(destination)) {
    return res.status(400).json({ error: 'Invalid destination email address' });
  }

  // Extract domain from source
  const domain = source.split('@')[1];

  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Lock domain row
    const [domainRows] = await connection.execute(
      'SELECT id FROM virtual_domains WHERE name = ? FOR UPDATE',
      [domain]
    );

    if (domainRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Domain not found. The source email domain must exist.' });
    }

    const domainId = domainRows[0].id;

    // Check if source already exists as a mailbox with lock to prevent race
    const [mailboxCheck] = await connection.execute(
      'SELECT id FROM virtual_users WHERE email = ? FOR UPDATE',
      [source]
    );

    if (mailboxCheck.length > 0) {
      await connection.rollback();
      return res.status(409).json({ error: 'Source email already exists as a mailbox. Cannot create alias.' });
    }

    // Insert alias
    const [result] = await connection.execute(
      'INSERT INTO virtual_aliases (domain_id, source, destination) VALUES (?, ?, ?)',
      [domainId, source, destination]
    );

    await connection.commit();

    res.status(201).json({
      success: true,
      alias: {
        id: result.insertId,
        source: source,
        destination: destination
      },
      message: 'Alias created successfully'
    });
  } catch (error) {
    if (connection) await connection.rollback();

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Alias with this source email already exists' });
    }
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) connection.release();
  }
});

// Delete alias
app.delete('/aliases/:id', async (req, res) => {
  const aliasId = parseInt(req.params.id);

  if (!aliasId || aliasId < 1) {
    return res.status(400).json({ error: 'Invalid alias ID' });
  }

  try {
    const [result] = await pool.execute('DELETE FROM virtual_aliases WHERE id = ?', [aliasId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Alias not found' });
    }

    res.json({ success: true, message: 'Alias deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== QUOTA ENDPOINTS ====================

// Get mailbox quota usage
app.get('/mailboxes/:email/quota', async (req, res) => {
  try {
    // Validate email
    if (!isValidEmail(req.params.email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Check if mailbox exists and get quota limit
    const [mailboxRows] = await pool.execute(
      'SELECT id, email, quota_mb FROM virtual_users WHERE email = ?',
      [req.params.email]
    );

    if (mailboxRows.length === 0) {
      return res.status(404).json({ error: 'Mailbox not found' });
    }

    const quotaLimit = mailboxRows[0].quota_mb;

    // Calculate disk usage using du command
    const domain = req.params.email.split('@')[1];
    const username = req.params.email.split('@')[0];
    const maildir = path.join('/var/vmail', domain, username);

    // Validate path safety
    if (!await isPathSafe('/var/vmail', maildir)) {
      return res.status(400).json({ error: 'Invalid mailbox path' });
    }

    let usedMb = 0;
    try {
      // Check if maildir exists
      await fs.access(maildir);

      // Use du to calculate disk usage (in KB), then convert to MB
      const result = await spawnAsync('du', ['-sk', maildir]);
      const duOutput = result.stdout.trim();

      if (!duOutput) {
        throw new Error('Empty du output');
      }

      const usedKb = parseInt(duOutput.split(/\s+/)[0]);

      if (isNaN(usedKb) || usedKb < 0) {
        console.error(`Invalid du output for ${maildir}: ${duOutput}`);
        usedMb = 0;
      } else {
        usedMb = Math.round(usedKb / 1024);
      }
    } catch (error) {
      // Maildir doesn't exist yet or du failed, usage is 0
      console.error(`Quota calculation failed for ${maildir}:`, error.message);
      usedMb = 0;
    }

    const percentUsed = quotaLimit > 0 ? Math.round((usedMb / quotaLimit) * 100) : 0;

    res.json({
      email: req.params.email,
      quota: {
        limit_mb: quotaLimit,
        used_mb: usedMb,
        available_mb: Math.max(0, quotaLimit - usedMb),
        percent_used: percentUsed
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update mailbox quota limit
app.put('/mailboxes/:email/quota', async (req, res) => {
  const { quota_mb } = req.body;

  // Validate email
  if (!isValidEmail(req.params.email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Validate quota
  if (typeof quota_mb !== 'number' || quota_mb < 1 || quota_mb > 100000) {
    return res.status(400).json({ error: 'Invalid quota (1-100000 MB)' });
  }

  try {
    const [result] = await pool.execute(
      'UPDATE virtual_users SET quota_mb = ? WHERE email = ?',
      [quota_mb, req.params.email]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Mailbox not found' });
    }

    res.json({
      success: true,
      email: req.params.email,
      quota_mb: quota_mb,
      message: 'Quota updated successfully'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test database connection on startup
async function testDatabaseConnection() {
  try {
    console.log('Testing database connection...');
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    console.log('✓ Database connection successful');
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    console.error('Please check DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env file');
    process.exit(1);
  }
}

// Handle database pool errors
pool.on('error', (err) => {
  console.error('Database pool error:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('Database connection lost. Attempting to reconnect...');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Closing server gracefully...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received. Closing server gracefully...');
  await pool.end();
  process.exit(0);
});

// Start server after database connection test
const PORT = process.env.PORT || 3000;

testDatabaseConnection().then(() => {
  app.listen(PORT, () => {
    console.log(`✓ Mail Server API running on port ${PORT}`);
    console.log(`✓ Health check: http://localhost:${PORT}/health`);
    console.log(`✓ API ready to accept requests`);
  });
}).catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
