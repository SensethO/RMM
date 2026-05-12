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
        const token = await getMsalToken();
        config.headers.Authorization = `Bearer ${token}`;
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
        // Token expired - user needs to login again
        window.location.href = '/login';
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

// Health check
export const health = {
  check: () => getApiClient().get<ApiResponse<Record<string, unknown>>>('/api/health'),
};
