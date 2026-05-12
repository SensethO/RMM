import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiClient } from '../hooks/useApi';
import { deviceAPI } from '../api/client';

interface Device {
  id: string;
  device_id: string;
  device_name: string;
  os: string;
  os_version?: string;
  user_id?: string;
  status: string;
  last_seen?: string;
  created_at: string;
}

export default function Devices() {
  const navigate = useNavigate();
  const { isReady } = useApiClient();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    if (!isReady) return;

    fetchDevices();
  }, [isReady, statusFilter]);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const response = await deviceAPI.list({
        status: statusFilter || undefined,
        limit: 200,
      });
      if (response.data.data) {
        setDevices(response.data.data as Device[]);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch devices');
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Filters</h2>
        <div className="flex gap-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
            <option value="error">Error</option>
          </select>
          <button
            onClick={fetchDevices}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Devices List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">
            Devices {loading ? '(Loading...)' : `(${devices.length})`}
          </h2>
        </div>

        {error && (
          <div className="p-6 bg-red-50 border-l-4 border-red-500">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading devices...</div>
        ) : devices.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No devices found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Device Name
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Device ID
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">OS</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">User</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Last Seen
                  </th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {device.device_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                      {device.device_id.substring(0, 12)}...
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {device.os} {device.os_version && `(${device.os_version})`}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{device.user_id || '-'}</td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(
                          device.status
                        )}`}
                      >
                        {device.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {device.last_seen
                        ? new Date(device.last_seen).toLocaleDateString()
                        : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <button
                        onClick={() => navigate(`/devices/${device.id}`)}
                        className="text-blue-600 hover:text-blue-800 font-semibold transition"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
