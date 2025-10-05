const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// System user IDs for file ownership
const VMAIL_UID = parseInt(process.env.VMAIL_UID) || 5000;
const VMAIL_GID = parseInt(process.env.VMAIL_GID) || 5000;

// ==================== SECURITY: INPUT VALIDATION ====================

// Validate email address (RFC 5322 compliant)
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
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

    proc.stdout.on('data', (data) => stdout += data);
    proc.stderr.on('data', (data) => stderr += data);

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`Password generation failed: ${stderr}`));
      }
    });

    proc.on('error', reject);
  });
}
const app = express();
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

    next();
  } catch (error) {
    return res.status(500).json({ error: 'Authentication error' });
  }
}

// Apply rate limiters
app.use(authLimiter); // Auth rate limit applies to all routes
app.use(validateApiKey); // API key validation
app.use(generalLimiter); // General rate limit applies after successful auth

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

    // Set permissions using fs.chmod
    await fs.chmod(privateKeyPath, 0o600);

    // Read keys using Node.js fs (mailapi user is in opendkim group)
    const privateKey = await fs.readFile(privateKeyPath, 'utf8');
    const publicKeyRaw = await fs.readFile(txtPath, 'utf8');

    // Extract public key from TXT record
    const publicKeyMatch = publicKeyRaw.match(/p=([^"]+)/);
    const publicKey = publicKeyMatch ? publicKeyMatch[1].replace(/\s/g, '') : '';

    // Update KeyTable and SigningTable using Node.js fs
    const keyTableEntry = `${selector}._domainkey.${domain} ${domain}:${selector}:${privateKeyPath}\n`;
    const signingTableEntry = `*@${domain} ${selector}._domainkey.${domain}\n`;

    await fs.appendFile('/etc/opendkim/KeyTable', keyTableEntry);
    await fs.appendFile('/etc/opendkim/SigningTable', signingTableEntry);

    // Reload OpenDKIM using spawn (allowed in sudoers)
    await spawnAsync('sudo', ['systemctl', 'reload', 'opendkim']);

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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== DOMAIN ENDPOINTS ====================

// Get all domains
app.get('/domains', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT id, name, dkim_selector, dkim_public_key, created_at FROM virtual_domains');
    res.json({ domains: rows });
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

  try {
    // Check if domain already exists
    const [existing] = await pool.execute('SELECT id FROM virtual_domains WHERE name = ?', [domain]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Domain already exists' });
    }

    // Generate DKIM keys
    const dkimKeys = await generateDKIMKeys(domain, dkim_selector);

    // Insert domain into database
    const [result] = await pool.execute(
      'INSERT INTO virtual_domains (name, dkim_selector, dkim_private_key, dkim_public_key) VALUES (?, ?, ?, ?)',
      [domain, dkim_selector, dkimKeys.privateKey, dkimKeys.publicKey]
    );

    res.status(201).json({
      success: true,
      domain: {
        id: result.insertId,
        name: domain,
        dkim_selector: dkim_selector,
        dkim_public_key: dkimKeys.publicKey,
        dkim_dns_record: dkimKeys.dnsRecord
      },
      message: 'Domain added successfully. Add the DKIM DNS record to your DNS provider.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete domain
app.delete('/domains/:domain', async (req, res) => {
  // Validate domain
  if (!isValidDomain(req.params.domain)) {
    return res.status(400).json({ error: 'Invalid domain name' });
  }

  try {
    const [result] = await pool.execute('DELETE FROM virtual_domains WHERE name = ?', [req.params.domain]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Clean up DKIM files using Node.js fs
    const dkimDir = path.join('/etc/opendkim/keys', req.params.domain);

    // Validate path safety before deletion
    if (await isPathSafe('/etc/opendkim/keys', dkimDir)) {
      await fs.rm(dkimDir, { recursive: true, force: true }).catch(() => {});
    }

    res.json({ success: true, message: 'Domain deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
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

// ==================== MAILBOX ENDPOINTS ====================

// Get all mailboxes
app.get('/mailboxes', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT u.id, u.email, u.quota_mb, u.created_at, d.name as domain FROM virtual_users u JOIN virtual_domains d ON u.domain_id = d.id'
    );
    res.json({ mailboxes: rows });
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

  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  if (typeof quota_mb !== 'number' || quota_mb < 1 || quota_mb > 100000) {
    return res.status(400).json({ error: 'Invalid quota (1-100000 MB)' });
  }

  // Extract domain from email
  const domain = email.split('@')[1];
  const username = email.split('@')[0];

  try {
    // Check if domain exists
    const [domainRows] = await pool.execute('SELECT id FROM virtual_domains WHERE name = ?', [domain]);
    if (domainRows.length === 0) {
      return res.status(404).json({ error: 'Domain not found. Please add the domain first.' });
    }

    const domainId = domainRows[0].id;

    // Hash password with SHA512-CRYPT for Dovecot
    const hashedPassword = await generateSHA512Password(password);

    // Insert mailbox
    const [result] = await pool.execute(
      'INSERT INTO virtual_users (domain_id, email, password, quota_mb) VALUES (?, ?, ?, ?)',
      [domainId, email, hashedPassword, quota_mb]
    );

    // Create maildir using Node.js fs (no sudo needed)
    const maildir = path.join('/var/vmail', domain, username);

    // Validate path safety
    if (!await isPathSafe('/var/vmail', maildir)) {
      throw new Error('Invalid maildir path');
    }

    // Create maildir structure
    await fs.mkdir(path.join(maildir, 'cur'), { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(maildir, 'new'), { recursive: true, mode: 0o700 });
    await fs.mkdir(path.join(maildir, 'tmp'), { recursive: true, mode: 0o700 });

    // Set ownership to vmail:vmail
    await fs.chown(maildir, VMAIL_UID, VMAIL_GID);
    await fs.chown(path.join(maildir, 'cur'), VMAIL_UID, VMAIL_GID);
    await fs.chown(path.join(maildir, 'new'), VMAIL_UID, VMAIL_GID);
    await fs.chown(path.join(maildir, 'tmp'), VMAIL_UID, VMAIL_GID);

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
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Mailbox already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update mailbox password
app.put('/mailboxes/:email/password', async (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password required' });
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

// ==================== API KEY MANAGEMENT ====================

// Generate new API key
app.post('/api-keys', async (req, res) => {
  const { description = 'API Key' } = req.body;

  try {
    const apiKey = require('crypto').randomBytes(32).toString('hex');

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

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Mail Server API running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
