import axios, { AxiosInstance, AxiosError } from 'axios';
import { useMsal } from '@azure/msal-react';

let apiClient: AxiosInstance | null = null;

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  statusCode: number;
  count?: number;
  limit?: number;
  offset?: number;
}

/**
 * Initialize API client with auth interceptor
 */
export function initializeApiClient(getMsalToken: () => Promise<string>): AxiosInstance {
  const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  apiClient = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Add token to every request
  apiClient.interceptors.request.use(
    async (config) => {
      try {
        // Check for manual auth token first (from login form)
        const manualToken = localStorage.getItem('auth_token');
        if (manualToken) {
          config.headers.Authorization = `Bearer ${manualToken}`;
        } else {
          // Fall back to MSAL token
          const token = await getMsalToken();
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (error) {
        console.error('Failed to get token:', error);
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Handle errors
  apiClient.interceptors.response.use(
    (response) => response,
    (error: AxiosError) => {
      if (error.response?.status === 401) {
        // Clear manual auth token if it exists
        localStorage.removeItem('auth_token');
        // Token expired - user needs to login again
        window.location.href = '/';
      }
      return Promise.reject(error);
    }
  );

  return apiClient;
}

export function getApiClient(): AxiosInstance {
  if (!apiClient) {
    throw new Error('API client not initialized. Call initializeApiClient first.');
  }
  return apiClient;
}

// Device API
export const deviceAPI = {
  register: (data: {
    device_id: string;
    device_name: string;
    os: string;
    os_version?: string;
    hardware_id?: string;
    user_id?: string;
  }) => getApiClient().post<ApiResponse<Record<string, unknown>>>('/api/devices/register', data),

  list: (filters?: { status?: string; limit?: number; offset?: number }) =>
    getApiClient().get<ApiResponse<Record<string, unknown>[]>>('/api/devices', { params: filters }),

  get: (deviceId: string) =>
    getApiClient().get<ApiResponse<Record<string, unknown>>>(`/api/devices/${deviceId}`),

  updateStatus: (
    deviceId: string,
    data: { status: string; ip_address?: string; last_seen?: string }
  ) => getApiClient().patch<ApiResponse<Record<string, unknown>>>(`/api/devices/${deviceId}`, data),

  getTelemetry: (deviceId: string, limit = 100) =>
    getApiClient().get<ApiResponse<Record<string, unknown>[]>>(
      `/api/devices/${deviceId}/telemetry`,
      { params: { limit } }
    ),

  reportTelemetry: (
    deviceId: string,
    data: {
      cpu_percent: number;
      ram_percent: number;
      disk_percent: number;
      network_bytes_sec?: number;
    }
  ) =>
    getApiClient().post<ApiResponse<Record<string, unknown>>>(
      `/api/devices/${deviceId}/telemetry`,
      data
    ),
};

// Command API
export const commandAPI = {
  getPending: (deviceId: string, limit = 10) =>
    getApiClient().get<ApiResponse<Record<string, unknown>[]>>(
      `/api/commands/${deviceId}/pending`,
      { params: { limit } }
    ),

  queue: (deviceId: string, data: { command_type: string; params?: Record<string, unknown> }) =>
    getApiClient().post<ApiResponse<Record<string, unknown>>>(`/api/commands/${deviceId}`, data),

  updateStatus: (
    commandId: string,
    data: { status: string; exit_code?: number; output?: string }
  ) =>
    getApiClient().patch<ApiResponse<Record<string, unknown>>>(`/api/commands/${commandId}`, data),

  getHistory: (deviceId: string, limit = 50) =>
    getApiClient().get<ApiResponse<Record<string, unknown>[]>>(
      `/api/commands/${deviceId}/history`,
      { params: { limit } }
    ),
};

// Alerts API
export const alertAPI = {
  list: (limit = 50) =>
    getApiClient().get<ApiResponse<Record<string, unknown>[]>>('/api/alerts', { params: { limit } }),
  acknowledge: (alertId: string) =>
    getApiClient().patch<ApiResponse<Record<string, unknown>>>(`/api/alerts/${alertId}/acknowledge`),
};

// Config / Settings API
export interface AgentConfig {
  telemetryInterval: number;
  pollInterval:      number;
  commandTimeout:    number;
  maxOutputLength:   number;
  alerts: {
    cpuThreshold:  number;
    ramThreshold:  number;
    diskThreshold: number;
  };
}

export const configAPI = {
  getGlobal: () =>
    getApiClient().get<ApiResponse<AgentConfig> & { isDefault: boolean }>('/api/config'),

  saveGlobal: (config: Partial<AgentConfig>) =>
    getApiClient().put<ApiResponse<AgentConfig>>('/api/config', config),

  getForDevice: (deviceId: string) =>
    getApiClient().get<ApiResponse<AgentConfig> & { globalConfig: Partial<AgentConfig> | null; deviceOverride: Partial<AgentConfig> | null }>(
      `/api/devices/${deviceId}/config`
    ),

  saveForDevice: (deviceId: string, config: Partial<AgentConfig>) =>
    getApiClient().put<ApiResponse<AgentConfig>>(`/api/devices/${deviceId}/config`, config),

  resetDevice: (deviceId: string) =>
    getApiClient().delete<ApiResponse<null>>(`/api/devices/${deviceId}/config`),
};

// Health check
export const health = {
  check: () => getApiClient().get<ApiResponse<Record<string, unknown>>>('/api/health'),
};
