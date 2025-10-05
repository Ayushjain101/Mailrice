const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const execAsync = promisify(exec);

// Helper function to generate SHA512-CRYPT password (Dovecot compatible)
function generateSHA512Password(password) {
  return new Promise((resolve, reject) => {
    exec(
      `doveadm pw -s SHA512-CRYPT -p '${password.replace(/'/g, "'\\''")}'`,
      (error, stdout, stderr) => {
        if (error) {
          reject(error);
        } else {
          resolve(stdout.trim());
        }
      }
    );
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
  connectionLimit: 10,
  queueLimit: 0
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

// Apply API key validation to all routes
app.use(validateApiKey);

// Helper function to generate DKIM keys
async function generateDKIMKeys(domain, selector = 'mail') {
  const dkimDir = '/etc/opendkim/keys/' + domain;
  const privateKeyPath = path.join(dkimDir, 'mail.private');
  const txtPath = path.join(dkimDir, 'mail.txt');

  try {
    // Create directory
    await execAsync(`sudo mkdir -p ${dkimDir}`);

    // Generate DKIM key
    await execAsync(
      `sudo opendkim-genkey -b 2048 -d ${domain} -D ${dkimDir} -s ${selector} -v`
    );

    // Set permissions
    await execAsync(`sudo chown -R opendkim:opendkim ${dkimDir}`);
    await execAsync(`sudo chmod 600 ${privateKeyPath}`);

    // Read keys
    const { stdout: privateKey } = await execAsync(`sudo cat ${privateKeyPath}`);
    const { stdout: publicKeyRaw } = await execAsync(`sudo cat ${txtPath}`);

    // Extract public key from TXT record
    const publicKeyMatch = publicKeyRaw.match(/p=([^"]+)/);
    const publicKey = publicKeyMatch ? publicKeyMatch[1].replace(/\s/g, '') : '';

    // Update KeyTable and SigningTable
    await execAsync(
      `echo "${selector}._domainkey.${domain} ${domain}:${selector}:${privateKeyPath}" | sudo tee -a /etc/opendkim/KeyTable`
    );
    await execAsync(
      `echo "*@${domain} ${selector}._domainkey.${domain}" | sudo tee -a /etc/opendkim/SigningTable`
    );

    // Reload OpenDKIM
    await execAsync('sudo systemctl reload opendkim');

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
app.post('/domains', async (req, res) => {
  const { domain, dkim_selector = 'mail' } = req.body;

  if (!domain) {
    return res.status(400).json({ error: 'Domain name required' });
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
  try {
    const [result] = await pool.execute('DELETE FROM virtual_domains WHERE name = ?', [req.params.domain]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Clean up DKIM files
    await execAsync(`sudo rm -rf /etc/opendkim/keys/${req.params.domain}`).catch(() => {});

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
app.post('/mailboxes', async (req, res) => {
  const { email, password, quota_mb = 1000 } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  // Extract domain from email
  const domain = email.split('@')[1];
  if (!domain) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

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

    // Create maildir
    const maildir = `/var/vmail/${domain}/${email.split('@')[0]}`;
    await execAsync(`sudo mkdir -p ${maildir}/{cur,new,tmp}`);
    await execAsync(`sudo chown -R vmail:vmail /var/vmail`);

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
  try {
    const [result] = await pool.execute('DELETE FROM virtual_users WHERE email = ?', [req.params.email]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Mailbox not found' });
    }

    // Clean up maildir
    const domain = req.params.email.split('@')[1];
    const username = req.params.email.split('@')[0];
    await execAsync(`sudo rm -rf /var/vmail/${domain}/${username}`).catch(() => {});

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
