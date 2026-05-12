-- RMM Platform - Initial Database Schema

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Tenants (SaaS customers)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  office365_tenant_id UUID UNIQUE,
  name VARCHAR(255) NOT NULL,
  subscription_tier VARCHAR(50) DEFAULT 'basic',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Devices (Windows, Mac, iOS, Android machines)
CREATE TABLE devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id VARCHAR(255) UNIQUE NOT NULL,
  device_name VARCHAR(255) NOT NULL,
  os VARCHAR(50) NOT NULL,
  os_version VARCHAR(50),
  hardware_id VARCHAR(255),
  user_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'offline',
  last_seen TIMESTAMP WITH TIME ZONE,
  ip_address INET,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT status_check CHECK (status IN ('online', 'offline', 'error', 'maintenance')),
  INDEX (tenant_id, status),
  INDEX (device_id, tenant_id)
);

-- Device Telemetry (CPU, RAM, Disk metrics)
CREATE TABLE device_telemetry (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  cpu_percent FLOAT CHECK (cpu_percent >= 0 AND cpu_percent <= 100),
  ram_percent FLOAT CHECK (ram_percent >= 0 AND ram_percent <= 100),
  disk_percent FLOAT CHECK (disk_percent >= 0 AND disk_percent <= 100),
  network_bytes_sec BIGINT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX (device_id, timestamp)
);

-- Commands (Tasks to execute on devices)
CREATE TABLE commands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  command_type VARCHAR(50) NOT NULL,
  params JSONB,
  status VARCHAR(20) DEFAULT 'pending',
  exit_code INT,
  output TEXT,
  retry_count INT DEFAULT 0 CHECK (retry_count >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  executed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT status_check CHECK (status IN ('pending', 'executing', 'success', 'failed', 'timeout')),
  INDEX (tenant_id, status),
  INDEX (device_id, status),
  INDEX (created_at DESC)
);

-- App Catalog (Approved applications)
CREATE TABLE apps_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_name VARCHAR(255) NOT NULL,
  version VARCHAR(50) NOT NULL,
  installer_url VARCHAR(255),
  installer_hash VARCHAR(64),
  install_script TEXT,
  uninstall_script TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(tenant_id, app_name, version),
  INDEX (tenant_id)
);

-- Deployments (Target devices for app installation)
CREATE TABLE deployments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_id UUID NOT NULL REFERENCES apps_catalog(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  target_condition JSONB,
  status VARCHAR(20) DEFAULT 'draft',
  deployment_method VARCHAR(20) DEFAULT 'manual',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT status_check CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  INDEX (tenant_id, status)
);

-- Alerts (Events requiring attention)
CREATE TABLE alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) DEFAULT 'info',
  message TEXT NOT NULL,
  acknowledged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT severity_check CHECK (severity IN ('info', 'warning', 'critical')),
  INDEX (tenant_id, created_at DESC),
  INDEX (device_id, acknowledged)
);

-- Audit Logs (Compliance and security)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id UUID,
  changes JSONB,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  INDEX (tenant_id, timestamp DESC),
  INDEX (user_id, timestamp DESC)
);

-- Row Level Security (RLS) Policies for multi-tenant isolation
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE apps_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Grant permissions to authenticated users
GRANT ALL ON tenants TO authenticated;
GRANT ALL ON devices TO authenticated;
GRANT ALL ON device_telemetry TO authenticated;
GRANT ALL ON commands TO authenticated;
GRANT ALL ON apps_catalog TO authenticated;
GRANT ALL ON deployments TO authenticated;
GRANT ALL ON alerts TO authenticated;
GRANT ALL ON audit_logs TO authenticated;

-- Allow service role for backend operations
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
