// Device Types
export interface Device {
  id: string;
  tenant_id: string;
  device_id: string;
  device_name: string;
  os: 'Windows' | 'Mac' | 'Linux' | 'iOS' | 'Android';
  os_version?: string;
  hardware_id?: string;
  user_id?: string;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  last_seen?: string;
  ip_address?: string;
  created_at: string;
  updated_at: string;
}

export interface DeviceRegistrationInput {
  device_id: string;
  device_name: string;
  os: string;
  os_version?: string;
  hardware_id?: string;
  user_id?: string;
}

export interface DeviceStatusUpdate {
  status: 'online' | 'offline' | 'error' | 'maintenance';
  ip_address?: string;
  last_seen?: string;
}

// Command Types
export interface Command {
  id: string;
  tenant_id: string;
  device_id: string;
  command_type: string;
  params?: Record<string, unknown>;
  status: 'pending' | 'executing' | 'success' | 'failed' | 'timeout';
  exit_code?: number;
  output?: string;
  retry_count: number;
  created_at: string;
  executed_at?: string;
  updated_at: string;
}

export interface CommandQueueInput {
  command_type: string;
  params?: Record<string, unknown>;
}

export interface CommandStatusUpdate {
  status: 'executing' | 'success' | 'failed' | 'timeout';
  exit_code?: number;
  output?: string;
}

// Telemetry Types
export interface Telemetry {
  id: string;
  device_id: string;
  cpu_percent: number;
  ram_percent: number;
  disk_percent: number;
  network_bytes_sec?: number;
  timestamp: string;
}

export interface TelemetryInput {
  cpu_percent: number;
  ram_percent: number;
  disk_percent: number;
  network_bytes_sec?: number;
}

// Tenant Types
export interface Tenant {
  id: string;
  office365_tenant_id?: string;
  name: string;
  subscription_tier: string;
  created_at: string;
  updated_at: string;
}

export interface TenantContext {
  id: string;
  office365_tenant_id?: string;
  name: string;
  subscription_tier: string;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  statusCode: number;
}

export interface ApiListResponse<T> {
  data: T[];
  count: number;
  limit: number;
  offset: number;
}

// Azure AD Token Claims
export interface TokenClaims {
  oid: string; // Object ID (user)
  tid: string; // Tenant ID
  aud: string; // Audience
  iss: string; // Issuer
  exp: number; // Expiration
  iat: number; // Issued at
  [key: string]: unknown;
}
