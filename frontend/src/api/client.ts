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

// Deploy API
export interface AppDeployParams {
  method: 'winget' | 'url';
  package_id?: string;
  url?: string;
  install_args?: string;
  display_name: string;
}

export const deployAPI = {
  // Envoie install_app à une liste de devices (en parallèle)
  dispatch: (deviceIds: string[], params: AppDeployParams) =>
    Promise.all(
      deviceIds.map(id =>
        getApiClient().post<ApiResponse<Record<string, unknown>>>(`/api/commands/${id}`, {
          command_type: 'install_app',
          params,
        })
      )
    ),

  // Désinstaller sur une liste de devices
  dispatchUninstall: (deviceIds: string[], params: { package_id: string; display_name: string }) =>
    Promise.all(
      deviceIds.map(id =>
        getApiClient().post<ApiResponse<Record<string, unknown>>>(`/api/commands/${id}`, {
          command_type: 'uninstall_app',
          params: { method: 'winget', ...params },
        })
      )
    ),

  // Lister les apps installées d'un device
  listApps: (deviceId: string) =>
    getApiClient().post<ApiResponse<Record<string, unknown>>>(`/api/commands/${deviceId}`, {
      command_type: 'list_installed_apps',
      params: {},
    }),

  // Historique des déploiements de tout le parc
  history: (limit = 100) =>
    getApiClient().get<ApiResponse<Record<string, unknown>[]>>('/api/deploy/history', { params: { limit } }),
};

// Health check
export const health = {
  check: () => getApiClient().get<ApiResponse<Record<string, unknown>>>('/api/health'),
};

// Organization API (entreprises / sites / services)
export const orgAPI = {
  listOrgs:    () => getApiClient().get<ApiResponse<Record<string, unknown>[]>>('/api/organizations'),
  createOrg:   (data: Record<string, unknown>) => getApiClient().post<ApiResponse<Record<string, unknown>>>('/api/organizations', data),
  updateOrg:   (id: string, data: Record<string, unknown>) => getApiClient().patch<ApiResponse<Record<string, unknown>>>(`/api/organizations/${id}`, data),
  deleteOrg:   (id: string) => getApiClient().delete<ApiResponse<null>>(`/api/organizations/${id}`),

  listSites:   () => getApiClient().get<ApiResponse<Record<string, unknown>[]>>('/api/sites'),
  createSite:  (data: Record<string, unknown>) => getApiClient().post<ApiResponse<Record<string, unknown>>>('/api/sites', data),
  updateSite:  (id: string, data: Record<string, unknown>) => getApiClient().patch<ApiResponse<Record<string, unknown>>>(`/api/sites/${id}`, data),
  deleteSite:  (id: string) => getApiClient().delete<ApiResponse<null>>(`/api/sites/${id}`),

  listDepts:   () => getApiClient().get<ApiResponse<Record<string, unknown>[]>>('/api/departments'),
  createDept:  (data: Record<string, unknown>) => getApiClient().post<ApiResponse<Record<string, unknown>>>('/api/departments', data),
  updateDept:  (id: string, data: Record<string, unknown>) => getApiClient().patch<ApiResponse<Record<string, unknown>>>(`/api/departments/${id}`, data),
  deleteDept:  (id: string) => getApiClient().delete<ApiResponse<null>>(`/api/departments/${id}`),

  assignDevice: (deviceId: string, payload: { organization_id?: string | null; site_id?: string | null; department_id?: string | null; notes?: string }) =>
    getApiClient().patch<ApiResponse<Record<string, unknown>>>(`/api/devices/${deviceId}/assignment`, payload),
};

// Microsoft 365 / Graph API
export const microsoft365API = {
  status:       () => getApiClient().get<ApiResponse<{ configured: boolean; connected?: boolean; tenant_id?: string }>>('/api/microsoft365/status'),
  azureDevices: (top?: number) => getApiClient().get<ApiResponse<Record<string, unknown>[]>>('/api/microsoft365/azure-devices', { params: { top } }),
  intune:       (top?: number) => getApiClient().get<ApiResponse<Record<string, unknown>[]>>('/api/microsoft365/intune-devices', { params: { top } }),
  autopilot:    () => getApiClient().get<ApiResponse<Record<string, unknown>[]>>('/api/microsoft365/autopilot'),
  users:        (top?: number) => getApiClient().get<ApiResponse<Record<string, unknown>[]>>('/api/microsoft365/users', { params: { top } }),
  subscriptions: () => getApiClient().get<ApiResponse<Record<string, unknown>[]>>('/api/microsoft365/subscriptions'),
};
