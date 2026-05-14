import { useEffect, useState } from 'react';
import { useApiClient, useFetch } from '../hooks/useApi';
import { deviceAPI } from '../api/client';

interface Device {
  id: string;
  device_name: string;
  status: 'online' | 'offline' | 'error' | 'maintenance';
  os: string;
  last_seen?: string;
}

export default function Dashboard() {
  const { isReady } = useApiClient();
  const [devices, setDevices] = useState<Device[]>([]);
  const [stats, setStats] = useState({ online: 0, offline: 0, error: 0 });

  useEffect(() => {
    if (!isReady) return;

    const fetchDevices = async () => {
      try {
        const response = await deviceAPI.list({ limit: 100 });
        if (response.data.data) {
          setDevices(response.data.data as Device[]);

          // Calculate stats
          const online = (response.data.data as Device[]).filter(
            (d) => d.status === 'online'
          ).length;
          const offline = (response.data.data as Device[]).filter(
            (d) => d.status === 'offline'
          ).length;
          const error = (response.data.data as Device[]).filter(
            (d) => d.status === 'error'
          ).length;

          setStats({ online, offline, error });
        }
      } catch (err) {
        console.error('Failed to fetch devices:', err);
      }
    };

    fetchDevices();

    // Watchdog : marque offline les devices silencieux > 5 min, puis rafraîchit
    const BASE = import.meta.env.VITE_API_URL || 'https://backend-xi-one-36.vercel.app';
    const token = localStorage.getItem('auth_token');
    const runWatchdog = () =>
      fetch(`${BASE}/api/system/watchdog`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).then(() => fetchDevices()).catch(() => {});

    runWatchdog(); // immédiat
    const wdTimer = setInterval(runWatchdog, 5 * 60 * 1000);
    return () => clearInterval(wdTimer);
  }, [isReady]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-green-100 text-green-800';
      case 'offline':
        return 'bg-gray-100 text-gray-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'online':
        return '🟢';
      case 'offline':
        return '⚫';
      case 'error':
        return '🔴';
      default:
        return '🟡';
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-4xl font-bold text-green-600">{stats.online}</div>
          <div className="text-gray-600 mt-2">Online Devices</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-4xl font-bold text-gray-600">{stats.offline}</div>
          <div className="text-gray-600 mt-2">Offline Devices</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-4xl font-bold text-red-600">{stats.error}</div>
          <div className="text-gray-600 mt-2">Error Devices</div>
        </div>
      </div>

      {/* Devices Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">Devices ({devices.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Device Name
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">OS</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Last Seen
                </th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                    No devices registered yet
                  </td>
                </tr>
              ) : (
                devices.map((device) => (
                  <tr key={device.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                      {device.device_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{device.os}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(device.status)}`}>
                        {getStatusBadge(device.status)} {device.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {device.last_seen
                        ? new Date(device.last_seen).toLocaleDateString()
                        : 'Never'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">System Health</h2>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Total Devices</span>
            <span className="font-semibold text-gray-800">{devices.length}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Device Availability</span>
            <span className="font-semibold text-gray-800">
              {devices.length > 0
                ? `${Math.round((stats.online / devices.length) * 100)}%`
                : 'N/A'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
