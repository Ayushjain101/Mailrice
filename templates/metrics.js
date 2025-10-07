// Prometheus Metrics Module
// Phase 2: Monitoring & Observability - API Metrics Export

const promClient = require('prom-client');

// Create a Registry to register metrics
const register = new promClient.Registry();

// Add default metrics (CPU, memory, event loop lag, etc.)
promClient.collectDefaultMetrics({
  register,
  prefix: 'mailserver_api_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5]
});

// Custom metrics for mailserver API

// HTTP request duration histogram
const httpRequestDuration = new promClient.Histogram({
  name: 'mailserver_api_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
});
register.registerMetric(httpRequestDuration);

// HTTP request counter
const httpRequestsTotal = new promClient.Counter({
  name: 'mailserver_api_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code']
});
register.registerMetric(httpRequestsTotal);

// Active requests gauge
const activeRequests = new promClient.Gauge({
  name: 'mailserver_api_active_requests',
  help: 'Number of active HTTP requests'
});
register.registerMetric(activeRequests);

// Database query duration histogram
const dbQueryDuration = new promClient.Histogram({
  name: 'mailserver_api_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['query_type'],
  buckets: [0.001, 0.01, 0.05, 0.1, 0.5, 1, 2]
});
register.registerMetric(dbQueryDuration);

// Database connection pool metrics
const dbPoolConnections = new promClient.Gauge({
  name: 'mailserver_api_db_pool_connections',
  help: 'Number of database pool connections',
  labelNames: ['state'] // active, idle
});
register.registerMetric(dbPoolConnections);

// Redis cache metrics
const cacheHits = new promClient.Counter({
  name: 'mailserver_api_cache_hits_total',
  help: 'Total number of cache hits'
});
register.registerMetric(cacheHits);

const cacheMisses = new promClient.Counter({
  name: 'mailserver_api_cache_misses_total',
  help: 'Total number of cache misses'
});
register.registerMetric(cacheMisses);

// Domain metrics
const domainsTotal = new promClient.Gauge({
  name: 'mailserver_domains_total',
  help: 'Total number of domains'
});
register.registerMetric(domainsTotal);

// Mailbox metrics
const mailboxesTotal = new promClient.Gauge({
  name: 'mailserver_mailboxes_total',
  help: 'Total number of mailboxes'
});
register.registerMetric(mailboxesTotal);

// API key metrics
const apiKeysTotal = new promClient.Gauge({
  name: 'mailserver_api_keys_total',
  help: 'Total number of API keys'
});
register.registerMetric(apiKeysTotal);

/**
 * Express middleware to collect HTTP metrics
 */
function metricsMiddleware() {
  return (req, res, next) => {
    const start = Date.now();

    // Increment active requests
    activeRequests.inc();

    // Store original end function
    const originalEnd = res.end;

    // Override res.end to capture metrics
    res.end = function(...args) {
      // Decrement active requests
      activeRequests.dec();

      // Calculate duration
      const duration = (Date.now() - start) / 1000;

      // Get route path (use path pattern if available, otherwise use URL)
      const route = req.route ? req.route.path : req.url;

      // Record metrics
      httpRequestDuration.labels(req.method, route, res.statusCode).observe(duration);
      httpRequestsTotal.labels(req.method, route, res.statusCode).inc();

      // Call original end
      originalEnd.apply(res, args);
    };

    next();
  };
}

/**
 * Update database pool metrics
 * Should be called periodically or on-demand
 */
function updateDbPoolMetrics(poolStats) {
  if (poolStats) {
    dbPoolConnections.labels('active').set(poolStats.active_connections || 0);
    dbPoolConnections.labels('idle').set(poolStats.idle_connections || 0);
  }
}

/**
 * Update domain/mailbox counts
 * Should be called periodically
 */
async function updateCountMetrics(pool) {
  try {
    // Get domain count
    const [domainRows] = await pool.execute('SELECT COUNT(*) as count FROM virtual_domains');
    domainsTotal.set(domainRows[0].count);

    // Get mailbox count
    const [mailboxRows] = await pool.execute('SELECT COUNT(*) as count FROM virtual_users');
    mailboxesTotal.set(mailboxRows[0].count);

    // Get API key count
    const [keyRows] = await pool.execute('SELECT COUNT(*) as count FROM api_keys');
    apiKeysTotal.set(keyRows[0].count);
  } catch (error) {
    console.error('Failed to update count metrics:', error.message);
  }
}

/**
 * Record cache hit
 */
function recordCacheHit() {
  cacheHits.inc();
}

/**
 * Record cache miss
 */
function recordCacheMiss() {
  cacheMisses.inc();
}

/**
 * Record database query duration
 */
function recordDbQuery(queryType, durationSeconds) {
  dbQueryDuration.labels(queryType).observe(durationSeconds);
}

/**
 * Get all metrics in Prometheus format
 */
async function getMetrics() {
  return register.metrics();
}

/**
 * Get metrics content type
 */
function getContentType() {
  return register.contentType;
}

module.exports = {
  register,
  metricsMiddleware,
  updateDbPoolMetrics,
  updateCountMetrics,
  recordCacheHit,
  recordCacheMiss,
  recordDbQuery,
  getMetrics,
  getContentType
};
