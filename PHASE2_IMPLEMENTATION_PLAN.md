# Mailrice V2 - Phase 2 Implementation Plan
## Performance & Observability

**Status:** Ready for Implementation
**Dependencies:** Phase 1 (V2 Stabalisation) Complete
**Estimated Implementation Time:** 4-6 hours
**Testing Time:** 1-2 hours

---

## 🎯 Phase 2 Goals

Enhance Mailrice with enterprise-grade performance optimizations and comprehensive monitoring capabilities to support high-volume mail operations with real-time visibility.

### Success Criteria
- ✅ API response time < 100ms (from ~200ms)
- ✅ Real-time metrics dashboard operational
- ✅ Automated health checks every 60 seconds
- ✅ Alert system functional with < 1min detection time
- ✅ Handle 10x email volume without performance degradation
- ✅ Zero downtime during implementation

---

## 📋 Implementation Overview

### Part A: Performance Enhancements
1. **Redis Caching** - Cache API responses, reduce database load
2. **Database Connection Pooling** - Reuse connections, reduce latency
3. **Query Optimization** - Index optimization, query caching
4. **Response Compression** - gzip compression for API responses

### Part B: Monitoring & Observability
5. **Prometheus Stack** - Metrics collection and storage
6. **Grafana Dashboards** - Real-time visualization
7. **Mail Metrics** - Postfix/Dovecot/Queue monitoring
8. **Health Checks** - Automated service health monitoring
9. **Alerting** - Automated alerts for critical issues

---

## 🔧 Part A: Performance Enhancements

### 1. Redis Caching Layer

**Purpose:** Reduce database load and improve API response times

**Implementation:**

```yaml
# Add to deploy.yml - Install Redis
- name: "[PERF] Install Redis server"
  apt:
    name:
      - redis-server
      - redis-tools
    state: present

- name: "[PERF] Configure Redis for performance"
  lineinfile:
    path: /etc/redis/redis.conf
    regexp: "{{ item.regexp }}"
    line: "{{ item.line }}"
  loop:
    - { regexp: '^maxmemory ', line: 'maxmemory 256mb' }
    - { regexp: '^maxmemory-policy ', line: 'maxmemory-policy allkeys-lru' }
    - { regexp: '^save ', line: '# save disabled for performance' }
  notify: restart redis

- name: "[PERF] Start and enable Redis"
  systemd:
    name: redis-server
    state: started
    enabled: yes
```

**API Integration:**

```javascript
// Add to mailserver-api/src/cache.js
const redis = require('redis');
const { promisify } = require('util');

const client = redis.createClient({
  host: 'localhost',
  port: 6379,
  retry_strategy: (options) => {
    if (options.total_retry_time > 1000 * 60) return new Error('Retry time exhausted');
    return Math.min(options.attempt * 100, 3000);
  }
});

const getAsync = promisify(client.get).bind(client);
const setAsync = promisify(client.set).bind(client);
const delAsync = promisify(client.del).bind(client);

// Cache middleware
const cacheMiddleware = (duration = 300) => {
  return async (req, res, next) => {
    const key = `cache:${req.originalUrl || req.url}`;
    try {
      const cachedData = await getAsync(key);
      if (cachedData) {
        return res.json(JSON.parse(cachedData));
      }

      // Store original send
      const originalSend = res.json;
      res.json = async function(data) {
        await setAsync(key, JSON.stringify(data), 'EX', duration);
        originalSend.call(this, data);
      };

      next();
    } catch (error) {
      console.error('Cache error:', error);
      next();
    }
  };
};

module.exports = { cacheMiddleware, client };
```

**Expected Impact:**
- API response time: 200ms → 50ms (75% improvement)
- Database queries: -60%
- Concurrent users: 100 → 500

---

### 2. Database Connection Pooling

**Purpose:** Optimize MySQL connections for concurrent requests

**Implementation:**

```javascript
// Update mailserver-api/src/db.js
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'mailserver',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'mailserver',
  waitForConnections: true,
  connectionLimit: 20,        // Max 20 concurrent connections
  queueLimit: 0,              // No queue limit
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  connectTimeout: 10000,
  idleTimeout: 60000,         // Close idle connections after 1 min
  maxIdle: 10                 // Keep 10 idle connections
});

// Connection health check
pool.on('connection', (connection) => {
  console.log('New DB connection established:', connection.threadId);
});

pool.on('error', (err) => {
  console.error('MySQL pool error:', err);
});

module.exports = pool;
```

**Expected Impact:**
- Connection overhead: -90%
- Query latency: -40%
- Concurrent requests: 50 → 200

---

### 3. Query Optimization

**Purpose:** Add database indexes for faster lookups

**Implementation:**

```yaml
# Add to deploy.yml
- name: "[PERF] Add database indexes for performance"
  mysql_query:
    login_db: mailserver
    login_user: root
    query: |
      -- Add indexes if they don't exist
      CREATE INDEX IF NOT EXISTS idx_domain ON virtual_domains(domain);
      CREATE INDEX IF NOT EXISTS idx_email ON virtual_users(email);
      CREATE INDEX IF NOT EXISTS idx_domain_mailboxes ON virtual_users(domain);
      CREATE INDEX IF NOT EXISTS idx_api_key ON api_keys(api_key);
      CREATE INDEX IF NOT EXISTS idx_active_users ON virtual_users(active);

      -- Analyze tables for query optimizer
      ANALYZE TABLE virtual_domains;
      ANALYZE TABLE virtual_users;
      ANALYZE TABLE api_keys;
```

**Expected Impact:**
- Domain lookups: -80% latency
- Mailbox queries: -70% latency
- API key validation: -85% latency

---

## 📊 Part B: Monitoring & Observability

### 4. Prometheus Metrics Collection

**Purpose:** Collect real-time metrics from all services

**Implementation:**

```yaml
# Add to deploy.yml
- name: "[MONITOR] Create prometheus user"
  user:
    name: prometheus
    system: yes
    shell: /bin/false
    create_home: no

- name: "[MONITOR] Download and install Prometheus"
  unarchive:
    src: "https://github.com/prometheus/prometheus/releases/download/v2.45.0/prometheus-2.45.0.linux-amd64.tar.gz"
    dest: /opt
    remote_src: yes
    creates: /opt/prometheus-2.45.0.linux-amd64

- name: "[MONITOR] Create Prometheus symlink"
  file:
    src: /opt/prometheus-2.45.0.linux-amd64
    dest: /opt/prometheus
    state: link

- name: "[MONITOR] Create Prometheus directories"
  file:
    path: "{{ item }}"
    state: directory
    owner: prometheus
    group: prometheus
  loop:
    - /etc/prometheus
    - /var/lib/prometheus

- name: "[MONITOR] Copy Prometheus configuration"
  template:
    src: templates/prometheus.yml.j2
    dest: /etc/prometheus/prometheus.yml
    owner: prometheus
    group: prometheus
  notify: restart prometheus

- name: "[MONITOR] Create Prometheus systemd service"
  copy:
    content: |
      [Unit]
      Description=Prometheus Monitoring System
      Documentation=https://prometheus.io/docs/introduction/overview/
      After=network.target

      [Service]
      Type=simple
      User=prometheus
      Group=prometheus
      ExecStart=/opt/prometheus/prometheus \
        --config.file=/etc/prometheus/prometheus.yml \
        --storage.tsdb.path=/var/lib/prometheus/ \
        --web.listen-address=:9090 \
        --storage.tsdb.retention.time=30d
      Restart=always
      RestartSec=5

      [Install]
      WantedBy=multi-user.target
    dest: /etc/systemd/system/prometheus.service
  notify: reload systemd

- name: "[MONITOR] Start and enable Prometheus"
  systemd:
    name: prometheus
    state: started
    enabled: yes
```

**Prometheus Configuration Template:**

```yaml
# templates/prometheus.yml.j2
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    cluster: 'mailrice'
    hostname: '{{ hostname }}'

# Alertmanager configuration
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['localhost:9093']

# Scrape configurations
scrape_configs:
  # Prometheus self-monitoring
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  # Node Exporter - System metrics
  - job_name: 'node'
    static_configs:
      - targets: ['localhost:9100']

  # Mailserver API metrics
  - job_name: 'mailserver-api'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'

  # Postfix Exporter - Mail server metrics
  - job_name: 'postfix'
    static_configs:
      - targets: ['localhost:9154']

  # MySQL Exporter - Database metrics
  - job_name: 'mysql'
    static_configs:
      - targets: ['localhost:9104']

  # Redis Exporter - Cache metrics
  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:9121']
```

---

### 5. Node Exporter (System Metrics)

**Purpose:** Collect CPU, memory, disk, network metrics

**Implementation:**

```yaml
- name: "[MONITOR] Download and install Node Exporter"
  unarchive:
    src: "https://github.com/prometheus/node_exporter/releases/download/v1.6.1/node_exporter-1.6.1.linux-amd64.tar.gz"
    dest: /opt
    remote_src: yes
    creates: /opt/node_exporter-1.6.1.linux-amd64

- name: "[MONITOR] Create Node Exporter symlink"
  file:
    src: /opt/node_exporter-1.6.1.linux-amd64
    dest: /opt/node_exporter
    state: link

- name: "[MONITOR] Create Node Exporter systemd service"
  copy:
    content: |
      [Unit]
      Description=Node Exporter
      After=network.target

      [Service]
      Type=simple
      User=prometheus
      ExecStart=/opt/node_exporter/node_exporter \
        --collector.filesystem.mount-points-exclude=^/(dev|proc|sys|var/lib/docker/.+)($|/) \
        --collector.netclass.ignored-devices=^(veth.*|docker.*|br.*)$
      Restart=always

      [Install]
      WantedBy=multi-user.target
    dest: /etc/systemd/system/node_exporter.service
  notify: reload systemd

- name: "[MONITOR] Start and enable Node Exporter"
  systemd:
    name: node_exporter
    state: started
    enabled: yes
```

---

### 6. Postfix Exporter (Mail Metrics)

**Purpose:** Monitor mail queue, delivery rates, bounces

**Implementation:**

```yaml
- name: "[MONITOR] Download and install Postfix Exporter"
  unarchive:
    src: "https://github.com/kumina/postfix_exporter/releases/download/v0.3.0/postfix_exporter-0.3.0.linux-amd64.tar.gz"
    dest: /opt
    remote_src: yes
    creates: /opt/postfix_exporter-0.3.0.linux-amd64

- name: "[MONITOR] Create Postfix Exporter symlink"
  file:
    src: /opt/postfix_exporter-0.3.0.linux-amd64
    dest: /opt/postfix_exporter
    state: link

- name: "[MONITOR] Add prometheus user to systemd-journal group"
  user:
    name: prometheus
    groups: systemd-journal
    append: yes

- name: "[MONITOR] Create Postfix Exporter systemd service"
  copy:
    content: |
      [Unit]
      Description=Postfix Exporter
      After=network.target postfix.service

      [Service]
      Type=simple
      User=prometheus
      ExecStart=/opt/postfix_exporter/postfix_exporter \
        --postfix.logfile_path=/var/log/mailrice/postfix.log \
        --web.listen-address=:9154
      Restart=always

      [Install]
      WantedBy=multi-user.target
    dest: /etc/systemd/system/postfix_exporter.service
  notify: reload systemd

- name: "[MONITOR] Start and enable Postfix Exporter"
  systemd:
    name: postfix_exporter
    state: started
    enabled: yes
```

---

### 7. Grafana Dashboard

**Purpose:** Visualize all metrics in real-time

**Implementation:**

```yaml
- name: "[MONITOR] Add Grafana APT key"
  apt_key:
    url: https://packages.grafana.com/gpg.key
    state: present

- name: "[MONITOR] Add Grafana repository"
  apt_repository:
    repo: "deb https://packages.grafana.com/oss/deb stable main"
    state: present

- name: "[MONITOR] Install Grafana"
  apt:
    name: grafana
    state: present
    update_cache: yes

- name: "[MONITOR] Configure Grafana"
  template:
    src: templates/grafana.ini.j2
    dest: /etc/grafana/grafana.ini
  notify: restart grafana

- name: "[MONITOR] Start and enable Grafana"
  systemd:
    name: grafana-server
    state: started
    enabled: yes

- name: "[MONITOR] Wait for Grafana to start"
  wait_for:
    port: 3001
    delay: 5
    timeout: 60

- name: "[MONITOR] Add Prometheus datasource to Grafana"
  uri:
    url: http://localhost:3001/api/datasources
    method: POST
    user: admin
    password: admin
    force_basic_auth: yes
    body_format: json
    body:
      name: "Prometheus"
      type: "prometheus"
      url: "http://localhost:9090"
      access: "proxy"
      isDefault: true
    status_code: [200, 409]  # 409 if already exists
```

**Pre-built Dashboard JSON:**

Create `templates/grafana-mailrice-dashboard.json`:
- System Overview (CPU, RAM, Disk, Network)
- Mail Server Metrics (Queue size, Delivery rate, Bounces)
- API Performance (Response times, Request rates, Cache hit rate)
- Database Performance (Query times, Connection pool usage)
- Redis Performance (Hit rate, Memory usage, Operations/sec)

---

### 8. Health Check Endpoints

**Purpose:** Automated health monitoring for all services

**Implementation:**

```javascript
// Add to mailserver-api/src/routes/health.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const redis = require('../cache').client;

router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {}
  };

  // Check MySQL
  try {
    await db.query('SELECT 1');
    health.services.mysql = { status: 'up', latency: Date.now() };
  } catch (error) {
    health.services.mysql = { status: 'down', error: error.message };
    health.status = 'unhealthy';
  }

  // Check Redis
  try {
    await new Promise((resolve, reject) => {
      redis.ping((err, reply) => {
        if (err) reject(err);
        else resolve(reply);
      });
    });
    health.services.redis = { status: 'up' };
  } catch (error) {
    health.services.redis = { status: 'down', error: error.message };
    health.status = 'degraded';
  }

  // Check Postfix
  try {
    const { exec } = require('child_process');
    await new Promise((resolve, reject) => {
      exec('systemctl is-active postfix', (error, stdout) => {
        if (stdout.trim() === 'active') resolve();
        else reject(new Error('Not active'));
      });
    });
    health.services.postfix = { status: 'up' };
  } catch (error) {
    health.services.postfix = { status: 'down' };
    health.status = 'unhealthy';
  }

  // Check Dovecot
  try {
    const { exec } = require('child_process');
    await new Promise((resolve, reject) => {
      exec('systemctl is-active dovecot', (error, stdout) => {
        if (stdout.trim() === 'active') resolve();
        else reject(new Error('Not active'));
      });
    });
    health.services.dovecot = { status: 'up' };
  } catch (error) {
    health.services.dovecot = { status: 'down' };
    health.status = 'unhealthy';
  }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Detailed health check
router.get('/health/detailed', async (req, res) => {
  const detailed = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    version: process.env.npm_package_version || '2.0.0',
    node: process.version
  };

  res.json(detailed);
});

module.exports = router;
```

---

### 9. Alerting Rules

**Purpose:** Automated alerts for critical issues

**Implementation:**

```yaml
# templates/alert_rules.yml
groups:
  - name: mailrice_alerts
    interval: 30s
    rules:
      # Service down alerts
      - alert: ServiceDown
        expr: up == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "Service {{ $labels.job }} is down"
          description: "{{ $labels.job }} has been down for more than 2 minutes"

      # High mail queue
      - alert: HighMailQueue
        expr: postfix_queue_size > 1000
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Mail queue is high"
          description: "Postfix queue has {{ $value }} messages"

      # High CPU usage
      - alert: HighCPU
        expr: 100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m])) * 100) > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High CPU usage"
          description: "CPU usage is {{ $value }}%"

      # High memory usage
      - alert: HighMemory
        expr: (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes) * 100 < 20
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
          description: "Available memory is {{ $value }}%"

      # Disk space low
      - alert: DiskSpaceLow
        expr: (node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}) * 100 < 20
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Disk space is low"
          description: "Available disk space is {{ $value }}%"

      # API high response time
      - alert: APISlowResponse
        expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "API response time is high"
          description: "95th percentile response time is {{ $value }}s"
```

---

## 📊 Expected Impact

### Performance Metrics
| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| API Response Time | ~200ms | ~50ms | **75%** |
| Database Queries/sec | 100 | 250 | **150%** |
| Concurrent Users | 100 | 500 | **400%** |
| Cache Hit Rate | N/A | 80%+ | **New** |
| Query Latency | 50ms | 10ms | **80%** |

### Monitoring Metrics
| Feature | Status | Details |
|---------|--------|---------|
| Real-time Dashboard | ✅ | 15s refresh rate |
| System Metrics | ✅ | CPU, RAM, Disk, Network |
| Mail Metrics | ✅ | Queue, Delivery, Bounces |
| API Metrics | ✅ | Response times, Requests |
| Database Metrics | ✅ | Queries, Connections |
| Automated Alerts | ✅ | < 1min detection time |
| Health Checks | ✅ | Every 60 seconds |

---

## 🚀 Implementation Steps

### Step 1: Create Feature Branch
```bash
git checkout -b Phase2-Performance-Monitoring
```

### Step 2: Implement Performance Features
1. Add Redis installation and configuration
2. Update API code with caching middleware
3. Add database connection pooling
4. Add query optimization indexes
5. Test performance improvements

### Step 3: Implement Monitoring Stack
6. Install Prometheus and exporters
7. Install Grafana
8. Configure data sources and dashboards
9. Add health check endpoints
10. Configure alerting rules

### Step 4: Testing
11. Deploy to test server
12. Verify all metrics are collecting
13. Load test API endpoints
14. Trigger test alerts
15. Verify dashboard displays correctly

### Step 5: Merge to Main
16. Create pull request
17. Review and test
18. Merge to main branch
19. Update documentation

---

## 🧪 Testing Plan

### Performance Testing
```bash
# API load test
ab -n 10000 -c 100 http://localhost:3000/api/health

# Cache hit rate test
for i in {1..1000}; do
  curl -s http://localhost:3000/api/domains > /dev/null
done

# Database connection pool test
# Run concurrent queries
```

### Monitoring Validation
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Check Grafana health
curl http://localhost:3001/api/health

# Verify metrics collection
curl http://localhost:9090/api/v1/query?query=up

# Test health endpoint
curl http://localhost:3000/api/health
```

---

## 📝 Rollback Plan

If Phase 2 causes issues:

1. **Immediate Rollback:**
```bash
git checkout main
./deploy.sh [same parameters as before]
```

2. **Service-level Rollback:**
```bash
# Stop monitoring services if needed
systemctl stop prometheus grafana-server
systemctl stop node_exporter postfix_exporter

# Disable Redis caching in API
# Set REDIS_ENABLED=false in .env
```

3. **Data Preservation:**
- All Phase 1 functionality remains intact
- Monitoring services are additive only
- No breaking changes to existing APIs

---

## 🎯 Success Validation

Phase 2 is successful when:

✅ API response time < 100ms
✅ Grafana dashboard shows all metrics
✅ Prometheus collecting from all exporters
✅ Health endpoint returns healthy status
✅ Redis cache hit rate > 70%
✅ Database connection pool active
✅ Alert rules configured and tested
✅ Zero errors in deployment logs
✅ All Phase 1 features still working

---

## 📚 Documentation Updates

After Phase 2 completion, update:

1. **README.md** - Add Phase 2 features section
2. **V2_PROGRESS_SUMMARY.md** - Mark Phase 2 complete
3. **CODEBASE_DOCUMENTATION.md** - Add monitoring architecture
4. Create **MONITORING_GUIDE.md** - Grafana dashboard guide

---

**Last Updated:** October 7, 2025
**Status:** Ready for Implementation
**Next Step:** Execute implementation and test deployment
