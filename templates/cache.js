// Redis Caching Module for Mailserver API
// Phase 2: Performance Enhancement - Caching Layer

const redis = require('redis');
const { promisify } = require('util');

// Create Redis client with retry strategy
const client = redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  retry_strategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      console.error('Redis connection refused');
      return new Error('Redis server connection refused');
    }
    if (options.total_retry_time > 1000 * 60) {
      console.error('Redis retry time exhausted');
      return new Error('Redis retry time exhausted');
    }
    if (options.attempt > 10) {
      return undefined; // Stop retrying
    }
    // Reconnect after delay
    return Math.min(options.attempt * 100, 3000);
  }
});

// Redis error handling
client.on('error', (err) => {
  console.error('Redis client error:', err.message);
});

client.on('connect', () => {
  console.log('✓ Redis client connected');
});

client.on('ready', () => {
  console.log('✓ Redis client ready');
});

client.on('reconnecting', () => {
  console.log('Redis client reconnecting...');
});

client.on('end', () => {
  console.log('Redis client connection ended');
});

// Promisify Redis methods
const getAsync = promisify(client.get).bind(client);
const setAsync = promisify(client.set).bind(client);
const delAsync = promisify(client.del).bind(client);
const existsAsync = promisify(client.exists).bind(client);
const keysAsync = promisify(client.keys).bind(client);

/**
 * Cache middleware factory
 * @param {number} duration - Cache duration in seconds (default: 300 = 5 minutes)
 * @returns {Function} Express middleware
 */
const cacheMiddleware = (duration = 300) => {
  return async (req, res, next) => {
    // Skip caching for non-GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Generate cache key from URL and query params
    const key = `cache:${req.originalUrl || req.url}`;

    try {
      // Try to get cached data
      const cachedData = await getAsync(key);

      if (cachedData) {
        // Cache hit - return cached data
        console.log(`Cache HIT: ${key}`);
        return res.json(JSON.parse(cachedData));
      }

      // Cache miss - continue to route handler
      console.log(`Cache MISS: ${key}`);

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = async function(data) {
        try {
          // Cache the response data
          await setAsync(key, JSON.stringify(data), 'EX', duration);
          console.log(`Cached: ${key} (TTL: ${duration}s)`);
        } catch (cacheError) {
          console.error('Failed to cache response:', cacheError.message);
        }

        // Call original json method
        return originalJson(data);
      };

      next();
    } catch (error) {
      console.error('Cache middleware error:', error.message);
      // On cache error, continue without caching
      next();
    }
  };
};

/**
 * Invalidate cache by pattern
 * @param {string} pattern - Redis key pattern (e.g., 'cache:*', 'cache:/domains*')
 */
const invalidateCache = async (pattern) => {
  try {
    const keys = await keysAsync(pattern);
    if (keys.length > 0) {
      await Promise.all(keys.map(key => delAsync(key)));
      console.log(`Invalidated ${keys.length} cache entries matching: ${pattern}`);
    }
  } catch (error) {
    console.error('Cache invalidation error:', error.message);
  }
};

/**
 * Clear all cache
 */
const clearAllCache = async () => {
  try {
    await invalidateCache('cache:*');
    console.log('All cache cleared');
  } catch (error) {
    console.error('Failed to clear cache:', error.message);
  }
};

/**
 * Get cache statistics
 */
const getCacheStats = async () => {
  try {
    const info = await promisify(client.info).bind(client)('stats');
    const lines = info.split('\r\n');
    const stats = {};

    lines.forEach(line => {
      const [key, value] = line.split(':');
      if (key && value) {
        stats[key] = value;
      }
    });

    return {
      hits: parseInt(stats.keyspace_hits) || 0,
      misses: parseInt(stats.keyspace_misses) || 0,
      hit_rate: stats.keyspace_hits && stats.keyspace_misses
        ? ((parseInt(stats.keyspace_hits) / (parseInt(stats.keyspace_hits) + parseInt(stats.keyspace_misses))) * 100).toFixed(2) + '%'
        : 'N/A'
    };
  } catch (error) {
    console.error('Failed to get cache stats:', error.message);
    return { hits: 0, misses: 0, hit_rate: 'N/A' };
  }
};

module.exports = {
  client,
  cacheMiddleware,
  invalidateCache,
  clearAllCache,
  getCacheStats,
  // Export async methods for manual cache operations
  get: getAsync,
  set: setAsync,
  del: delAsync,
  exists: existsAsync
};
