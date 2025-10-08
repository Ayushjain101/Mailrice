# Dashboard Deployment Guide

## Overview

The Mailrice v2 dashboard is a React application that provides a web-based UI for managing domains, mailboxes, and API keys. It's fully integrated with the FastAPI backend and deployed via Ansible.

---

## 🚀 One-Command Deployment

The dashboard is automatically deployed as part of the main Ansible playbook:

```bash
./install.sh your-domain.com mail.your-domain.com
```

This will:
1. Deploy the complete mail stack (Postfix, Dovecot, OpenDKIM)
2. Deploy the FastAPI backend
3. Build and deploy the React dashboard
4. Configure Nginx to serve the dashboard and proxy API requests
5. Set up SSL certificates via Let's Encrypt

---

## 📍 URLs

After deployment:
- **Dashboard:** `https://mail.your-domain.com/`
- **API:** `https://mail.your-domain.com/api/`
- **API Docs:** `https://mail.your-domain.com/api/docs`

---

## 🔧 What Gets Deployed

### Dashboard Build Process

The Ansible playbook:
1. Installs Node.js 20.x from NodeSource
2. Copies dashboard source to `/tmp/mailrice-dashboard/`
3. Creates `.env` with production API URL
4. Runs `npm install` (production dependencies only)
5. Runs `npm run build` (optimized production build)
6. Copies built files to `/var/www/mailrice/`
7. Sets ownership to `www-data:www-data`
8. Reloads Nginx

### File Locations

```
/var/www/mailrice/          # Dashboard static files
├── index.html              # Main HTML file
├── assets/                 # JS, CSS, images
│   ├── index-*.js         # Main JS bundle (~441KB, 138KB gzipped)
│   ├── index-*.css        # Main CSS bundle (~21KB, 4.5KB gzipped)
│   └── ...
```

### Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name mail.your-domain.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/mail.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mail.your-domain.com/privkey.pem;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/javascript application/json;

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # ... more headers
    }

    # Dashboard (SPA routing)
    location / {
        root /var/www/mailrice;
        try_files $uri $uri/ /index.html;

        # Cache static assets (1 year)
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
```

---

## 🛠️ Manual Deployment

If you need to redeploy just the dashboard:

```bash
# 1. SSH into your server
ssh root@your-server

# 2. Navigate to the dashboard directory
cd /opt/mailrice/apps/dashboard  # Adjust path if different

# 3. Pull latest changes
git pull

# 4. Install dependencies
npm install

# 5. Build for production
npm run build

# 6. Copy to web directory
rm -rf /var/www/mailrice/*
cp -r dist/* /var/www/mailrice/

# 7. Set permissions
chown -R www-data:www-data /var/www/mailrice

# 8. Reload Nginx
systemctl reload nginx
```

---

## 🔍 Troubleshooting

### Dashboard Shows Blank Page

**Check Nginx:**
```bash
sudo nginx -t
sudo systemctl status nginx
```

**Check dashboard files:**
```bash
ls -la /var/www/mailrice/
# Should see: index.html, assets/, etc.
```

**Check browser console:**
- Open browser DevTools (F12)
- Look for errors in Console tab
- Check Network tab for failed requests

### API Requests Failing

**Check API is running:**
```bash
sudo systemctl status mailrice-api
sudo journalctl -u mailrice-api -n 50
```

**Test API directly:**
```bash
curl http://localhost:8000/api/health
```

**Check Nginx proxy:**
```bash
curl -I https://mail.your-domain.com/api/health
```

### 404 on Page Refresh

This means SPA routing is not configured. Check Nginx config:
```bash
sudo cat /etc/nginx/sites-available/mailrice | grep try_files
# Should show: try_files $uri $uri/ /index.html;
```

If missing, the Nginx config needs updating.

### Build Failures

**Check Node.js version:**
```bash
node --version
# Should be v20.x
```

**Check build logs:**
```bash
cd /tmp/mailrice-dashboard
npm run build
# Look for errors
```

**Common issues:**
- Out of memory: Add swap space
- Missing dependencies: Run `npm install` again
- TypeScript errors: Check `apps/dashboard/src/` for syntax errors

---

## 🔄 Updating the Dashboard

To deploy updates to an existing dashboard:

```bash
# Re-run the Ansible playbook
./install.sh your-domain.com mail.your-domain.com

# Or manually:
cd /opt/mailrice
git pull
cd apps/dashboard
npm install
npm run build
sudo rm -rf /var/www/mailrice/*
sudo cp -r dist/* /var/www/mailrice/
sudo chown -R www-data:www-data /var/www/mailrice
sudo systemctl reload nginx
```

---

## 📊 Performance

### Bundle Sizes

Production build:
```
index.html           0.46 kB
index.css           20.85 kB (4.55 kB gzipped)
index.js           441.10 kB (137.68 kB gzipped)
```

### Optimization

The build includes:
- ✅ Code splitting (Vite)
- ✅ Tree shaking
- ✅ Minification
- ✅ Gzip compression
- ✅ Static asset caching (1 year)
- ✅ React Query caching (5 minutes)

### Load Times

Typical performance:
- First load: ~1.5s (with cold cache)
- Subsequent loads: ~200ms (cached assets)
- API calls: ~50-200ms (depends on server)

---

## 🔒 Security

### API Authentication

The dashboard uses:
- JWT tokens (stored in localStorage)
- Auto-logout on 401 responses
- Axios interceptor for auth headers

### HTTPS Only

All traffic is over HTTPS:
- HTTP → HTTPS redirect
- Let's Encrypt SSL certificates
- TLS 1.2/1.3 only

### CORS

CORS is configured in the backend (`apps/api/app/main.py`):
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure properly in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**For production:** Update `allow_origins` to specific domains.

---

## 📝 Environment Variables

Dashboard `.env` (generated by Ansible):
```bash
VITE_API_BASE_URL=https://mail.your-domain.com/api
VITE_APP_NAME=Mailrice Dashboard
VITE_APP_VERSION=2.0.0
```

These are baked into the build at compile time.

---

## 🧪 Testing

### Local Testing

```bash
# Terminal 1: Start backend
cd apps/api
uvicorn app.main:app --reload

# Terminal 2: Start dashboard
cd apps/dashboard
npm run dev
# Opens at http://localhost:5173
```

### Production Testing

After deployment:
1. Visit `https://mail.your-domain.com/`
2. Should see login page
3. Login with admin credentials
4. Test creating a domain
5. Test creating a mailbox
6. Test generating an API key

---

## 📚 Additional Resources

- **Frontend Source:** `apps/dashboard/src/`
- **Ansible Role:** `ansible/roles/dashboard/tasks/main.yml`
- **Nginx Config:** `/etc/nginx/sites-available/mailrice`
- **Session 6 Summary:** `SESSION6_COMPLETE.md`
- **API Fixes:** `BACKEND_API_FIXES.md`

---

## 🆘 Support

If you encounter issues:
1. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`
2. Check API logs: `sudo journalctl -u mailrice-api -f`
3. Check browser console (F12)
4. Review this troubleshooting guide

---

**Last Updated:** October 8, 2025
**Dashboard Version:** 2.0.0
**Status:** Production Ready ✅
