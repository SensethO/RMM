import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApiClient } from '../hooks/useApi';
import { deviceAPI, commandAPI } from '../api/client';

interface Device {
  id: string;
  device_id: string;
  device_name: string;
  os: string;
  os_version?: string;
  user_id?: string;
  status: string;
  ip_address?: string;
  last_seen?: string;
  created_at: string;
}

interface Telemetry {
  id: string;
  cpu_percent: number;
  ram_percent: number;
  disk_percent: number;
  network_bytes_sec?: number;
  recorded_at: string;
}

interface Command {
  id: string;
  command_type: string;
  status: string;
  output?: string;
  exit_code?: number;
  created_at: string;
}

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.min(100, Math.max(0, value));
  const barColor =
    pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-yellow-500' : `bg-${color}-500`;
  return (
    <div>
      <div className="flex justify-between mb-1 text-sm font-medium text-gray-700">
        <span>{label}</span>
        <span>{pct.toFixed(1)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div className={`${barColor} h-3 rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isReady } = useApiClient();

  const [device, setDevice] = useState<Device | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady || !id) return;
    fetchAll();
  }, [isReady, id]);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [devRes, telRes, cmdRes] = await Promise.all([
        deviceAPI.get(id!),
        deviceAPI.getTelemetry(id!, 20),
        commandAPI.getHistory(id!, 10),
      ]);
      if (devRes.data.data) setDevice(devRes.data.data as unknown as Device);
      if (telRes.data.data) setTelemetry(telRes.data.data as unknown as Telemetry[]);
      if (cmdRes.data.data) setCommands(cmdRes.data.data as unknown as Command[]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load device');
    } finally {
      setLoading(false);
    }
  };

  const statusColor = (s: string) =>
    s === 'online' ? 'bg-green-100 text-green-800' :
    s === 'offline' ? 'bg-gray-100 text-gray-800' :
    'bg-red-100 text-red-800';

  const cmdStatusColor = (s: string) =>
    s === 'completed' ? 'text-green-600' :
    s === 'failed' ? 'text-red-600' :
    s === 'executing' ? 'text-yellow-600' :
    'text-gray-500';

  const latest = telemetry[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !device) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-6 rounded-lg">
        <p className="text-red-800 font-semibold">Error loading device</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
        <button onClick={() => navigate('/devices')} className="mt-4 text-blue-600 hover:underline text-sm">
          ← Back to Devices
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back + header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/devices')}
          className="text-blue-600 hover:text-blue-800 font-semibold text-sm flex items-center gap-1"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{device.device_name}</h1>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColor(device.status)}`}>
          {device.status.toUpperCase()}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Device Info */}
        <div className="bg-white rounded-lg shadow p-6 space-y-3">
          <h2 className="text-lg font-semibold text-gray-800 border-b pb-2">Device Info</h2>
          <InfoRow label="Device ID" value={<span className="font-mono text-xs break-all">{device.device_id}</span>} />
          <InfoRow label="OS" value={`${device.os}${device.os_version ? ` (${device.os_version})` : ''}`} />
          <InfoRow label="IP Address" value={device.ip_address || '—'} />
          <InfoRow label="User" value={device.user_id || '—'} />
          <InfoRow label="Last Seen" value={device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Never'} />
          <InfoRow label="Registered" value={new Date(device.created_at).toLocaleString()} />
          <div className="pt-2">
            <button
              onClick={() => navigate('/commands')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition text-sm"
            >
              ⚙️ Open in Command Center
            </button>
          </div>
        </div>

        {/* Latest Telemetry */}
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex justify-between items-center border-b pb-2">
            <h2 className="text-lg font-semibold text-gray-800">Latest Telemetry</h2>
            {latest && (
              <span className="text-xs text-gray-400">
                {new Date(latest.recorded_at).toLocaleTimeString()}
              </span>
            )}
          </div>
          {latest ? (
            <div className="space-y-4">
              <MetricBar label="CPU" value={latest.cpu_percent} color="blue" />
              <MetricBar label="RAM" value={latest.ram_percent} color="purple" />
              <MetricBar label="Disk" value={latest.disk_percent} color="orange" />
              {latest.network_bytes_sec != null && (
                <div className="text-sm text-gray-600">
                  Network: <span className="font-semibold">{(latest.network_bytes_sec / 1024).toFixed(1)} KB/s</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-400 text-sm">No telemetry data yet</p>
          )}
        </div>
      </div>

      {/* Telemetry history */}
      {telemetry.length > 1 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Telemetry History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Time', 'CPU %', 'RAM %', 'Disk %', 'Network'].map(h => (
                    <th key={h} className="px-4 py-2 text-left font-semibold text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {telemetry.map((t) => (
                  <tr key={t.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500">{new Date(t.recorded_at).toLocaleTimeString()}</td>
                    <td className="px-4 py-2">
                      <span className={t.cpu_percent >= 80 ? 'text-red-600 font-semibold' : ''}>
                        {t.cpu_percent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={t.ram_percent >= 80 ? 'text-red-600 font-semibold' : ''}>
                        {t.ram_percent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={t.disk_percent >= 80 ? 'text-red-600 font-semibold' : ''}>
                        {t.disk_percent.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {t.network_bytes_sec != null ? `${(t.network_bytes_sec / 1024).toFixed(1)} KB/s` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Commands */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Recent Commands</h2>
        {commands.length === 0 ? (
          <p className="text-gray-400 text-sm">No commands sent yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Time', 'Command', 'Status', 'Exit Code', 'Output'].map(h => (
                    <th key={h} className="px-4 py-2 text-left font-semibold text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {commands.map((cmd) => (
                  <tr key={cmd.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500">{new Date(cmd.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2 font-mono text-blue-700">{cmd.command_type}</td>
                    <td className={`px-4 py-2 font-semibold ${cmdStatusColor(cmd.status)}`}>
                      {cmd.status.toUpperCase()}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{cmd.exit_code ?? '—'}</td>
                    <td className="px-4 py-2 text-gray-600 max-w-xs truncate">
                      {cmd.output ? cmd.output.slice(0, 80) : '—'}
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

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start text-sm">
      <span className="text-gray-500 w-28 shrink-0">{label}</span>
      <span className="text-gray-900 text-right">{value}</span>
    </div>
  );
}
