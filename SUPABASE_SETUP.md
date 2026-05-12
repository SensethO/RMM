# Supabase Setup Guide

## Prerequisites
- Supabase account (https://supabase.com)
- Supabase CLI installed (`npm install -g supabase`)
- Project created on Supabase

## Setup Steps

### 1. Configure Supabase Project

```bash
# Login to Supabase
supabase login

# Link your project
supabase link --project-ref your-project-id
```

### 2. Create Environment Variables

Copy your Supabase credentials to `.env.local`:

```bash
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
```

### 3. Apply Migrations

```bash
# Push migrations to Supabase
supabase db push

# Or manually in Supabase console:
# SQL Editor → New Query → Copy content from supabase/migrations/
```

### 4. Enable Row Level Security (RLS)

In Supabase Console:
1. Go to **Authentication** → **Policies**
2. Enable RLS for each table (already done in migration)
3. Create policies for tenant isolation

### 5. Set Up Realtime

Enable Realtime in Supabase Console:
- **Realtime** section
- Subscribe to changes on devices, commands, alerts tables

## Usage in Code

### Backend (Node.js)
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY  // Use service key for backend
);

// Query with tenant isolation
const devices = await supabase
  .from('devices')
  .select()
  .eq('tenant_id', tenantId)
  .eq('status', 'online');
```

### Frontend (React)
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY  // Use anon key for frontend
);

// RLS policies will automatically limit to current user's tenant
const devices = await supabase
  .from('devices')
  .select()
  .eq('status', 'online');
```

## Backup & Restore

### Backup Database
```bash
# Automatic backups are enabled on Supabase (daily)
# Manual export in console: Database → Backups → Export
```

### Restore Database
```bash
supabase db pull  # Pull schema changes
```

## Monitoring

### Check Logs
- Supabase Console → Logs → API / Database / Auth

### Performance Monitoring
- Supabase Console → Statistics

## Security Best Practices

1. **Service Key**: Use only in backend (never expose in frontend)
2. **Anon Key**: Safe for frontend (public)
3. **RLS Policies**: Always enable and test
4. **Auth**: Use Supabase Auth for user management
5. **Rate Limiting**: Configure in Supabase settings

## Troubleshooting

### Connection Issues
```bash
# Test connection
supabase status
```

### RLS Preventing Access
- Check RLS policies in console
- Verify user has correct tenant_id claim

### Missing Migrations
```bash
# Push local migrations
supabase db push --include-seed
```

## References
- Supabase Docs: https://supabase.com/docs
- Realtime: https://supabase.com/docs/guides/realtime
- RLS: https://supabase.com/docs/guides/auth/row-level-security
