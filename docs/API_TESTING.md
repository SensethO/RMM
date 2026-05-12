# RMM API Testing Guide

## Prerequisites

1. **Backend running**: `cd backend && npm run dev` (port 3000)
2. **Supabase connected**: DATABASE_URL and keys configured in .env
3. **Azure AD**: Token required for all endpoints (except /health)

## Health Check (No Auth)

```bash
curl http://localhost:3000/api/health

# Response:
# {
#   "status": "ok",
#   "timestamp": "2026-05-12T12:00:00.000Z",
#   "environment": "development"
# }
```

## Getting a Test Token

For testing without full Azure AD setup, create a mock JWT token:

```bash
# Option 1: Use jwt.io (paste this JSON in Debugger section)
{
  "oid": "test-user-id",
  "tid": "test-tenant-id",
  "aud": "https://graph.microsoft.com",
  "iss": "https://login.microsoftonline.com/test-tenant-id/v2.0",
  "exp": 9999999999,
  "iat": 1000000000
}

# Get the token and use it in requests below
```

## Device Management

### Register Device

```bash
curl -X POST http://localhost:3000/api/devices/register \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "device-001",
    "device_name": "PC-SYLVAIN",
    "os": "Windows",
    "os_version": "10 21H2",
    "hardware_id": "xxx-yyy-zzz",
    "user_id": "user@company.com"
  }'

# Response:
# {
#   "data": {
#     "id": "uuid",
#     "tenant_id": "test-tenant-id",
#     "device_id": "device-001",
#     "device_name": "PC-SYLVAIN",
#     "status": "offline",
#     "created_at": "2026-05-12T..."
#   },
#   "statusCode": 201
# }
```

### List Devices

```bash
curl http://localhost:3000/api/devices \
  -H "Authorization: Bearer <TOKEN>"

# With filters:
curl "http://localhost:3000/api/devices?status=online&limit=10&offset=0" \
  -H "Authorization: Bearer <TOKEN>"
```

### Get Device Detail

```bash
curl http://localhost:3000/api/devices/<DEVICE_ID> \
  -H "Authorization: Bearer <TOKEN>"

# Returns device + latest telemetry
```

### Update Device Status

```bash
curl -X PATCH http://localhost:3000/api/devices/<DEVICE_ID> \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "online",
    "ip_address": "192.168.1.100",
    "last_seen": "2026-05-12T12:00:00Z"
  }'
```

## Command Management

### Queue Command

```bash
curl -X POST http://localhost:3000/api/commands/<DEVICE_ID> \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "command_type": "install_app",
    "params": {
      "app_id": "app-001",
      "version": "1.0.0"
    }
  }'

# Response:
# {
#   "data": {
#     "id": "command-uuid",
#     "status": "pending",
#     "command_type": "install_app",
#     "created_at": "..."
#   },
#   "statusCode": 201
# }
```

### Get Pending Commands (Agent Polls This)

```bash
curl "http://localhost:3000/api/commands/<DEVICE_ID>/pending?limit=10" \
  -H "Authorization: Bearer <TOKEN>"

# Response: array of pending commands
```

### Update Command Status (Agent Reports)

```bash
curl -X PATCH http://localhost:3000/api/commands/<COMMAND_ID> \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "success",
    "exit_code": 0,
    "output": "Installation completed successfully"
  }'
```

### Get Command History

```bash
curl "http://localhost:3000/api/commands/<DEVICE_ID>/history?limit=50" \
  -H "Authorization: Bearer <TOKEN>"
```

## Telemetry

### Report Telemetry

```bash
curl -X POST http://localhost:3000/api/devices/<DEVICE_ID>/telemetry \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "cpu_percent": 45.2,
    "ram_percent": 62.5,
    "disk_percent": 78.9,
    "network_bytes_sec": 1024000
  }'

# Response:
# {
#   "data": {
#     "id": "telemetry-uuid",
#     "device_id": "device-uuid",
#     "cpu_percent": 45.2,
#     "ram_percent": 62.5,
#     "disk_percent": 78.9,
#     "timestamp": "2026-05-12T..."
#   },
#   "statusCode": 201
# }
```

### Get Telemetry History

```bash
curl "http://localhost:3000/api/devices/<DEVICE_ID>/telemetry?limit=100" \
  -H "Authorization: Bearer <TOKEN>"
```

## Testing Multi-Tenant Isolation

### Test 1: Access device from different tenant

```bash
# Create token for tenant-1
TOKEN_1="<token with tid=tenant-1>"

# Register device in tenant-1
curl -X POST http://localhost:3000/api/devices/register \
  -H "Authorization: Bearer $TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"device_id": "dev-tenant1", ...}' \
  # Returns device ID: device-tenant1-uuid

# Create token for tenant-2
TOKEN_2="<token with tid=tenant-2>"

# Try to access device-tenant1-uuid from tenant-2
curl http://localhost:3000/api/devices/device-tenant1-uuid \
  -H "Authorization: Bearer $TOKEN_2"

# Expected: 404 Device not found (NOT 403 Forbidden)
```

### Test 2: List isolation

```bash
# Register 3 devices in tenant-1
# Register 2 devices in tenant-2

curl http://localhost:3000/api/devices \
  -H "Authorization: Bearer $TOKEN_1"
# Expected: Returns 3 devices (not 5)

curl http://localhost:3000/api/devices \
  -H "Authorization: Bearer $TOKEN_2"
# Expected: Returns 2 devices (not 5)
```

## Common Errors

| Status | Error | Cause |
|--------|-------|-------|
| 401 | Missing Authorization header | No Bearer token provided |
| 401 | Invalid tenant | Tenant not found in database |
| 404 | Device not found | Device doesn't exist or wrong tenant |
| 400 | Missing required fields | Incomplete request body |
| 500 | Internal server error | Server error (check logs) |

## Performance Testing

```bash
# Measure request time
time curl -X POST http://localhost:3000/api/devices/register \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{...}'

# Expected: < 200ms for typical requests
```

## Debugging

Enable debug logging:

```bash
DEBUG=* npm run dev  # in backend/
```

Check database directly:

```bash
# Supabase console → SQL Editor
SELECT * FROM devices WHERE tenant_id = 'test-tenant-id';
SELECT * FROM commands WHERE tenant_id = 'test-tenant-id' ORDER BY created_at DESC;
```
