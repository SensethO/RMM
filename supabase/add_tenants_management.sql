-- ─── Tenant management setup ─────────────────────────────────────────────────
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/ebgjazfgxsumzbsvyrna/sql/new

-- 1. Ensure the demo tenant exists (used as fallback for agents without tenant_id)
INSERT INTO tenants (id, name, office365_tenant_id, subscription_tier)
VALUES (
  'a0000000-dead-beef-0000-000000000001',
  'Demo Tenant',
  NULL,
  'demo'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow service_role to bypass RLS on tenants (already the case, but explicit)
-- The backend uses SUPABASE_SERVICE_KEY which bypasses RLS automatically.

-- 3. Optional: create a row for your own MSP (SCDB PRO SARL)
-- Replace YOUR_AZURE_TENANT_ID with the value from Azure Portal → Properties
-- INSERT INTO tenants (name, office365_tenant_id, subscription_tier)
-- VALUES ('SCDB PRO SARL', 'YOUR_AZURE_TENANT_ID', 'enterprise')
-- ON CONFLICT DO NOTHING;

-- 4. Verify
SELECT id, name, office365_tenant_id, subscription_tier FROM tenants ORDER BY name;
