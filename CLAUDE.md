# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: RMM (Remote Monitoring and Management) SaaS Platform

A multi-tenant SaaS platform for managing device fleets (Windows, Mac, iOS, Android), deploying applications, managing updates, and implementing cybersecurity policies. Integrates with Office 365/Azure AD for tenant management.

**MVP Focus:** Windows devices + Web dashboard + Azure AD integration + basic app deployment.

---

## Architecture Overview

### High-Level Design

```
┌─────────────────────────────────────────────────────────┐
│                    Web Dashboard (React)                │
│          (Device mgmt, Alerts, Deployments, Apps)       │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS + WebSocket (Real-time alerts)
                       │
┌──────────────────────▼──────────────────────────────────┐
│             REST API Backend (Node.js/Express)          │
│  - Multi-tenant isolation (tenant_id in all queries)    │
│  - Azure AD B2B authentication                          │
│  - Command queue & device registry                      │
│  - Audit logging                                        │
└──────────────────────┬──────────────────────────────────┘
                       │ PostgreSQL + Redis
                       │
        ┌──────────────┴──────────────┐
        │                             │
   ┌────▼──────┐              ┌──────▼─────┐
   │ PostgreSQL │              │   Redis    │
   │ (State)    │              │ (Cache/Q)  │
   └────────────┘              └────────────┘


┌─────────────────────────────────────────────────────────┐
│                   Device Agent (Windows)                │
│  - Polls backend for commands (secure pull model)       │
│  - Reports telemetry (CPU, RAM, disk, OS updates)       │
│  - Executes deployments, scripts, config changes        │
│  - Built as Go executable or C# service                 │
└─────────────────────────────────────────────────────────┘
```

### Directory Structure

```
RMM/
├── backend/                    # Node.js REST API
│   ├── src/
│   │   ├── server.ts          # Express app entry
│   │   ├── middleware/
│   │   │   ├── auth.ts        # Azure AD token validation
│   │   │   └── tenant.ts      # Tenant context extraction
│   │   ├── routes/            # API endpoints (devices, commands, apps, deployments)
│   │   ├── models/            # DB models (Device, Command, Deployment, Alert)
│   │   ├── services/          # Business logic (azure AD sync, command execution)
│   │   ├── db/
│   │   │   └── migrations/    # Knex migrations
│   │   └── utils/             # Helpers (tenant-isolation, validation)
│   ├── package.json
│   └── .env.example
│
├── frontend/                   # React dashboard
│   ├── src/
│   │   ├── pages/             # Main views (Dashboard, Devices, Apps, Alerts, Deployments)
│   │   ├── components/        # Reusable UI components
│   │   ├── hooks/             # Custom hooks (useWebSocket, useApi)
│   │   ├── api/               # API client with auth
│   │   ├── types/             # TypeScript types
│   │   └── App.tsx            # Root component
│   ├── package.json
│   └── .env.example
│
├── agent-windows/             # Windows device agent
│   ├── main.go (or main.cs)
│   ├── client/                # Registration, polling, telemetry
│   ├── executor/              # Command execution
│   ├── config/
│   └── build/                 # MSI/EXE build scripts
│
├── db/                        # Database setup
│   ├── migrations/            # SQL migration files
│   └── seeds/                 # Test data
│
├── docker-compose.yml         # Local dev environment (Postgres, Redis)
├── .env.example               # Environment template
├── .gitignore
├── ARCHITECTURE.md            # Detailed architecture documentation
└── README.md                  # Project overview and setup
```

---

## Key Architecture Decisions

### 1. Multi-Tenant Isolation
- **Enforce tenant_id in every database query** via middleware
- All tables have `tenant_id` foreign key (no cross-tenant data leakage)
- Query helper functions built into `services/` to prevent mistakes
- Test isolation: Each test gets a unique test tenant_id

### 2. Agent Communication Model
- **Poll, don't push** — Agent initiates requests (safer, simpler firewall)
- Commands stored in database with signature validation
- Exponential backoff for retries
- Agent can self-update from backend

### 3. Authentication
- **Azure AD tokens** passed from frontend → backend
- Token validation at middleware level
- Tenant_id extracted from token claims (no session storage)
- Stateless API design for horizontal scaling

### 4. Real-Time Updates
- WebSocket connection for alerts/device status
- Redis pub/sub for multi-instance backend coordination
- Fallback to polling if WebSocket unavailable

### 5. Command Execution
- Commands are templates stored in DB (e.g., "install_app", "run_script")
- Validation rules prevent dangerous commands (no arbitrary shell execution)
- Execution history and exit codes logged for audit

---

## Development Commands

### Backend
```bash
cd backend
npm install                    # Install dependencies
npm run dev                    # Start dev server (watches for changes)
npm run build                  # Compile TypeScript
npm run test                   # Run all tests
npm run test -- --grep "auth" # Run specific test
npm run lint                   # Run ESLint
npm run migrate:up             # Run database migrations
npm run migrate:down           # Rollback last migration
```

### Frontend
```bash
cd frontend
npm install
npm run dev                    # Start dev server (localhost:5173)
npm run build                  # Build for production
npm run test                   # Run Vitest tests
npm run lint                   # Run ESLint
```

### Agent (Windows)
```bash
cd agent-windows
go build -o rmm-agent.exe     # Build executable
go test ./...                  # Run tests
# or for C#:
dotnet build
dotnet test
```

### Local Environment
```bash
docker-compose up -d           # Start Postgres + Redis locally
npm run migrate:up             # Initialize database
```

---

## Common Workflows

### Adding a New Endpoint
1. Define route in `backend/src/routes/`
2. Add middleware: `authMiddleware`, `tenantMiddleware` (auto-extracted from request)
3. Query database with `db().select().from('table').where({ tenant_id, ... })`
4. Return JSON response
5. Add tests in `backend/src/__tests__/`

### Adding a Device Command Type
1. Add command type to `backend/src/models/command.ts`
2. Define validation rules (allowed params, security constraints)
3. Add executor logic in agent `executor/command-executor.go`
4. Test end-to-end: API → Command queue → Agent execution → Status report

### Deploying an App to Devices
1. Admin uploads app to catalog (`POST /apps`)
2. Admin creates deployment with target filters (`POST /deployments`)
3. Agent polls for deployments, downloads app, executes install script
4. Agent reports success/failure back to API
5. Dashboard shows deployment progress

### Real-Time Alert
1. Device sends telemetry with alert condition (e.g., disk > 90%)
2. Backend evaluates alert rules and publishes to Redis pub/sub
3. WebSocket subscribers notified (dashboard updates immediately)
4. Alert stored in DB for history

---

## Code Conventions

### Tenant Safety
- **Never write:** `db().select().from('devices')`
- **Always write:** `db().select().from('devices').where({ tenant_id: req.tenant.id })`
- Create helper: `db().devicesForTenant(req.tenant.id)`

### Error Handling
- Return HTTP status codes consistently (400 bad request, 401 unauthorized, 403 forbidden, 500 server error)
- Include `error` field in JSON response: `{ error: "Device not found" }`
- Log errors with tenant_id for auditing

### Testing
- Unit test business logic in `services/`
- Integration test endpoints with real DB (use test tenant_id)
- Mock Azure AD tokens in tests
- Clean up test data in `afterEach()`

### TypeScript
- Type all request/response bodies
- Use discriminated unions for command types
- No `any` types (use `unknown` + type guards)

---

## Important Files to Know

| File | Purpose |
|------|---------|
| `backend/src/middleware/tenant.ts` | Extract & validate tenant context |
| `backend/src/utils/tenant-isolation.ts` | Query builders with tenant_id |
| `backend/src/services/azure.ts` | Azure AD B2B integration |
| `frontend/src/api/client.ts` | HTTP client + auth headers |
| `frontend/src/hooks/useWebSocket.ts` | Real-time alerts subscription |
| `agent-windows/client/device-registration.go` | Agent registration logic |
| `agent-windows/client/command-poller.go` | Polling loop |
| `db/migrations/001_initial.sql` | Schema definition |

---

## Environment Variables

**Backend (.env):**
```
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/rmm
REDIS_URL=redis://localhost:6379
AZURE_TENANT_ID=your-tenant-id
AZURE_CLIENT_ID=your-app-id
AZURE_CLIENT_SECRET=your-secret
JWT_SECRET=your-secret-key
```

**Frontend (.env):**
```
VITE_API_URL=http://localhost:3000
VITE_AZURE_CLIENT_ID=your-app-id
VITE_AZURE_AUTHORITY=https://login.microsoftonline.com/your-tenant-id
```

---

## Debugging Tips

### Backend
- Enable SQL logging: `DEBUG=knex:query npm run dev`
- Check Redis: `redis-cli keys '*'`
- Verify tokens: Decode JWT at `jwt.io`

### Frontend
- Browser DevTools → Network tab (WebSocket messages)
- Check auth: Console → `localStorage.getItem('token')`

### Agent
- Windows: Check Service logs (`Services.msc` → RMM Agent)
- Enable verbose logging: Set `LOG_LEVEL=debug` env var

---

## Security Considerations

1. **Never log sensitive data** (passwords, tokens, API keys)
2. **Validate all inputs** at API boundaries (tenant_id, command params)
3. **Sign commands** with HMAC to prevent tampering
4. **Encrypt** command payloads if they contain sensitive data
5. **Rotate credentials** regularly (Azure AD service principal keys)
6. **Audit all actions** — log who did what, when, on which device
7. **Rate limit** API endpoints to prevent abuse

---

## Testing Strategy

- **Unit tests** for business logic (services, models)
- **Integration tests** for API endpoints (with test DB)
- **E2E tests** for critical flows (device registration → app deployment → execution)
- **Load tests** before production (multi-tenant, many devices)

---

## Known Limitations (MVP Phase)

- Windows agent only (Mac/Linux/iOS/Android in later phases)
- Basic app deployment (no complex conditional logic yet)
- No advanced cybersecurity automation (alerts only)
- No agent auto-update mechanism yet
- Limited to synchronous command execution (async queues in phase 2)

---

## Next Steps for New Features

1. **Update database schema** if adding new data types
2. **Add API route** to expose the feature
3. **Implement agent logic** if device-side execution needed
4. **Update dashboard** to show/manage the feature
5. **Write tests** (unit, integration, E2E)
6. **Update this CLAUDE.md** if the architecture changes
