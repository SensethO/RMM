# RMM Platform - Architecture Document

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Internet / Azure AD                      │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS + OAuth 2.0
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼────┐    ┌──────▼──────┐   ┌────▼──────┐
   │ Browser │    │   Mobile    │   │Device Agent│
   │(React)  │    │   App       │   │ (Go/C#)    │
   └────┬────┘    └──────┬──────┘   └────┬───────┘
        │                │               │
        └────────────────┼───────────────┘
                 HTTPS + JSON/REST
                         │
        ┌────────────────▼────────────────┐
        │   API Gateway / Load Balancer   │
        └────────────────┬────────────────┘
                         │
        ┌────────────────▼────────────────┐
        │  Express API Backend (Node.js)  │
        │  - Multi-instance (stateless)   │
        │  - Tenant isolation middleware  │
        │  - Command queue processing     │
        │  - Audit logging                │
        └────────────────┬────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼────┐    ┌──────▼──────┐   ┌────▼──────┐
   │PostgreSQL│   │   Redis     │   │ External  │
   │(State)   │   │(Cache/PubSub)   │Services   │
   │          │   │              │   │(Azure AD) │
   └──────────┘   └──────────────┘   └───────────┘
```

## Component Details

### 1. Frontend (React Dashboard)

**Technology Stack:**
- React 18 + TypeScript
- Vite (build tool)
- TailwindCSS or similar for styling
- MSAL for Azure AD authentication
- WebSocket for real-time updates
- Axios/Fetch for API calls

**Key Features:**
- Dashboard with device overview
- Device list with filtering/search
- Device detail page (telemetry, commands)
- App catalog management
- Deployment creation and tracking
- Alert center with history
- Real-time notifications

**Authentication:**
- Azure AD OAuth 2.0 flow via MSAL
- Access token sent in `Authorization: Bearer <token>`
- Token refresh handled transparently
- Tenant extracted from token claims

**Real-Time Updates:**
- WebSocket connection to backend
- Subscribe to: device status, alerts, deployment progress
- Fallback to polling if WebSocket unavailable

### 2. Backend API (Node.js Express)

**Core Architecture:**

```
Request
  ↓
Middleware Stack:
  1. Logger → Log all requests
  2. Auth → Validate Azure AD token
  3. Tenant → Extract tenant_id from claims
  4. Error Handler → Catch and format errors
  ↓
Route Handler:
  1. Validate input
  2. Check permissions (tenant_id match)
  3. Execute business logic (services)
  4. Return response
  ↓
Response
```

**Database Queries - Multi-Tenant Pattern:**

```javascript
// ❌ WRONG - Data leakage!
db().select().from('devices')

// ✅ CORRECT - Tenant-isolated
db().select().from('devices').where({ tenant_id: req.tenant.id })

// ✅ BETTER - Use helper
const devices = await DeviceService.listByTenant(req.tenant.id)
```

**Key Services:**

1. **DeviceService**
   - Register device
   - Update telemetry
   - List devices by tenant
   - Get device status

2. **CommandService**
   - Queue command for device
   - Fetch pending commands (for agent)
   - Update command status
   - Retry failed commands

3. **AppService**
   - Manage app catalog
   - Validate app integrity
   - Store install scripts

4. **DeploymentService**
   - Create deployment targets
   - Track deployment status
   - Handle rollback

5. **AlertService**
   - Create alerts
   - Acknowledge alerts
   - Publish to WebSocket subscribers
   - Archive old alerts

6. **AzureADService**
   - Sync users from Azure AD
   - Verify tenant ownership
   - Manage service principal

### 3. Device Agent (Windows)

**Architecture:**

```
Agent Service (Background)
  ↓
Loop every 30-60 seconds:
  1. Fetch pending commands from API
  2. Download app/script if needed
  3. Execute command
  4. Report result + telemetry
  5. Update device status
  ↓
On boot:
  1. Register device with API
  2. Send hardware inventory
  3. Start polling loop
```

**Command Types (MVP):**
- `install_app` — Download and install app
- `run_script` — Execute PowerShell/Bash script
- `fetch_config` — Download config file
- `update_os` — Trigger Windows Update
- `restart_device` — Restart the machine
- `set_policy` — Apply security policy

**Telemetry Sent:**
- CPU usage (%)
- RAM usage (%)
- Disk usage (%)
- Network activity (bytes/sec)
- Available OS updates
- Installed apps
- Security status (antivirus, firewall)

### 4. Database Schema

**Tables:**

```sql
-- Tenant: SaaS customer
tenants (
  id UUID PRIMARY KEY,
  office365_tenant_id UUID UNIQUE,
  name VARCHAR,
  subscription_tier VARCHAR,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Device: Windows/Mac/iOS/Android machine
devices (
  id UUID PRIMARY KEY,
  tenant_id UUID FOREIGN KEY,
  device_id VARCHAR UNIQUE,
  device_name VARCHAR,
  os VARCHAR,
  os_version VARCHAR,
  hardware_id VARCHAR,
  user_id VARCHAR,
  status VARCHAR ('online', 'offline', 'error'),
  last_seen TIMESTAMP,
  ip_address INET,
  created_at TIMESTAMP,
  INDEX (tenant_id, status)
)

-- Device Telemetry: Periodic metrics
device_telemetry (
  id UUID PRIMARY KEY,
  device_id UUID FOREIGN KEY,
  cpu_percent FLOAT,
  ram_percent FLOAT,
  disk_percent FLOAT,
  network_bytes_sec BIGINT,
  timestamp TIMESTAMP,
  INDEX (device_id, timestamp)
)

-- Command: Task to execute on device
commands (
  id UUID PRIMARY KEY,
  tenant_id UUID FOREIGN KEY,
  device_id UUID FOREIGN KEY,
  command_type VARCHAR ('install_app', 'run_script', ...),
  params JSONB,
  status VARCHAR ('pending', 'executing', 'success', 'failed'),
  exit_code INT,
  output TEXT,
  retry_count INT DEFAULT 0,
  created_at TIMESTAMP,
  executed_at TIMESTAMP,
  INDEX (tenant_id, device_id, status)
)

-- App Catalog: Approved applications
apps_catalog (
  id UUID PRIMARY KEY,
  tenant_id UUID FOREIGN KEY,
  app_name VARCHAR,
  version VARCHAR,
  installer_url VARCHAR,
  installer_hash VARCHAR,
  install_script TEXT,
  uninstall_script TEXT,
  created_at TIMESTAMP
)

-- Deployment: Target devices for app
deployments (
  id UUID PRIMARY KEY,
  tenant_id UUID FOREIGN KEY,
  app_id UUID FOREIGN KEY,
  name VARCHAR,
  target_condition JSONB, -- { "os": "Windows 10", "min_disk_gb": 50 }
  status VARCHAR ('draft', 'active', 'paused', 'completed'),
  deployment_method VARCHAR ('manual', 'auto'),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Alert: Events requiring attention
alerts (
  id UUID PRIMARY KEY,
  tenant_id UUID FOREIGN KEY,
  device_id UUID FOREIGN KEY,
  alert_type VARCHAR ('disk_full', 'update_available', ...),
  severity VARCHAR ('info', 'warning', 'critical'),
  message TEXT,
  acknowledged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP,
  INDEX (tenant_id, created_at DESC)
)

-- Audit Log: Who did what, when
audit_logs (
  id UUID PRIMARY KEY,
  tenant_id UUID FOREIGN KEY,
  user_id VARCHAR,
  action VARCHAR,
  resource_type VARCHAR,
  resource_id VARCHAR,
  changes JSONB,
  timestamp TIMESTAMP,
  INDEX (tenant_id, timestamp DESC)
)
```

### 5. API Endpoints

**Device Management:**
```
POST   /api/devices/register              Register new device
GET    /api/devices                       List devices
GET    /api/devices/:id                   Get device details
PATCH  /api/devices/:id                   Update device
DELETE /api/devices/:id                   Remove device
GET    /api/devices/:id/telemetry        Get device telemetry
```

**Commands:**
```
POST   /api/commands/:device_id           Queue command on device
GET    /api/commands/:device_id/pending  Fetch pending commands (agent)
PATCH  /api/commands/:id                  Update command status
GET    /api/commands/:id/history         Get device command history
```

**Apps:**
```
POST   /api/apps                          Add app to catalog
GET    /api/apps                          List apps
GET    /api/apps/:id                      Get app details
PATCH  /api/apps/:id                      Update app
DELETE /api/apps/:id                      Remove app
```

**Deployments:**
```
POST   /api/deployments                   Create deployment
GET    /api/deployments                   List deployments
GET    /api/deployments/:id               Get deployment status
PATCH  /api/deployments/:id               Update deployment
POST   /api/deployments/:id/devices      Get deployment device list
```

**Alerts:**
```
GET    /api/alerts                        List alerts
PATCH  /api/alerts/:id/acknowledge       Mark alert acknowledged
DELETE /api/alerts/:id                    Delete alert
```

**WebSocket Events (Real-Time):**
```
device:online
device:offline
device:telemetry_updated
alert:created
deployment:progress
command:completed
```

## Multi-Tenant Isolation

**Principle:** No data from Tenant A should ever be visible to Tenant B.

**Implementation:**

1. **Query Filtering:**
   - All queries filtered by `tenant_id` at service layer
   - Enforced at middleware — extract tenant from token

2. **Token Validation:**
   - Azure AD token → Extract tenant_id claim
   - Validate tenant exists in database
   - Attach to request context

3. **Error Messages:**
   - Return 404 (not found) for cross-tenant access attempts
   - Never reveal "you don't have access" (info leakage)

4. **Testing:**
   - Each test uses unique `test_tenant_id`
   - Verify query results never cross tenant boundaries

## Security Considerations

### 1. Authentication
- Azure AD OAuth 2.0
- No password storage (outsourced to Azure)
- Token refresh via MSAL

### 2. Authorization
- Tenant-scoped access (tenant_id extraction)
- Role-based access control (future)
- API key for agent registration (env var, rotate regularly)

### 3. Command Execution
- Commands are templates (not arbitrary shell)
- Parameters validated server-side
- Execution logs stored for audit
- Timeout enforcement (default 5 min)

### 4. Data Protection
- HTTPS only (enforce via HSTS)
- TLS 1.2+ for all connections
- Database encryption at rest (managed by cloud provider)
- Audit logging for compliance

### 5. Secret Management
- Environment variables for secrets (.env not in git)
- Rotate Azure AD service principal keys regularly
- Use managed identities in production (Kubernetes secrets, Azure Key Vault)

## Deployment Architecture

### Development
```
docker-compose up -d  # Local Postgres + Redis
npm run dev          # Backend on :3000
npm run dev          # Frontend on :5173
```

### Production

**Option 1: Docker Compose (Small scale)**
```
Backend: Docker container + systemd
Frontend: Nginx + Static files
Database: Managed Postgres (AWS RDS, Azure Database)
Redis: Managed (AWS ElastiCache, Azure Cache)
```

**Option 2: Kubernetes (Scale)**
```
Namespace: rmm-prod

Deployments:
  - API (replicas: 3)
  - Frontend (Nginx, static)
  
StatefulSets:
  - None (use managed Postgres + Redis)

Services:
  - API (internal ClusterIP)
  - Frontend (external LoadBalancer)

ConfigMaps:
  - App configuration
  
Secrets:
  - Azure AD credentials
  - Database password
  - JWT secret

Ingress:
  - HTTPS termination
  - Domain routing
```

## Scaling Strategy

**Horizontal Scaling:**
- API is stateless (can add instances)
- Load balance with nginx/HAProxy
- Session state in Redis (not in memory)

**Vertical Scaling:**
- Database: Increase CPU/RAM for Postgres
- Redis: Increase memory for cache

**Database Optimization:**
- Index on (tenant_id, created_at) for queries
- Archive old telemetry to cold storage
- Connection pooling (PgBouncer)

## Monitoring & Logging

**Metrics to Track:**
- API response times (p50, p95, p99)
- Device registration rate
- Command execution success rate
- Alert volume by type
- Database query times

**Logging:**
- Structured JSON logs (timestamp, level, component, tenant_id, user_id)
- Log aggregation (ELK, Datadog, etc.)
- Audit log for compliance

**Alerts:**
- API error rate > 5%
- Database replication lag > 10s
- Redis memory > 80%
- Device registration failing

## Future Enhancements

1. **Phase 2:**
   - Mac, Linux agents
   - Async command execution (job queue)
   - Advanced conditional deployment

2. **Phase 3:**
   - iOS/Android MDM
   - Cybersecurity automation
   - Machine learning for anomaly detection

3. **Phase 4:**
   - Self-healing automation
   - Cost optimization recommendations
   - Compliance reporting (SOC2, HIPAA, GDPR)
