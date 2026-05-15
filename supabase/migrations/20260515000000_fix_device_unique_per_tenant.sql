-- Migration: Fix device_id unique constraint to be per-tenant, not global
-- Allows devices to migrate between tenants in a multi-tenant MSP setup

-- 1. Drop the global UNIQUE constraint on device_id
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_device_id_key;

-- 2. Add a composite UNIQUE constraint (tenant_id, device_id)
-- This allows the same device_id under different tenants
ALTER TABLE devices
  ADD CONSTRAINT devices_tenant_device_unique UNIQUE (tenant_id, device_id);

-- 3. Clean up redundant index
DROP INDEX IF EXISTS devices_device_id_tenant;

-- 4. Create a useful composite index for queries
CREATE INDEX IF NOT EXISTS devices_device_id_tenant ON devices(device_id, tenant_id);
