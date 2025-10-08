# Session 6: Frontend Dashboard Implementation Plan

**Status:** Planning
**Branch:** session-6-dashboard
**Target:** Production-ready React dashboard for Mailrice v2

---

## 🎯 Objectives

Build a modern, responsive web dashboard that provides:
- Complete domain and mailbox management
- Multi-tenant workspace support
- API key management
- Real-time system health monitoring
- Intuitive UX for cold email agencies and SaaS operators

---

## 🏗️ Architecture

### Tech Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| **Framework** | React 18 + TypeScript | Type safety, component reusability, large ecosystem |
| **Build Tool** | Vite | Lightning-fast HMR, optimized production builds |
| **Routing** | React Router v6 | Standard routing solution, nested routes |
| **Styling** | Tailwind CSS | Rapid UI development, consistent design system |
| **State Management** | React Query + Context | Server state caching, optimistic updates |
| **HTTP Client** | Axios | Interceptors for auth, better error handling |
| **Forms** | React Hook Form | Performant, minimal re-renders |
| **Icons** | Lucide React | Modern, customizable icons |
| **Notifications** | Sonner | Beautiful toast notifications |

### Project Structure

```
apps/dashboard/
├── public/
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx         # Main layout with sidebar
│   │   │   ├── Sidebar.tsx           # Navigation sidebar
│   │   │   └── Header.tsx            # Top header with user menu
│   │   ├── domains/
│   │   │   ├── DomainList.tsx        # Domain table with actions
│   │   │   ├── DomainCreate.tsx      # Create domain modal
│   │   │   ├── DomainDNS.tsx         # DNS records viewer
│   │   │   └── DKIMRotate.tsx        # DKIM rotation modal
│   │   ├── mailboxes/
│   │   │   ├── MailboxList.tsx       # Mailbox table
│   │   │   ├── MailboxCreate.tsx     # Create mailbox modal
│   │   │   └── MailboxPassword.tsx   # Password update modal
│   │   ├── apikeys/
│   │   │   ├── APIKeyList.tsx        # API key table
│   │   │   ├── APIKeyCreate.tsx      # Create key modal
│   │   │   └── APIKeyDisplay.tsx     # One-time key display
│   │   ├── ui/
│   │   │   ├── Button.tsx            # Reusable button component
│   │   │   ├── Input.tsx             # Reusable input component
│   │   │   ├── Modal.tsx             # Modal wrapper
│   │   │   ├── Table.tsx             # Data table component
│   │   │   └── Card.tsx              # Card container
│   │   └── shared/
│   │       ├── LoadingSpinner.tsx
│   │       └── ErrorBoundary.tsx
│   ├── pages/
│   │   ├── Login.tsx                 # Login page
│   │   ├── Dashboard.tsx             # Overview dashboard
│   │   ├── Domains.tsx               # Domains page
│   │   ├── Mailboxes.tsx             # Mailboxes page
│   │   ├── APIKeys.tsx               # API keys page
│   │   └── Settings.tsx              # User settings
│   ├── services/
│   │   ├── api.ts                    # Axios instance with interceptors
│   │   ├── auth.service.ts           # Authentication API calls
│   │   ├── domains.service.ts        # Domain API calls
│   │   ├── mailboxes.service.ts      # Mailbox API calls
│   │   └── apikeys.service.ts        # API key calls
│   ├── hooks/
│   │   ├── useAuth.ts                # Auth context hook
│   │   ├── useDomains.ts             # React Query hooks for domains
│   │   ├── useMailboxes.ts           # React Query hooks for mailboxes
│   │   └── useAPIKeys.ts             # React Query hooks for keys
│   ├── context/
│   │   └── AuthContext.tsx           # Global auth state
│   ├── types/
│   │   ├── auth.types.ts             # Auth type definitions
│   │   ├── domain.types.ts           # Domain type definitions
│   │   └── mailbox.types.ts          # Mailbox type definitions
│   ├── utils/
│   │   ├── constants.ts              # App constants
│   │   └── helpers.ts                # Utility functions
│   ├── App.tsx                       # Main app component
│   ├── main.tsx                      # Entry point
│   └── index.css                     # Global styles + Tailwind
├── .env.example                      # Environment variables template
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

---

## 🎨 UI/UX Design

### Color Scheme

```css
/* Primary - Blue */
--primary-50: #eff6ff;
--primary-500: #3b82f6;
--primary-600: #2563eb;
--primary-700: #1d4ed8;

/* Success - Green */
--success-500: #10b981;

/* Error - Red */
--error-500: #ef4444;

/* Warning - Yellow */
--warning-500: #f59e0b;

/* Neutral - Gray */
--gray-50: #f9fafb;
--gray-100: #f3f4f6;
--gray-800: #1f2937;
--gray-900: #111827;
```

### Layout

```
┌─────────────────────────────────────────────────────┐
│  [Logo] Mailrice Dashboard        [User Menu] [🔔]  │  Header
├──────────┬──────────────────────────────────────────┤
│          │                                          │
│  📊 Dash │  Page Content Area                       │
│  🌐 Domains│                                        │
│  📧 Mailboxes│                                      │
│  🔑 API Keys│                                       │
│  ⚙️  Settings│                                      │
│          │                                          │
│          │                                          │
Sidebar    │                                          │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

---

## 📋 Feature Implementation Plan

### Phase 1: Core Infrastructure (Days 1-2)

#### 1.1 Project Setup
- [ ] Initialize Vite + React + TypeScript project
- [ ] Install dependencies (React Router, Tailwind, React Query, etc.)
- [ ] Configure Tailwind CSS
- [ ] Set up folder structure
- [ ] Create base components (Button, Input, Modal, etc.)

#### 1.2 Authentication
- [ ] Create AuthContext for global state
- [ ] Build Login page with form validation
- [ ] Implement JWT storage (localStorage with HttpOnly consideration)
- [ ] Create axios interceptor for auto-attaching tokens
- [ ] Implement token refresh logic
- [ ] Create ProtectedRoute component
- [ ] Handle 401 errors (auto-logout)

#### 1.3 Layout
- [ ] Build AppLayout with sidebar + header
- [ ] Create responsive Sidebar component
- [ ] Build Header with user dropdown
- [ ] Add navigation highlighting
- [ ] Implement mobile-responsive menu

### Phase 2: Domain Management (Days 3-4)

#### 2.1 Domain List
- [ ] Create Domains page with table
- [ ] Implement domain listing with React Query
- [ ] Add search/filter functionality
- [ ] Show domain status badges (active/pending)
- [ ] Add pagination

#### 2.2 Domain Creation
- [ ] Build DomainCreate modal
- [ ] Form validation (domain format, hostname)
- [ ] API integration with error handling
- [ ] Success notification with DNS instructions
- [ ] Optimistic UI update

#### 2.3 Domain Details
- [ ] View DNS records (MX, SPF, DKIM, DMARC)
- [ ] Copy-to-clipboard functionality
- [ ] DKIM key rotation modal
- [ ] Domain deletion with confirmation

### Phase 3: Mailbox Management (Days 5-6)

#### 3.1 Mailbox List
- [ ] Create Mailboxes page with table
- [ ] Show mailbox details (email, quota, created date)
- [ ] Filter by workspace/domain
- [ ] Search functionality
- [ ] Quota usage visualization

#### 3.2 Mailbox Creation
- [ ] Build MailboxCreate modal
- [ ] Password strength validator
- [ ] Quota selection (with recommended limits)
- [ ] API integration
- [ ] Display IMAP/SMTP credentials after creation

#### 3.3 Mailbox Management
- [ ] Password reset functionality
- [ ] Quota adjustment
- [ ] Enable/disable mailbox
- [ ] Delete mailbox with confirmation

### Phase 4: API Key Management (Day 7)

#### 4.1 API Key List
- [ ] Create APIKeys page
- [ ] List existing keys with creation date
- [ ] Show last used timestamp
- [ ] Revoke key functionality

#### 4.2 API Key Creation
- [ ] Build APIKeyCreate modal
- [ ] Name input with validation
- [ ] Scope selection (future: read-only, write, admin)
- [ ] Display key ONCE after creation (with copy button)
- [ ] Warning about one-time display

### Phase 5: Dashboard Overview (Day 8)

#### 5.1 Statistics Cards
- [ ] Total domains count
- [ ] Total mailboxes count
- [ ] Active API keys count
- [ ] System health status

#### 5.2 Recent Activity
- [ ] Recent domains created
- [ ] Recent mailboxes created
- [ ] Event log viewer (last 20 events)

#### 5.3 Quick Actions
- [ ] "Create Domain" button
- [ ] "Create Mailbox" button
- [ ] "Generate API Key" button

### Phase 6: Settings & Polish (Day 9)

#### 6.1 Settings Page
- [ ] User profile information
- [ ] Change password
- [ ] Theme toggle (light/dark - optional)
- [ ] Timezone settings

#### 6.2 Error Handling
- [ ] Global error boundary
- [ ] Network error handling
- [ ] Form validation errors
- [ ] API error messages

#### 6.3 Loading States
- [ ] Skeleton loaders for tables
- [ ] Button loading states
- [ ] Full-page loader

### Phase 7: Deployment Integration (Day 10)

#### 7.1 Nginx Configuration
- [ ] Serve dashboard at `https://mail.your-domain.com/`
- [ ] API proxy at `https://mail.your-domain.com/api/`
- [ ] SPA routing (fallback to index.html)

#### 7.2 Ansible Integration
- [ ] Add dashboard build task
- [ ] Copy build files to Nginx directory
- [ ] Update Nginx configuration
- [ ] Restart Nginx after deployment

#### 7.3 Environment Configuration
- [ ] .env file handling
- [ ] API base URL configuration
- [ ] Production build optimization

---

## 🔒 Security Considerations

### Authentication
- JWT tokens stored in localStorage (consider HttpOnly cookies for enhanced security)
- Automatic token refresh before expiration
- Logout on 401 responses
- CSRF protection via SameSite cookies (if using cookie auth)

### Input Validation
- Client-side validation for all forms
- Server-side validation respected
- Sanitize user inputs
- Prevent XSS attacks

### API Security
- All requests over HTTPS
- Authorization header with Bearer token
- Rate limiting handled by backend
- No sensitive data in URL params

---

## 📊 API Integration

### Backend Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/login` | POST | User authentication |
| `/api/health` | GET | System health check |
| `/api/tenants` | GET | List tenants |
| `/api/workspaces` | GET, POST | Workspace management |
| `/api/domains` | GET, POST | Domain management |
| `/api/domains/{id}` | GET, PUT, DELETE | Domain details |
| `/api/domains/{id}/dns-records` | GET | Get DNS records |
| `/api/domains/{id}/rotate-dkim` | POST | Rotate DKIM key |
| `/api/mailboxes` | GET, POST | Mailbox management |
| `/api/mailboxes/{id}` | GET, PUT, DELETE | Mailbox details |
| `/api/mailboxes/{id}/password` | PUT | Update password |
| `/api/apikeys` | GET, POST | API key management |
| `/api/apikeys/{id}` | DELETE | Revoke API key |

### Request/Response Examples

**Login:**
```typescript
// Request
POST /api/auth/login
{
  "email": "admin@example.com",
  "password": "SecurePassword123!"
}

// Response
{
  "access_token": "eyJ0eXAiOiJKV1...",
  "token_type": "bearer",
  "expires_in": 3600
}
```

**Create Domain:**
```typescript
// Request
POST /api/domains
Authorization: Bearer {token}
{
  "workspace_id": 1,
  "domain": "example.com",
  "hostname": "mail.example.com",
  "dkim_selector": "mail"
}

// Response
{
  "id": 1,
  "domain": "example.com",
  "hostname": "mail.example.com",
  "dkim_selector": "mail",
  "dkim_public_key": "v=DKIM1; k=rsa; p=...",
  "created_at": "2025-10-08T12:00:00Z"
}
```

---

## 🧪 Testing Strategy

### Component Testing
- Unit tests for utility functions
- Component tests with React Testing Library
- Mock API calls with MSW (Mock Service Worker)

### Integration Testing
- Test full user flows (login → create domain → create mailbox)
- Test error scenarios
- Test navigation

### E2E Testing (Optional)
- Playwright for critical user paths
- Login flow
- Domain creation flow
- Mailbox creation flow

---

## 📦 Deployment

### Build Process

```bash
# Install dependencies
cd apps/dashboard
npm install

# Build for production
npm run build
# Output: apps/dashboard/dist/
```

### Ansible Integration

```yaml
# ansible/roles/dashboard/tasks/main.yml
- name: Build React dashboard
  command: npm run build
  args:
    chdir: /opt/mailrice/apps/dashboard

- name: Copy build files to Nginx
  copy:
    src: /opt/mailrice/apps/dashboard/dist/
    dest: /var/www/mailrice/
    remote_src: yes

- name: Configure Nginx for SPA routing
  template:
    src: nginx-dashboard.conf.j2
    dest: /etc/nginx/sites-available/mailrice-dashboard
```

### Nginx Configuration

```nginx
server {
    listen 443 ssl http2;
    server_name mail.example.com;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/mail.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mail.example.com/privkey.pem;

    # Dashboard (SPA)
    location / {
        root /var/www/mailrice;
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## 📈 Performance Optimization

### Build Optimization
- Code splitting by route
- Lazy loading for modals
- Tree shaking via Vite
- Asset compression (gzip/brotli)

### Runtime Optimization
- React Query caching (5-minute stale time)
- Pagination for large lists
- Virtual scrolling for 1000+ items
- Debounced search inputs

### Bundle Size Target
- Initial load: < 200KB (gzipped)
- Total JS: < 500KB (gzipped)
- First Contentful Paint: < 1.5s

---

## 🎯 Success Metrics

### Functionality
- [ ] All CRUD operations work for domains
- [ ] All CRUD operations work for mailboxes
- [ ] API key creation and revocation works
- [ ] DNS records display correctly
- [ ] DKIM rotation works

### UX
- [ ] Login is intuitive
- [ ] Navigation is clear
- [ ] Forms have helpful validation
- [ ] Success/error states are clear
- [ ] Mobile responsive (768px+)

### Performance
- [ ] Dashboard loads in < 2 seconds
- [ ] API calls complete in < 500ms
- [ ] No layout shift during load
- [ ] Smooth animations (60 FPS)

---

## 📝 Documentation

### User Documentation
- Dashboard overview
- How to create domains
- How to create mailboxes
- How to generate API keys
- Troubleshooting guide

### Developer Documentation
- Component architecture
- API service layer
- State management patterns
- Adding new features

---

## 🚀 Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Phase 1** | 2 days | Auth, layout, base components |
| **Phase 2** | 2 days | Domain management UI |
| **Phase 3** | 2 days | Mailbox management UI |
| **Phase 4** | 1 day | API key management |
| **Phase 5** | 1 day | Dashboard overview |
| **Phase 6** | 1 day | Settings, polish |
| **Phase 7** | 1 day | Deployment, Ansible |
| **Total** | **10 days** | Production-ready dashboard |

---

## 🔗 Next Session Preview

**Session 7: Webhook Notifications**
- Webhook endpoints for domain/mailbox events
- Discord/Slack integration
- Email notifications
- Custom webhook URLs per tenant

---

**Created:** October 8, 2025
**Target Completion:** Session 6 implementation
**Status:** Ready to implement
