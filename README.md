# RMM (Remote Monitoring and Management) Platform

A multi-tenant SaaS platform for managing and monitoring device fleets (Windows, Mac, iOS, Android). Deploy applications, manage updates, handle alerts, and implement cybersecurity policies with integration to Office 365/Azure AD.

## Features

### MVP (Current Phase)
- **Device Management** — Windows device registration, inventory, health monitoring
- **Web Dashboard** — Real-time device status, alerts, deployment tracking
- **App Deployment** — Validate corporate app catalog and deploy conditionally to devices
- **Azure AD Integration** — Sync users and tenants from Office 365
- **Command Execution** — Direct actions on devices (run scripts, install apps, fetch config)
- **Alerts & Monitoring** — Real-time notifications, disk space, OS updates, security events
- **Multi-Tenant Architecture** — Isolated customer data, secure authentication

### Future Phases
- Mac, Linux, iOS, Android agents
- Advanced conditional deployment rules
- Cybersecurity automation (threat detection, remediation)
- Self-healing and auto-remediation policies

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL 15+ (or use Docker Compose)
- Azure AD tenant (for authentication)

### 1. Clone & Setup

```bash
cd RMM
cp .env.example .env
# Edit .env with your Azure AD credentials
```

### 2. Start Local Infrastructure

```bash
docker-compose up -d
# Wait for Postgres and Redis to be healthy
```

### 3. Backend Setup

```bash
cd backend
npm install
npm run migrate:up        # Initialize database
npm run dev              # Start API server (http://localhost:3000)
```

### 4. Frontend Setup

```bash
cd frontend
npm install
npm run dev              # Start dashboard (http://localhost:5173)
```

### 5. Test Agent Registration

```bash
# In another terminal, start mock agent or test endpoint:
curl -X POST http://localhost:3000/api/devices/register \
  -H "Content-Type: application/json" \
  -d '{"device_name": "TEST-PC", "os": "Windows 10", "user_id": "user@example.com"}'
```

## Project Structure

See `CLAUDE.md` for detailed architecture and `ARCHITECTURE.md` for deep dives.

```
RMM/
├── backend/        # Node.js Express API (multi-tenant, REST)
├── frontend/       # React 18 dashboard
├── agent-windows/  # Windows device agent (Go/C#)
├── db/            # Database migrations & seeds
├── docs/          # Documentation
└── CLAUDE.md      # Developer guide
```

## Development Commands

### Backend
```bash
cd backend
npm run dev          # Dev server with auto-reload
npm run build        # Compile TypeScript
npm run test         # Run tests
npm run lint         # Check code style
npm run migrate:up   # Run migrations
```

### Frontend
```bash
cd frontend
npm run dev          # Dev server (http://localhost:5173)
npm run build        # Build for production
npm run test         # Run tests
```

### Agent (Windows)
```bash
cd agent-windows
go build -o rmm-agent.exe  # Build executable
go test ./...              # Run tests
```

## Key Concepts

### Multi-Tenant Architecture
Each API call is scoped to a tenant. Tenant_id is extracted from Azure AD token and validated at middleware. All database queries automatically filtered by tenant.

### Device Agent Model
Agents **poll** the backend for commands (not push). This is safer and simpler than server-initiated connections. Agents report telemetry, download apps, execute commands, and report results.

### Command Queue
Commands stored in database with validation rules. Agent polls periodically, executes, and reports status. Enables offline/retry logic.

### Real-Time Alerts
Alerts published via Redis pub/sub. Frontend subscribed via WebSocket for instant notifications (device went offline, disk space warning, update available, etc.).

## API Endpoints (MVP)

- `POST /api/devices/register` — Register new device
- `GET /api/devices` — List devices for tenant
- `GET /api/devices/:id` — Device details & telemetry
- `POST /api/commands/:device_id` — Execute command on device
- `GET /api/commands/:device_id` — Pending commands for agent
- `POST /api/apps` — Add app to catalog
- `POST /api/deployments` — Create deployment
- `GET /api/alerts` — List alerts

See `ARCHITECTURE.md` for full API spec.

## Configuration

Required environment variables:
- `AZURE_TENANT_ID` — Azure AD tenant
- `AZURE_CLIENT_ID` — Azure app registration ID
- `AZURE_CLIENT_SECRET` — Azure app secret
- `DATABASE_URL` — PostgreSQL connection
- `REDIS_URL` — Redis connection

See `.env.example` for all options.

## Testing

```bash
# Backend integration tests
cd backend && npm run test

# Frontend component tests
cd frontend && npm run test

# Agent tests
cd agent-windows && go test ./...
```

## Deployment

### Development
```bash
docker-compose up -d
npm run dev  # in backend/
npm run dev  # in frontend/
```

### Production
See `ARCHITECTURE.md` for Docker containerization, Kubernetes deployment, and CI/CD setup.

## Security

- **Tenant Isolation** — Every query filtered by tenant_id
- **Azure AD Auth** — Token validation at middleware
- **Command Signing** — Commands signed to prevent tampering
- **Audit Logging** — All actions logged for compliance
- **No Sensitive Logs** — Passwords and tokens never logged

See `CLAUDE.md` for security best practices.

## Troubleshooting

**Can't connect to database?**
```bash
docker-compose ps  # Check if postgres is running
docker-compose logs postgres  # Check logs
```

**Agent not registering?**
- Check agent log file
- Verify `BACKEND_URL` and `API_KEY` in agent config
- Ensure firewall allows outbound HTTPS

**Real-time alerts not working?**
- Check Redis connection: `redis-cli ping`
- Check WebSocket in browser DevTools
- Check backend logs for pub/sub errors

## Contributing

1. Read `CLAUDE.md` for architecture and conventions
2. Create feature branch: `git checkout -b feature/my-feature`
3. Write tests for new code
4. Run linter: `npm run lint`
5. Commit with clear message
6. Open PR for review

## License

[Add your license here]

## Support

For issues, questions, or contributions, please refer to the team documentation or contact the development team.
