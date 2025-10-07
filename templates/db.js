// Database Connection Pool Module
// Phase 2: Performance Enhancement - Optimized Connection Pooling

const mysql = require('mysql2/promise');

// Create optimized connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'mailserver',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'mailserver',

  // Connection pool settings - Phase 2 optimizations
  waitForConnections: true,        // Queue requests when all connections are busy
  connectionLimit: 20,              // Max 20 concurrent connections (increased from 10)
  queueLimit: 0,                    // No limit on queued requests

  // Keep-alive settings
  enableKeepAlive: true,            // Keep TCP connections alive
  keepAliveInitialDelay: 10000,     // Wait 10s before first keep-alive probe

  // Timeouts
  connectTimeout: 10000,            // 10s connection timeout
  idleTimeout: 60000,               // Close idle connections after 1 minute
  maxIdle: 10,                      // Keep max 10 idle connections

  // Character set
  charset: 'utf8mb4',

  // Timezone
  timezone: '+00:00',

  // Additional performance settings
  multipleStatements: false,        // Security: prevent SQL injection via multiple statements
  namedPlaceholders: false,         // Use ? placeholders for better performance

  // Debug (set to true only in development)
  debug: process.env.DB_DEBUG === 'true' ? ['ComQueryPacket'] : false
});

// Connection pool event handlers
pool.on('connection', (connection) => {
  console.log(`New DB connection established: ${connection.threadId}`);
});

pool.on('acquire', (connection) => {
  console.log(`Connection ${connection.threadId} acquired from pool`);
});

pool.on('release', (connection) => {
  console.log(`Connection ${connection.threadId} released back to pool`);
});

pool.on('enqueue', () => {
  console.log('Waiting for available connection slot');
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('MySQL pool error:', err);

  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.error('Database connection lost. Pool will attempt to reconnect...');
  } else if (err.code === 'ER_CON_COUNT_ERROR') {
    console.error('Too many database connections!');
  } else if (err.code === 'ECONNREFUSED') {
    console.error('Database connection refused!');
  }
});

/**
 * Test database connection
 * @returns {Promise<boolean>}
 */
async function testConnection() {
  try {
    console.log('Testing database connection...');
    const connection = await pool.getConnection();
    await connection.ping();

    // Get connection info
    const [rows] = await connection.query('SELECT VERSION() as version, DATABASE() as database');
    console.log(`✓ Database connection successful`);
    console.log(`  MySQL version: ${rows[0].version}`);
    console.log(`  Database: ${rows[0].database}`);

    connection.release();
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    console.error('Please check DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env file');
    throw error;
  }
}

/**
 * Get pool statistics
 * @returns {Object} Pool statistics
 */
function getPoolStats() {
  return {
    total_connections: pool.pool._allConnections.length,
    active_connections: pool.pool._allConnections.length - pool.pool._freeConnections.length,
    idle_connections: pool.pool._freeConnections.length,
    queued_requests: pool.pool._connectionQueue.length
  };
}

/**
 * Execute query with automatic retry on connection errors
 * @param {string} sql - SQL query
 * @param {Array} params - Query parameters
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<Array>}
 */
async function queryWithRetry(sql, params = [], maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await pool.execute(sql, params);
    } catch (error) {
      lastError = error;

      // Only retry on connection errors
      if (error.code === 'PROTOCOL_CONNECTION_LOST' ||
          error.code === 'ECONNRESET' ||
          error.code === 'ETIMEDOUT') {
        console.warn(`Query failed (attempt ${attempt}/${maxRetries}):`, error.message);

        if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      // Non-retryable error or max retries reached
      throw error;
    }
  }

  throw lastError;
}

/**
 * Graceful pool shutdown
 */
async function closePool() {
  try {
    console.log('Closing database connection pool...');
    await pool.end();
    console.log('✓ Database pool closed successfully');
  } catch (error) {
    console.error('Error closing database pool:', error.message);
    throw error;
  }
}

// Export pool and utility functions
module.exports = {
  pool,
  testConnection,
  getPoolStats,
  queryWithRetry,
  closePool,

  // Convenience methods
  execute: pool.execute.bind(pool),
  query: pool.query.bind(pool),
  getConnection: pool.getConnection.bind(pool)
};
