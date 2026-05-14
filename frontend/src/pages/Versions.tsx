import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiClient } from '../hooks/useApi';
import { deviceAPI, commandAPI } from '../api/client';
import { useSystemInfo, isAgentOutdated } from '../hooks/useSystemInfo';
import { APP_VERSION } from '../version';

interface Device {
  id: string;
  device_name: string;
  os: string;
  status: string;
  agent_version?: string;
  last_seen?: string;
}

export default function Versions() {
  const { isReady } = useApiClient();
  const { info: sysInfo, loading: sysLoading } = useSystemInfo();
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  const [updateStatus, setUpdateStatus] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isReady) return;
    deviceAPI.list({ limit: 200 }).then(r => {
      setDevices((r.data.data as Device[]) || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [isReady]);

  async function sendUpdate(device: Device) {
    setUpdating(u => ({ ...u, [device.id]: true }));
    setUpdateStatus(s => ({ ...s, [device.id]: 'Envoi de la commande...' }));
    try {
      await commandAPI.queue(device.id, { command_type: 'self_update' });
      setUpdateStatus(s => ({ ...s, [device.id]: '✅ Commande envoyée — redémarrage en cours' }));
    } catch {
      setUpdateStatus(s => ({ ...s, [device.id]: '❌ Erreur lors de l\'envoi' }));
    } finally {
      setUpdating(u => ({ ...u, [device.id]: false }));
    }
  }

  async function updateAll() {
    const outdated = devices.filter(d => isAgentOutdated(d.agent_version, sysInfo?.agent_version));
    for (const d of outdated) await sendUpdate(d);
  }

  const outdatedCount = devices.filter(d => isAgentOutdated(d.agent_version, sysInfo?.agent_version)).length;
  const unknownCount  = devices.filter(d => !d.agent_version).length;
  const upToDateCount = devices.length - outdatedCount - unknownCount;

  return (
    <div className="space-y-6">

      {/* System versions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Application web</p>
          <p className="text-3xl font-bold text-blue-600">v{APP_VERSION}</p>
          <p className="text-xs text-gray-400 mt-1">{sysInfo?.build_date || '—'}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Version agent attendue</p>
          <p className="text-3xl font-bold text-green-600">
            {sysLoading ? '...' : `v${sysInfo?.agent_version || '?'}`}
          </p>
          <p className="text-xs text-gray-400 mt-1">Dernière version déployée</p>
        </div>
        <div className={`rounded-lg shadow p-5 ${outdatedCount > 0 ? 'bg-orange-50 border border-orange-200' : 'bg-green-50 border border-green-200'}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Statut parc</p>
          <p className={`text-3xl font-bold ${outdatedCount > 0 ? 'text-orange-600' : 'text-green-600'}`}>
            {loading ? '...' : outdatedCount > 0 ? `${outdatedCount} en retard` : '✓ Tout à jour'}
          </p>
          <p className="text-xs text-gray-400 mt-1">{upToDateCount} à jour · {unknownCount} non reporté</p>
        </div>
      </div>

      {/* Alert banner */}
      {outdatedCount > 0 && (
        <div className="bg-orange-50 border border-orange-300 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-semibold text-orange-800">
                {outdatedCount} agent{outdatedCount > 1 ? 's' : ''} en retard sur la version {sysInfo?.agent_version}
              </p>
              <p className="text-sm text-orange-600">
                La commande <code className="bg-orange-100 px-1 rounded">self_update</code> sera envoyée à chaque device concerné.
              </p>
            </div>
          </div>
          <button
            onClick={updateAll}
            className="ml-4 shrink-0 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition text-sm"
          >
            Tout mettre à jour
          </button>
        </div>
      )}

      {/* Devices table */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">
            Versions par device {loading ? '' : `(${devices.length})`}
          </h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Chargement...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Device', 'OS', 'Statut', 'Version agent', 'Alignement', 'Action'].map(h => (
                    <th key={h} className="px-5 py-3 text-left font-semibold text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devices.map(device => {
                  const outdated = isAgentOutdated(device.agent_version, sysInfo?.agent_version);
                  const unknown  = !device.agent_version;
                  return (
                    <tr key={device.id} className={`border-b hover:bg-gray-50 ${outdated ? 'bg-orange-50/40' : ''}`}>
                      <td className="px-5 py-3 font-medium text-gray-900">
                        <button onClick={() => navigate(`/devices/${device.id}`)} className="hover:text-blue-600 transition">
                          {device.device_name}
                        </button>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{device.os}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          device.status === 'online' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {device.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono">
                        {device.agent_version
                          ? <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">v{device.agent_version}</span>
                          : <span className="text-gray-300 text-xs">Non reporté</span>
                        }
                      </td>
                      <td className="px-5 py-3">
                        {unknown ? (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <span>⬜</span> Inconnu
                          </span>
                        ) : outdated ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
                            ⚠️ En retard → v{sysInfo?.agent_version}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-100 px-2 py-1 rounded-full">
                            ✓ À jour
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {outdated ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => sendUpdate(device)}
                              disabled={updating[device.id]}
                              className="text-xs px-3 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded font-semibold disabled:opacity-50 transition"
                            >
                              {updating[device.id] ? '...' : '↑ Mettre à jour'}
                            </button>
                            {updateStatus[device.id] && (
                              <span className="text-xs text-gray-500">{updateStatus[device.id]}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
