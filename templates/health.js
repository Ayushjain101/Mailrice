// Health Check Endpoints Module
// Phase 2: Monitoring & Observability - Comprehensive Health Checks

const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');

/**
 * Helper function to check if a service is active via systemctl
 */
async function isServiceActive(serviceName) {
  return new Promise((resolve) => {
    const proc = spawn('systemctl', ['is-active', serviceName]);
    let stdout = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.on('close', (code) => {
      resolve(stdout.trim() === 'active');
    });

    proc.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Basic health check - Fast response for load balancers
 * GET /health
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

/**
 * Comprehensive health check - Checks all dependencies
 * GET /health/detailed
 */
router.get('/health/detailed', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {},
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      version: process.env.npm_package_version || '2.0.0',
      node: process.version
    }
  };

  // Check MySQL/Database
  try {
    const db = require('./db');
    await db.execute('SELECT 1');
    health.services.mysql = {
      status: 'up',
      message: 'Database connection active'
    };
  } catch (error) {
    health.services.mysql = {
      status: 'down',
      error: error.message
    };
    health.status = 'unhealthy';
  }

  // Check Redis
  try {
    const cache = require('./cache');
    const connected = cache.client.connected;

    if (connected) {
      // Test ping
      await new Promise((resolve, reject) => {
        cache.client.ping((err, reply) => {
          if (err) reject(err);
          else if (reply === 'PONG') resolve();
          else reject(new Error('Unexpected ping response'));
        });
      });

      health.services.redis = {
        status: 'up',
        message: 'Redis cache operational'
      };
    } else {
      throw new Error('Not connected');
    }
  } catch (error) {
    health.services.redis = {
      status: 'down',
      error: error.message
    };
    health.status = 'degraded'; // Redis down is degraded, not unhealthy
  }

  // Check Postfix (Mail Server)
  try {
    const active = await isServiceActive('postfix');
    health.services.postfix = {
      status: active ? 'up' : 'down',
      message: active ? 'Mail server running' : 'Mail server not running'
    };
    if (!active) health.status = 'unhealthy';
  } catch (error) {
    health.services.postfix = {
      status: 'unknown',
      error: error.message
    };
    health.status = 'unhealthy';
  }

  // Check Dovecot (IMAP/POP3)
  try {
    const active = await isServiceActive('dovecot');
    health.services.dovecot = {
      status: active ? 'up' : 'down',
      message: active ? 'IMAP/POP3 server running' : 'IMAP/POP3 server not running'
    };
    if (!active) health.status = 'unhealthy';
  } catch (error) {
    health.services.dovecot = {
      status: 'unknown',
      error: error.message
    };
    health.status = 'unhealthy';
  }

  // Check OpenDKIM
  try {
    const active = await isServiceActive('opendkim');
    health.services.opendkim = {
      status: active ? 'up' : 'down',
      message: active ? 'DKIM signing active' : 'DKIM signing inactive'
    };
    if (!active) health.status = 'degraded'; // DKIM down is degraded
  } catch (error) {
    health.services.opendkim = {
      status: 'unknown',
      error: error.message
    };
    health.status = 'degraded';
  }

  // Set appropriate HTTP status code
  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * Readiness check - Checks if service is ready to accept traffic
 * GET /health/ready
 */
router.get('/health/ready', async (req, res) => {
  try {
    // Check critical dependencies
    const db = require('./db');
    await db.execute('SELECT 1');

    const postfixActive = await isServiceActive('postfix');
    const dovecotActive = await isServiceActive('dovecot');

    if (postfixActive && dovecotActive) {
      res.json({
        ready: true,
        message: 'Service is ready to accept traffic'
      });
    } else {
      res.status(503).json({
        ready: false,
        message: 'Service not ready - critical services down'
      });
    }
  } catch (error) {
    res.status(503).json({
      ready: false,
      message: 'Service not ready - ' + error.message
    });
  }
});

/**
 * Liveness check - Checks if service is alive
 * GET /health/live
 */
router.get('/health/live', (req, res) => {
  // Simple liveness check - if this responds, process is alive
  res.json({
    alive: true,
    timestamp: new Date().toISOString()
  });
});

/**
 * Database health check
 * GET /health/database
 */
router.get('/health/database', async (req, res) => {
  try {
    const db = require('./db');

    // Test query
    const start = Date.now();
    await db.execute('SELECT 1');
    const latency = Date.now() - start;

    // Get pool stats
    const poolStats = db.getPoolStats();

    res.json({
      status: 'up',
      latency_ms: latency,
      pool: poolStats
    });
  } catch (error) {
    res.status(503).json({
      status: 'down',
      error: error.message
    });
  }
});

/**
 * Cache health check
 * GET /health/cache
 */
router.get('/health/cache', async (req, res) => {
  try {
    const cache = require('./cache');

    if (!cache.client.connected) {
      throw new Error('Redis not connected');
    }

    // Test cache operation
    const testKey = 'health:test';
    const testValue = 'ok';
    const start = Date.now();

    await cache.set(testKey, testValue, 'EX', 10);
    const retrieved = await cache.get(testKey);
    await cache.del(testKey);

    const latency = Date.now() - start;

    if (retrieved !== testValue) {
      throw new Error('Cache test failed - value mismatch');
    }

    // Get cache stats
    const stats = await cache.getCacheStats();

    res.json({
      status: 'up',
      latency_ms: latency,
      stats: stats
    });
  } catch (error) {
    res.status(503).json({
      status: 'down',
      error: error.message
    });
  }
});

/**
 * Mail services health check
 * GET /health/mail
 */
router.get('/health/mail', async (req, res) => {
  try {
    const postfixActive = await isServiceActive('postfix');
    const dovecotActive = await isServiceActive('dovecot');
    const opendkimActive = await isServiceActive('opendkim');

    const allHealthy = postfixActive && dovecotActive && opendkimActive;

    res.status(allHealthy ? 200 : 503).json({
      status: allHealthy ? 'healthy' : 'degraded',
      services: {
        postfix: postfixActive ? 'up' : 'down',
        dovecot: dovecotActive ? 'up' : 'down',
        opendkim: opendkimActive ? 'up' : 'down'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

module.exports = router;
