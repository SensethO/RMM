import { useEffect, useState } from 'react';
import { useApiClient } from '../hooks/useApi';
import { alertAPI } from '../api/client';

interface Alert {
  id: string;
  alert_type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  acknowledged: boolean;
  created_at: string;
  device_id?: string;
}

export default function Alerts() {
  const { isReady } = useApiClient();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady) return;
    fetchAlerts();
  }, [isReady]);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const response = await alertAPI.list(100);
      if (response.data.data) {
        setAlerts(response.data.data as Alert[]);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch alerts');
    } finally {
      setLoading(false);
    }
  };

  const acknowledge = async (alertId: string) => {
    try {
      await alertAPI.acknowledge(alertId);
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, acknowledged: true } : a));
    } catch (err) {
      console.error('Failed to acknowledge alert:', err);
    }
  };

  const getSeverityStyle = (severity: string) => {
    switch (severity) {
      case 'critical': return { bg: 'bg-red-50 border-red-200', badge: 'bg-red-100 text-red-800', dot: '🔴' };
      case 'warning':  return { bg: 'bg-yellow-50 border-yellow-200', badge: 'bg-yellow-100 text-yellow-800', dot: '🟡' };
      default:         return { bg: 'bg-blue-50 border-blue-200', badge: 'bg-blue-100 text-blue-800', dot: '🔵' };
    }
  };

  const warning  = alerts.filter(a => a.severity === 'warning'  && !a.acknowledged).length;
  const critical = alerts.filter(a => a.severity === 'critical' && !a.acknowledged).length;
  const info     = alerts.filter(a => a.severity === 'info'     && !a.acknowledged).length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-yellow-50 rounded-lg p-6 border border-yellow-200">
          <div className="text-3xl font-bold text-yellow-600">{warning}</div>
          <div className="text-gray-600 mt-2">Warning</div>
        </div>
        <div className="bg-red-50 rounded-lg p-6 border border-red-200">
          <div className="text-3xl font-bold text-red-600">{critical}</div>
          <div className="text-gray-600 mt-2">Critical</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
          <div className="text-3xl font-bold text-blue-600">{info}</div>
          <div className="text-gray-600 mt-2">Info</div>
        </div>
      </div>

      {/* Alerts List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-800">
            Alerts {loading ? '(Loading...)' : `(${alerts.length})`}
          </h2>
          <button
            onClick={fetchAlerts}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-semibold"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="p-6 bg-red-50 border-l-4 border-red-500">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="p-6 text-center text-gray-500">Loading alerts...</div>
        ) : alerts.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No alerts found</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {alerts.map((alert) => {
              const style = getSeverityStyle(alert.severity);
              return (
                <div
                  key={alert.id}
                  className={`p-4 border-l-4 ${style.bg} ${alert.acknowledged ? 'opacity-60' : ''}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${style.badge}`}>
                          {style.dot} {alert.severity.toUpperCase()}
                        </span>
                        <span className="text-xs text-gray-500 font-mono">{alert.alert_type}</span>
                        {alert.acknowledged && (
                          <span className="text-xs text-green-600 font-semibold">✓ Acknowledged</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-800">{alert.message}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(alert.created_at).toLocaleString()}
                      </p>
                    </div>
                    {!alert.acknowledged && (
                      <button
                        onClick={() => acknowledge(alert.id)}
                        className="ml-4 px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50 transition text-gray-700"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
