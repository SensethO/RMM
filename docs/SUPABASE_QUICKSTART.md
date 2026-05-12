# Supabase Quickstart - RMM Platform

## Step 1: Get Your Supabase Credentials

1. Go to: https://console.supabase.com
2. Select your project
3. Go to **Settings → API**
4. Copy:
   - **Project URL** → `SUPABASE_URL`
   - **anon public key** → `SUPABASE_ANON_KEY` (frontend)
   - **service_role key** → `SUPABASE_SERVICE_KEY` (backend - keep secret!)

## Step 2: Create Database Schema

### Option A: Via SQL Editor (Easiest)

1. Go to **SQL Editor** in Supabase console
2. Click **New Query**
3. Copy entire content from: `supabase/migrations/20240512000000_initial_schema.sql`
4. Paste into SQL Editor
5. Click **Run**
6. ✅ Tables created!

### Option B: Via CLI

```bash
supabase link --project-ref your-project-id
supabase db push
```

## Step 3: Verify Tables Created

Go to **Table Editor** → You should see:
- ✅ tenants
- ✅ devices
- ✅ device_telemetry
- ✅ commands
- ✅ apps_catalog
- ✅ deployments
- ✅ alerts
- ✅ audit_logs

## Step 4: Configure Row Level Security (RLS)

**IMPORTANT**: RLS is enabled in the migration, but you need to create policies for tenant isolation.

### Enable RLS on All Tables

1. Go to **Authentication → Policies** in Supabase console
2. For EACH table (devices, commands, etc.):
   - Click on the table
   - Toggle **Enable RLS** (should already be ON)
   - Click **New Policy**

### Create Tenant Isolation Policy

For each table, create a policy like this:

```sql
-- Policy: Tenants can only access their own data
CREATE POLICY "Users can access their tenant data"
ON devices
FOR SELECT
USING (
  auth.uid()::text = (
    SELECT user_id FROM tenants 
    WHERE id = devices.tenant_id
  )
);
```

**Or simpler approach for MVP** (use column filtering):

1. In Supabase console → Authentication → Policies
2. Click **New Policy** on a table
3. Select: **For SELECT** (or INSERT/UPDATE as needed)
4. Add condition: `tenant_id = (auth.jwt() ->> 'tid')`
5. Click **Save**

Repeat for all tables: devices, commands, device_telemetry, apps_catalog, deployments, alerts, audit_logs

## Step 5: Create Test Tenant

1. Go to **Table Editor** → **tenants**
2. Click **Insert Row**
3. Add:
   ```
   id: 550e8400-e29b-41d4-a716-446655440000
   office365_tenant_id: test-tenant-001
   name: Test Tenant
   subscription_tier: basic
   ```
4. ✅ Save

## Step 6: Configure Backend

Update `.env` in backend:

```bash
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...  # Keep secret!
```

## Step 7: Configure Frontend

Update `.env` in frontend:

```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...
```

## Step 8: Test Connection

### Backend Test

```bash
cd backend
npm install
npm run dev

# You should see: "Supabase client initialized"
# Check backend logs
```

### Frontend Test

```bash
cd frontend
npm install
npm run dev

# Open http://localhost:5173
# Login and try to fetch devices
# Should see API call to /api/devices
```

## Step 9: Create Test Device

Use curl to register a device:

```bash
TOKEN="your-jwt-token"

curl -X POST http://localhost:3000/api/devices/register \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "test-device-001",
    "device_name": "Test PC",
    "os": "Windows",
    "os_version": "10"
  }'
```

## Troubleshooting

### "No rows found" error
- Check RLS policies are enabled
- Verify tenant_id matches token claim
- Check logs in Supabase → Logs → API

### "Invalid tenant" error
- Verify tenant exists in `tenants` table
- Check tenant_id in JWT token matches

### Connection refused
- Verify SUPABASE_URL is correct
- Check firewall/network
- Verify service key has correct permissions

### Slow queries
- Check indexes are created (in migrations)
- Monitor query performance in Supabase → Logs → Database

## Next Steps

1. ✅ Database initialized
2. ⏳ Deploy to Vercel (see DEPLOYMENT_GUIDE.md)
3. ⏳ Configure Windows Agent
4. ⏳ Add WebSocket for real-time updates

## Resources

- Supabase Docs: https://supabase.com/docs
- RLS Guide: https://supabase.com/docs/guides/auth/row-level-security
- SQL Editor Tips: https://supabase.com/docs/guides/database/sql-editor
