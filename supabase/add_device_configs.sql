-- Migration: device_configs table
-- Run ONCE in Supabase SQL Editor: https://console.supabase.com/project/_/sql/new
-- Uses '00000000-0000-0000-0000-000000000000' as sentinel UUID for global (tenant-level) config

CREATE TABLE IF NOT EXISTS public.device_configs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  device_id  UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  -- ^ Use '00000000-0000-0000-0000-000000000000' for global/tenant-wide defaults
  -- ^ Use actual device UUID for per-device overrides
  config     JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_device_configs_lookup
  ON public.device_configs (tenant_id, device_id);

-- Disable RLS so the service-role key (used by backend) can read/write freely
ALTER TABLE public.device_configs DISABLE ROW LEVEL SECURITY;
