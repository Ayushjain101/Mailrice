// Mailrice Dashboard JavaScript

// Configuration
const API_BASE = 'https://{{ hostname }}/api';
let API_KEY = localStorage.getItem('mailrice_api_key');
let sendingChart = null;

// Initialize dashboard
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initializeDashboard();
    startAutoRefresh();
});

// Check authentication
function checkAuth() {
    const sessionKey = sessionStorage.getItem('mailrice_session');
    if (!sessionKey) {
        window.location.href = '/login.html';
        return;
    }
    API_KEY = sessionKey;
}

// Initialize dashboard
async function initializeDashboard() {
    displayUserInfo();
    await refreshDashboard();
}

// Display user info
function displayUserInfo() {
    const userDisplay = document.getElementById('userDisplay');
    userDisplay.textContent = 'Admin';
}

// Refresh entire dashboard
async function refreshDashboard() {
    await Promise.all([
        loadStats(),
        refreshDomains(),
        refreshActivity(),
        refreshQueue(),
        refreshHealth(),
        refreshChart()
    ]);
    updateLastRefresh();
}

// Load quick stats
async function loadStats() {
    try {
        const response = await apiCall('/dashboard/stats');
        if (response) {
            document.getElementById('totalDomains').textContent = response.domains.total;
            document.getElementById('domainsToday').textContent = `+${response.domains.today} today`;
            document.getElementById('totalMailboxes').textContent = response.mailboxes.total;
            document.getElementById('mailboxesToday').textContent = `+${response.mailboxes.today} today`;
            document.getElementById('totalApiKeys').textContent = response.api_keys.total;
            document.getElementById('apiKeysActive').textContent = `${response.api_keys.active} active`;
            document.getElementById('totalSent').textContent = response.emails_sent.total || '0';
            document.getElementById('sentToday').textContent = `Today: ${response.emails_sent.today || '0'}`;
        }
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Refresh domains
async function refreshDomains() {
    const container = document.getElementById('domainHealthList');
    container.innerHTML = '<div class="loading">Loading domains...</div>';

    try {
        const response = await apiCall('/dashboard/domains');
        if (response && response.domains) {
            if (response.domains.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No domains yet. Add your first domain!</p>';
                return;
            }

            container.innerHTML = response.domains.map(domain => `
                <div class="domain-item">
                    <div>
                        <div class="domain-name">${domain.name}</div>
                        <div class="domain-badges">
                            <span class="badge badge-${domain.dkim_status === 'configured' ? 'success' : 'danger'}">
                                ${domain.dkim_status === 'configured' ? '✓' : '✗'} DKIM
                            </span>
                            <span class="badge badge-${domain.spf_status === 'configured' ? 'success' : 'danger'}">
                                ${domain.spf_status === 'configured' ? '✓' : '✗'} SPF
                            </span>
                            <span class="badge badge-${domain.dmarc_status === 'configured' ? 'success' : 'danger'}">
                                ${domain.dmarc_status === 'configured' ? '✓' : '✗'} DMARC
                            </span>
                        </div>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-secondary" onclick="showDnsRecords('${domain.name}')">DNS Records</button>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        container.innerHTML = '<div class="alert alert-error">Failed to load domains</div>';
        console.error('Failed to load domains:', error);
    }
}

// Show DNS records modal
async function showDnsRecords(domain) {
    const modal = document.getElementById('dnsRecordsModal');
    const content = document.getElementById('dnsRecordsContent');

    content.innerHTML = '<div class="loading">Loading DNS records...</div>';
    showModal('dnsRecordsModal');

    try {
        const response = await apiCall(`/domains/${domain}/dns`);
        if (response && response.dns_records) {
            content.innerHTML = `
                <h3 style="margin-bottom: 1rem;">DNS Records for ${domain}</h3>

                <div class="form-group">
                    <label>DKIM Record</label>
                    <div class="code-block">
                        <button class="copy-button" onclick="copyToClipboard('${escapeHtml(response.dns_records.dkim)}')">Copy</button>
                        ${response.dns_records.dkim}
                    </div>
                </div>

                <div class="form-group">
                    <label>SPF Record</label>
                    <div class="code-block">
                        <button class="copy-button" onclick="copyToClipboard('${escapeHtml(response.dns_records.spf)}')">Copy</button>
                        ${response.dns_records.spf}
                    </div>
                </div>

                <div class="form-group">
                    <label>DMARC Record</label>
                    <div class="code-block">
                        <button class="copy-button" onclick="copyToClipboard('${escapeHtml(response.dns_records.dmarc)}')">Copy</button>
                        ${response.dns_records.dmarc}
                    </div>
                </div>

                <div class="alert alert-success">
                    Add these records to your DNS provider. It may take 5-10 minutes for changes to propagate.
                </div>
            `;
        }
    } catch (error) {
        content.innerHTML = '<div class="alert alert-error">Failed to load DNS records</div>';
        console.error('Failed to load DNS records:', error);
    }
}

// Refresh activity feed
async function refreshActivity() {
    const container = document.getElementById('activityFeed');
    container.innerHTML = '<div class="loading">Loading activity...</div>';

    try {
        const response = await apiCall('/dashboard/activity');
        if (response && response.activity) {
            if (response.activity.length === 0) {
                container.innerHTML = '<p style="text-align: center; color: var(--text-muted);">No recent activity</p>';
                return;
            }

            container.innerHTML = response.activity.map(item => `
                <div class="activity-item">
                    <span class="activity-time">${item.time}</span>
                    <span class="activity-text">${item.description}</span>
                </div>
            `).join('');
        }
    } catch (error) {
        container.innerHTML = '<div class="alert alert-error">Failed to load activity</div>';
        console.error('Failed to load activity:', error);
    }
}

// Refresh queue status
async function refreshQueue() {
    const container = document.getElementById('queueStatus');
    container.innerHTML = '<div class="loading">Loading queue status...</div>';

    try {
        const response = await apiCall('/dashboard/queue');
        if (response) {
            const hasDeferred = response.deferred > 0;
            container.innerHTML = `
                <div class="queue-stat">
                    <span class="queue-label">Active</span>
                    <span class="queue-value">${response.active}</span>
                </div>
                <div class="queue-stat">
                    <span class="queue-label">Deferred</span>
                    <span class="queue-value">${response.deferred}</span>
                </div>
                <div class="queue-stat">
                    <span class="queue-label">Hold</span>
                    <span class="queue-value">${response.hold}</span>
                </div>
                ${hasDeferred ? `
                <div class="queue-alert">
                    ⚠️ ${response.deferred} message(s) deferred.
                    <button class="btn btn-sm btn-primary" onclick="flushQueue()" style="margin-top: 0.5rem;">Retry Now</button>
                </div>
                ` : ''}
            `;
        }
    } catch (error) {
        container.innerHTML = '<div class="alert alert-error">Queue monitoring not available</div>';
        console.error('Failed to load queue:', error);
    }
}

// Refresh system health
async function refreshHealth() {
    const container = document.getElementById('systemHealth');
    container.innerHTML = '<div class="loading">Loading system health...</div>';

    try {
        const response = await apiCall('/dashboard/health');
        if (response) {
            container.innerHTML = `
                <div class="health-item">
                    <span class="health-label">API Status</span>
                    <span class="health-status">
                        <span class="status-icon">${response.api ? '✓' : '✗'}</span>
                        ${response.api ? 'Operational' : 'Down'}
                    </span>
                </div>
                <div class="health-item">
                    <span class="health-label">Database</span>
                    <span class="health-status">
                        <span class="status-icon">${response.database ? '✓' : '✗'}</span>
                        ${response.database ? 'Connected' : 'Disconnected'}
                    </span>
                </div>
                <div class="health-item">
                    <span class="health-label">Postfix</span>
                    <span class="health-status">
                        <span class="status-icon">${response.postfix ? '✓' : '✗'}</span>
                        ${response.postfix ? 'Running' : 'Stopped'}
                    </span>
                </div>
                <div class="health-item">
                    <span class="health-label">Dovecot</span>
                    <span class="health-status">
                        <span class="status-icon">${response.dovecot ? '✓' : '✗'}</span>
                        ${response.dovecot ? 'Running' : 'Stopped'}
                    </span>
                </div>
                <div class="health-item">
                    <span class="health-label">OpenDKIM</span>
                    <span class="health-status">
                        <span class="status-icon">${response.opendkim ? '✓' : '✗'}</span>
                        ${response.opendkim ? 'Running' : 'Stopped'}
                    </span>
                </div>
                <div class="health-item">
                    <span class="health-label">Disk Usage</span>
                    <span class="health-status">${response.disk_usage || 'N/A'}</span>
                </div>
                <div class="health-item">
                    <span class="health-label">Load Average</span>
                    <span class="health-status">${response.load_average || 'N/A'}</span>
                </div>
                <div style="margin-top: 1rem; text-align: center; color: var(--text-muted); font-size: 0.75rem;">
                    Last checked: ${response.last_check || 'just now'}
                </div>
            `;
        }
    } catch (error) {
        container.innerHTML = '<div class="alert alert-error">Failed to load system health</div>';
        console.error('Failed to load health:', error);
    }
}

// Refresh sending chart
async function refreshChart() {
    try {
        const response = await apiCall('/dashboard/sending-chart');
        if (response && response.data) {
            createSendingChart(response.data);
        }
    } catch (error) {
        console.error('Failed to load chart data:', error);
        // Create empty chart
        createSendingChart({ labels: [], values: [] });
    }
}

// Create sending chart
function createSendingChart(data) {
    const ctx = document.getElementById('sendingChart').getContext('2d');

    if (sendingChart) {
        sendingChart.destroy();
    }

    sendingChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels || [],
            datasets: [{
                label: 'Emails Sent',
                data: data.values || [],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0
                    }
                }
            }
        }
    });
}

// Flush queue
async function flushQueue() {
    if (!confirm('Retry all deferred messages?')) return;

    try {
        const response = await apiCall('/dashboard/queue/flush', 'POST');
        if (response && response.success) {
            alert('Queue flushed successfully!');
            await refreshQueue();
        } else {
            alert('Failed to flush queue');
        }
    } catch (error) {
        alert('Error flushing queue: ' + error.message);
    }
}

// Add domain
async function addDomain(event) {
    event.preventDefault();
    const domain = document.getElementById('domainName').value;
    const selector = document.getElementById('dkimSelector').value;
    const resultDiv = document.getElementById('addDomainResult');

    resultDiv.innerHTML = '<div class="loading">Adding domain...</div>';

    try {
        const response = await apiCall('/domains', 'POST', {
            domain: domain,
            dkim_selector: selector
        });

        if (response && response.success) {
            resultDiv.innerHTML = `
                <div class="alert alert-success">
                    Domain added successfully!
                    <button class="btn btn-sm btn-primary" onclick="showDnsRecords('${domain}')" style="margin-top: 0.5rem;">View DNS Records</button>
                </div>
            `;
            document.getElementById('addDomainForm').reset();
            await refreshDomains();
            await loadStats();
        } else {
            resultDiv.innerHTML = `<div class="alert alert-error">${response.error || 'Failed to add domain'}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="alert alert-error">Error: ${error.message}</div>`;
    }
}

// Add mailbox
async function addMailbox(event) {
    event.preventDefault();
    const email = document.getElementById('mailboxEmail').value;
    const password = document.getElementById('mailboxPassword').value;
    const quota = parseInt(document.getElementById('mailboxQuota').value);
    const resultDiv = document.getElementById('addMailboxResult');

    resultDiv.innerHTML = '<div class="loading">Creating mailbox...</div>';

    try {
        const response = await apiCall('/mailboxes', 'POST', {
            email: email,
            password: password,
            quota_mb: quota
        });

        if (response && response.success) {
            resultDiv.innerHTML = '<div class="alert alert-success">Mailbox created successfully!</div>';
            document.getElementById('addMailboxForm').reset();
            await loadStats();
        } else {
            resultDiv.innerHTML = `<div class="alert alert-error">${response.error || 'Failed to create mailbox'}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="alert alert-error">Error: ${error.message}</div>`;
    }
}

// Generate API key
async function generateApiKey(event) {
    event.preventDefault();
    const description = document.getElementById('apiKeyDescription').value;
    const masterKey = document.getElementById('masterApiKey').value;
    const resultDiv = document.getElementById('generateApiKeyResult');

    resultDiv.innerHTML = '<div class="loading">Generating API key...</div>';

    try {
        const response = await fetch(`${API_BASE}/api-keys`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                description: description,
                master_key: masterKey
            })
        });

        const data = await response.json();

        if (data.success) {
            resultDiv.innerHTML = `
                <div class="alert alert-success">
                    <strong>API Key Generated!</strong>
                    <div class="code-block" style="margin-top: 1rem;">
                        <button class="copy-button" onclick="copyToClipboard('${data.api_key}')">Copy</button>
                        ${data.api_key}
                    </div>
                    <small style="display: block; margin-top: 0.5rem;">⚠️ Save this key now. It cannot be retrieved later.</small>
                </div>
            `;
            document.getElementById('generateApiKeyForm').reset();
            await loadStats();
        } else {
            resultDiv.innerHTML = `<div class="alert alert-error">${data.error || 'Failed to generate API key'}</div>`;
        }
    } catch (error) {
        resultDiv.innerHTML = `<div class="alert alert-error">Error: ${error.message}</div>`;
    }
}

// API call helper
async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY
        }
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, options);

    if (response.status === 401 || response.status === 403) {
        logout();
        return null;
    }

    return await response.json();
}

// Modal functions
function showModal(modalId) {
    document.getElementById(modalId).classList.add('active');
    document.getElementById('modalOverlay').classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
    document.getElementById('modalOverlay').classList.remove('active');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.classList.remove('active');
    });
    document.getElementById('modalOverlay').classList.remove('active');
}

// Show modal functions
function showAddDomainModal() {
    showModal('addDomainModal');
    document.getElementById('addDomainResult').innerHTML = '';
}

function showAddMailboxModal() {
    showModal('addMailboxModal');
    document.getElementById('addMailboxResult').innerHTML = '';
}

function showGenerateApiKeyModal() {
    showModal('generateApiKeyModal');
    document.getElementById('generateApiKeyResult').innerHTML = '';
}

function showLogsModal() {
    alert('Logs viewer coming soon!');
}

// Utility functions
function copyToClipboard(text) {
    // Unescape HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    const decodedText = textarea.value;

    navigator.clipboard.writeText(decodedText).then(() => {
        alert('Copied to clipboard!');
    }).catch(() => {
        alert('Failed to copy to clipboard');
    });
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function exportData() {
    alert('Data export coming soon!');
}

function updateLastRefresh() {
    const now = new Date();
    document.getElementById('lastUpdate').textContent = now.toLocaleTimeString();
}

function logout() {
    sessionStorage.removeItem('mailrice_session');
    window.location.href = '/login.html';
}

// Auto-refresh every 30 seconds
function startAutoRefresh() {
    setInterval(async () => {
        await refreshDashboard();
    }, 30000);
}
