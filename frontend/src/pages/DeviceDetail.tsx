import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApiClient } from '../hooks/useApi';
import { deviceAPI, commandAPI } from '../api/client';
import { useSystemInfo, isAgentOutdated } from '../hooks/useSystemInfo';

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
  agent_version?: string;
}

interface Telemetry {
  id: string;
  cpu_percent: number;
  ram_percent: number;
  disk_percent: number;
  network_bytes_sec?: number;
  timestamp: string;
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

  const { info: sysInfo } = useSystemInfo();
  const [device, setDevice] = useState<Device | null>(null);
  const [updatingAgent, setUpdatingAgent] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);
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

      {/* Alerte version agent */}
      {isAgentOutdated(device.agent_version, sysInfo?.agent_version) && (
        <div className="bg-orange-50 border border-orange-300 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="font-semibold text-orange-800">
                Agent en retard — v{device.agent_version} → v{sysInfo?.agent_version} disponible
              </p>
              <p className="text-sm text-orange-600">
                Cliquez sur "Mettre à jour" pour envoyer la commande <code className="bg-orange-100 px-1 rounded">self_update</code> à ce device.
              </p>
            </div>
          </div>
          <button
            disabled={updatingAgent}
            onClick={async () => {
              setUpdatingAgent(true);
              setUpdateMsg(null);
              try {
                await commandAPI.queue(id!, { command_type: 'self_update' });
                setUpdateMsg('✅ Commande envoyée — l\'agent va redémarrer');
              } catch {
                setUpdateMsg('❌ Erreur lors de l\'envoi');
              } finally {
                setUpdatingAgent(false);
              }
            }}
            className="ml-4 shrink-0 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition text-sm disabled:opacity-50"
          >
            {updatingAgent ? '...' : '↑ Mettre à jour'}
          </button>
        </div>
      )}
      {updateMsg && (
        <div className="bg-green-50 border border-green-300 rounded-lg px-4 py-3 text-green-800 text-sm">{updateMsg}</div>
      )}

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
          <InfoRow
            label="Agent"
            value={
              device.agent_version
                ? <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 font-mono text-xs px-2 py-1 rounded-full">v{device.agent_version}</span>
                : <span className="text-gray-400 text-xs">Non reporté</span>
            }
          />
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
                {new Date(latest.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
                    <td className="px-4 py-2 text-gray-500 text-xs">{new Date(t.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
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

      {/* Network */}
      <NetworkSection deviceId={id!} />

      {/* Security - ADWCleaner */}
      <SecuritySection deviceId={id!} />

      {/* Installed Apps */}
      <InstalledAppsSection deviceId={id!} />

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

// ─── Security / ADWCleaner section ───────────────────────────────────────────
interface AdwThreat {
  type: string;
  category: string;
  path: string;
  status: string;
}
interface AdwScanResult {
  scan_date: string;
  version: string;
  database: string;
  threats_count: number;
  clean: boolean;
  threats: AdwThreat[];
  log_path?: string;
}
interface AdwCleanResult {
  action: string;
  date: string;
  quarantined: number;
  message: string;
}

function SecuritySection({ deviceId }: { deviceId: string }) {
  const [scanResult, setScanResult]     = useState<AdwScanResult | null>(null);
  const [loading, setLoading]           = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError]               = useState<string | null>(null);
  const [message, setMessage]           = useState<string | null>(null);
  const [confirmed, setConfirmed]       = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadLastScan();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [deviceId]);

  async function loadLastScan() {
    try {
      const hist = await commandAPI.getHistory(deviceId, 50);
      const cmds = (hist.data.data as Record<string, unknown>[]) || [];
      const recent = cmds.find(c => c.command_type === 'adwcleaner_scan' && c.status === 'success');
      if (recent?.output) {
        try { setScanResult(JSON.parse(recent.output as string) as AdwScanResult); } catch {}
      }
    } catch {}
  }

  function pollCmd(
    cmdId: string,
    onSuccess: (output: string) => void,
    onError: (msg: string) => void,
  ) {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      if (++attempts > 60) { // 3 min max
        clearInterval(pollRef.current!);
        onError("Timeout — l'agent ne répond pas");
        return;
      }
      try {
        const hist = await commandAPI.getHistory(deviceId, 10);
        const cmd = (hist.data.data as Record<string, unknown>[])?.find(c => c.id === cmdId);
        if (cmd?.status === 'success' && cmd.output) {
          clearInterval(pollRef.current!);
          onSuccess(cmd.output as string);
        } else if (cmd?.status === 'failed') {
          clearInterval(pollRef.current!);
          onError((cmd.output as string) || 'Commande échouée');
        }
      } catch {}
    }, 3000);
  }

  async function runScan() {
    setLoading(true); setError(null); setMessage(null);
    try {
      const res = await commandAPI.queue(deviceId, { command_type: 'adwcleaner_scan' });
      const cmdId = (res.data.data as Record<string, unknown>).id as string;
      pollCmd(cmdId,
        (out) => {
          try { setScanResult(JSON.parse(out) as AdwScanResult); } catch {}
          setLoading(false);
        },
        (err) => { setError(err); setLoading(false); }
      );
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); setLoading(false); }
  }

  async function runClean() {
    setActionLoading('clean'); setError(null); setMessage(null);
    try {
      const res = await commandAPI.queue(deviceId, { command_type: 'adwcleaner_clean' });
      const cmdId = (res.data.data as Record<string, unknown>).id as string;
      pollCmd(cmdId,
        (out) => {
          try {
            const r = JSON.parse(out) as AdwCleanResult;
            setMessage(r.message || `✅ ${r.quarantined} élément(s) mis en quarantaine.`);
          } catch { setMessage('✅ Quarantaine effectuée.'); }
          setActionLoading(null);
          loadLastScan();
        },
        (err) => { setError(err); setActionLoading(null); }
      );
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); setActionLoading(null); }
  }

  async function runPurge() {
    setActionLoading('purge'); setError(null); setMessage(null); setConfirmed(false);
    try {
      const res = await commandAPI.queue(deviceId, { command_type: 'adwcleaner_purge' });
      const cmdId = (res.data.data as Record<string, unknown>).id as string;
      pollCmd(cmdId,
        () => { setMessage('✅ Quarantaine vidée définitivement.'); setActionLoading(null); },
        (err) => { setError(err); setActionLoading(null); }
      );
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); setActionLoading(null); }
  }

  function threatColor(type: string): string {
    if (/PUP|Optional/i.test(type))     return 'bg-yellow-50 text-yellow-800 border-yellow-200';
    if (/Adware/i.test(type))           return 'bg-orange-50 text-orange-800 border-orange-200';
    if (/Malware|Trojan|Virus/i.test(type)) return 'bg-red-50 text-red-800 border-red-200';
    return 'bg-gray-50 text-gray-700 border-gray-200';
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-800">🛡️ ADWCleaner — Analyse sécurité</h2>
        <button
          onClick={runScan}
          disabled={loading || !!actionLoading}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
        >
          {loading ? '⏳ Scan en cours...' : '🔍 Lancer un scan'}
        </button>
      </div>

      {/* Scan progress */}
      {loading && (
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <div className="animate-spin h-4 w-4 border-2 border-red-500 border-t-transparent rounded-full" />
            Analyse en cours sur l'agent distant... (1–2 minutes)
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div className="h-2 bg-red-500 rounded-full animate-pulse" style={{ width: '40%' }} />
          </div>
        </div>
      )}

      {/* Action progress */}
      {actionLoading && (
        <div className="mb-3 flex items-center gap-2 text-gray-500 text-sm">
          <div className="animate-spin h-4 w-4 border-2 border-orange-500 border-t-transparent rounded-full" />
          {actionLoading === 'clean' ? 'Mise en quarantaine en cours...' : 'Purge en cours...'}
        </div>
      )}

      {error   && <p className="text-red-500   text-sm mb-3">{error}</p>}
      {message && <p className="text-green-600 text-sm mb-3 font-medium">{message}</p>}

      {/* Scan results */}
      {scanResult && (
        <div className="space-y-4">
          {/* Summary badge */}
          <div className="flex flex-wrap items-center gap-3">
            <span className={`px-4 py-2 rounded-lg font-semibold text-sm ${
              scanResult.clean
                ? 'bg-green-100 text-green-800'
                : 'bg-red-100 text-red-800'
            }`}>
              {scanResult.clean ? '✅ Système propre' : `⚠️ ${scanResult.threats_count} menace(s) détectée(s)`}
            </span>
            <span className="text-xs text-gray-400">
              Scanné le {new Date(scanResult.scan_date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              {scanResult.version !== 'unknown' ? ` · ADWCleaner v${scanResult.version}` : ''}
            </span>
          </div>

          {/* Action buttons */}
          {!scanResult.clean && (
            <div className="flex flex-wrap gap-3">
              {/* Quarantine */}
              <button
                onClick={runClean}
                disabled={loading || !!actionLoading}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
              >
                🔒 Mettre en quarantaine ({scanResult.threats_count})
              </button>

              {/* Ignore */}
              <button
                onClick={() => setMessage('ℹ️ Menaces laissées en place. Aucune action effectuée.')}
                disabled={loading || !!actionLoading}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm font-semibold rounded-lg transition disabled:opacity-50"
              >
                🚫 Ignorer / Laisser en place
              </button>

              {/* Purge — confirmation inline */}
              {!confirmed ? (
                <button
                  onClick={() => setConfirmed(true)}
                  disabled={loading || !!actionLoading}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
                >
                  🗑️ Supprimer définitivement
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-red-50 border border-red-300 rounded-lg px-3 py-2">
                  <span className="text-red-700 text-xs font-semibold">⚠️ Irréversible — confirmer ?</span>
                  <button onClick={runPurge} className="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded hover:bg-red-700">Oui, supprimer</button>
                  <button onClick={() => setConfirmed(false)} className="px-3 py-1 bg-gray-200 text-gray-700 text-xs font-bold rounded hover:bg-gray-300">Annuler</button>
                </div>
              )}
            </div>
          )}

          {/* Threats table */}
          {scanResult.threats.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200" style={{ maxHeight: '320px', overflowY: 'auto' }}>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Type</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Catégorie</th>
                    <th className="px-4 py-2 text-left font-semibold text-gray-600">Chemin / Clé</th>
                  </tr>
                </thead>
                <tbody>
                  {scanResult.threats.map((t, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className={`text-xs font-mono font-semibold px-2 py-1 rounded border ${threatColor(t.type)}`}>{t.type}</span>
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">{t.category}</td>
                      <td className="px-4 py-2 text-gray-700 text-xs font-mono break-all max-w-xs">{t.path}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Purge button when clean */}
          {scanResult.clean && (
            <div className="flex items-center gap-3">
              {!confirmed ? (
                <button
                  onClick={() => setConfirmed(true)}
                  disabled={!!actionLoading}
                  className="text-xs text-gray-400 hover:text-red-500 underline"
                >
                  Vider la quarantaine existante
                </button>
              ) : (
                <div className="flex items-center gap-2 bg-red-50 border border-red-300 rounded-lg px-3 py-2">
                  <span className="text-red-700 text-xs font-semibold">⚠️ Supprimer la quarantaine ?</span>
                  <button onClick={runPurge} className="px-3 py-1 bg-red-600 text-white text-xs font-bold rounded hover:bg-red-700">Oui</button>
                  <button onClick={() => setConfirmed(false)} className="px-3 py-1 bg-gray-200 text-gray-700 text-xs font-bold rounded hover:bg-gray-300">Non</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!scanResult && !loading && (
        <p className="text-gray-400 text-sm">
          Cliquez sur "Lancer un scan" pour analyser ce device avec ADWCleaner.<br />
          <span className="text-xs">ADWCleaner doit être installé sur le device (Déploiements → Sécurité → ADWCleaner).</span>
        </p>
      )}
    </div>
  );
}

// ─── Installed Apps section ───────────────────────────────────────────────────
interface InstalledApp {
  name: string;
  version?: string;
  publisher?: string;
  install_date?: string;
}

function InstalledAppsSection({ deviceId }: { deviceId: string }) {
  const [apps, setApps]             = useState<InstalledApp[] | null>(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [search, setSearch]         = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadApps();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [deviceId]);

  async function loadApps() {
    try {
      const hist = await commandAPI.getHistory(deviceId, 50);
      const cmds = (hist.data.data as Record<string, unknown>[]) || [];
      const recent = cmds.find(c => c.command_type === 'list_installed_apps' && c.status === 'success');
      if (recent?.output) {
        try {
          // The output may be truncated by DB — extract valid JSON array
          let raw = (recent.output as string).trim();
          if (raw.startsWith('[')) {
            // Try full parse; if it fails try to truncate at last complete object
            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                setApps(parsed as InstalledApp[]);
                setLastScanned(recent.created_at as string);
              }
            } catch {
              // Truncated JSON — find last '}' and close the array
              const lastBrace = raw.lastIndexOf('}');
              if (lastBrace > 0) {
                const repaired = raw.slice(0, lastBrace + 1) + ']';
                const parsed = JSON.parse(repaired);
                if (Array.isArray(parsed)) {
                  setApps(parsed as InstalledApp[]);
                  setLastScanned(recent.created_at as string);
                }
              }
            }
          }
        } catch {}
      }
    } catch {}
  }

  async function runScan() {
    setLoading(true);
    setError(null);
    try {
      const res = await commandAPI.queue(deviceId, { command_type: 'list_installed_apps' });
      const cmdId = (res.data.data as Record<string, unknown>).id as string;
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        if (attempts > 20) {
          clearInterval(pollRef.current!);
          setError("Timeout — l'agent ne répond pas");
          setLoading(false);
          return;
        }
        try {
          const hist = await commandAPI.getHistory(deviceId, 10);
          const cmd = (hist.data.data as Record<string, unknown>[])?.find(c => c.id === cmdId);
          if (cmd?.status === 'success' && cmd.output) {
            clearInterval(pollRef.current!);
            try {
              let raw = (cmd.output as string).trim();
              let parsed: InstalledApp[] = [];
              try { parsed = JSON.parse(raw); } catch {
                const lastBrace = raw.lastIndexOf('}');
                if (lastBrace > 0) parsed = JSON.parse(raw.slice(0, lastBrace + 1) + ']');
              }
              setApps(Array.isArray(parsed) ? parsed : []);
              setLastScanned(cmd.created_at as string);
            } catch { setApps([]); }
            setLoading(false);
          } else if (cmd?.status === 'failed') {
            clearInterval(pollRef.current!);
            setError((cmd.output as string) || 'Échec du scan');
            setLoading(false);
          }
        } catch {}
      }, 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setLoading(false);
    }
  }

  const filtered = apps
    ? apps.filter(a =>
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        (a.publisher || '').toLowerCase().includes(search.toLowerCase())
      )
    : [];

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between border-b pb-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-800">📦 Applications installées</h2>
        <button
          onClick={runScan}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
        >
          {loading ? '⏳ Scan en cours...' : '🔍 Scanner'}
        </button>
      </div>

      {loading && !apps && (
        <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
          <div className="animate-spin h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full" />
          Analyse du registre Windows...
        </div>
      )}
      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}

      {apps && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span><strong>{apps.length}</strong> application{apps.length > 1 ? 's' : ''} trouvée{apps.length > 1 ? 's' : ''}</span>
            {lastScanned && (
              <span>Scanné le {new Date(lastScanned).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </div>
          <input
            type="text"
            placeholder="🔎 Rechercher une application ou un éditeur..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <div className="overflow-x-auto rounded-lg border border-gray-200" style={{ maxHeight: '360px', overflowY: 'auto' }}>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Nom</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Version</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600">Éditeur</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((app, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800">{app.name}</td>
                    <td className="px-4 py-2 font-mono text-gray-600 text-xs">{app.version || '—'}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{app.publisher || '—'}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-gray-400">Aucun résultat</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!apps && !loading && !error && (
        <p className="text-gray-400 text-sm">Cliquez sur "Scanner" pour inventorier les applications installées sur ce device.</p>
      )}
    </div>
  );
}

// ─── Network section ──────────────────────────────────────────────────────────
interface NetworkInfo {
  public_ip: string;
  local_ip: string;
  hostname: string;
  adapters: { name: string; family: string; address: string; mac: string }[];
  gateways: string[];
  dns_servers: string[];
  timestamp: string;
}

interface BandwidthResult {
  timestamp: string;
  download_mbps: number;
  upload_mbps: number | null;
  details: { test: string; download_mbps?: number; elapsed_s?: number; received_mb?: number; error?: string }[];
}

function NetworkSection({ deviceId }: { deviceId: string }) {
  const [netInfo, setNetInfo]             = useState<NetworkInfo | null>(null);
  const [netLoading, setNetLoading]       = useState(false);
  const [netError, setNetError]           = useState<string | null>(null);
  const [bwResult, setBwResult]           = useState<BandwidthResult | null>(null);
  const [bwLoading, setBwLoading]         = useState(false);
  const [bwError, setBwError]             = useState<string | null>(null);
  const netPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const bwPollRef  = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadNetworkInfo();
    return () => {
      if (netPollRef.current) clearInterval(netPollRef.current);
      if (bwPollRef.current)  clearInterval(bwPollRef.current);
    };
  }, [deviceId]);

  async function loadNetworkInfo() {
    // Use recent result from history if < 5 min old
    try {
      const hist = await commandAPI.getHistory(deviceId, 30);
      const cmds = (hist.data.data as Record<string, unknown>[]) || [];
      const recent = cmds.find(
        c => c.command_type === 'get_network_info' &&
             c.status === 'success' &&
             new Date(c.created_at as string).getTime() > Date.now() - 5 * 60 * 1000
      );
      if (recent?.output) {
        setNetInfo(JSON.parse(recent.output as string) as NetworkInfo);
        return;
      }
    } catch {}
    runNetworkInfo();
  }

  async function runNetworkInfo() {
    setNetLoading(true);
    setNetError(null);
    try {
      const res = await commandAPI.queue(deviceId, { command_type: 'get_network_info' });
      const cmdId = (res.data.data as Record<string, unknown>).id as string;
      pollCommand(cmdId, netPollRef, (output) => {
        setNetInfo(JSON.parse(output) as NetworkInfo);
        setNetLoading(false);
      }, (err) => { setNetError(err); setNetLoading(false); });
    } catch (e) {
      setNetError(e instanceof Error ? e.message : 'Erreur');
      setNetLoading(false);
    }
  }

  async function runBandwidthTest() {
    setBwLoading(true);
    setBwError(null);
    setBwResult(null);
    try {
      const res = await commandAPI.queue(deviceId, { command_type: 'bandwidth_test' });
      const cmdId = (res.data.data as Record<string, unknown>).id as string;
      pollCommand(cmdId, bwPollRef, (output) => {
        setBwResult(JSON.parse(output) as BandwidthResult);
        setBwLoading(false);
      }, (err) => { setBwError(err); setBwLoading(false); });
    } catch (e) {
      setBwError(e instanceof Error ? e.message : 'Erreur');
      setBwLoading(false);
    }
  }

  function pollCommand(
    cmdId: string,
    ref: React.MutableRefObject<ReturnType<typeof setInterval> | null>,
    onSuccess: (output: string) => void,
    onError: (err: string) => void,
  ) {
    let attempts = 0;
    ref.current = setInterval(async () => {
      attempts++;
      if (attempts > 40) {
        clearInterval(ref.current!);
        onError('Timeout — l\'agent ne répond pas');
        return;
      }
      try {
        const hist = await commandAPI.getHistory(deviceId, 20);
        const cmd = (hist.data.data as Record<string, unknown>[])?.find(c => c.id === cmdId);
        if (cmd?.status === 'success' && cmd.output) {
          clearInterval(ref.current!);
          onSuccess(cmd.output as string);
        } else if (cmd?.status === 'failed') {
          clearInterval(ref.current!);
          onError(cmd.output as string || 'Commande échouée');
        }
      } catch {}
    }, 3000);
  }

  const speedColor = (mbps: number) =>
    mbps >= 100 ? 'text-green-600' : mbps >= 20 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="space-y-6">
      {/* Network Environment */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-800">🌐 Environnement réseau</h2>
          <button
            onClick={runNetworkInfo}
            disabled={netLoading}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50"
          >
            {netLoading ? '⏳ Actualisation...' : '↻ Actualiser'}
          </button>
        </div>

        {netLoading && !netInfo && (
          <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
            Interrogation de l'agent...
          </div>
        )}
        {netError && <p className="text-red-500 text-sm">{netError}</p>}

        {netInfo && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* IPs */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Adresses IP</h3>
              <div className="bg-blue-50 rounded-lg p-3 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">IP Publique</span>
                  <span className="font-mono font-bold text-blue-700">{netInfo.public_ip}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">IP Locale</span>
                  <span className="font-mono text-gray-800">{netInfo.local_ip}</span>
                </div>
                {netInfo.gateways.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Passerelle</span>
                    <span className="font-mono text-gray-800">{netInfo.gateways[0]}</span>
                  </div>
                )}
              </div>

              {netInfo.dns_servers.length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mt-3">Serveurs DNS</h3>
                  <div className="space-y-1">
                    {netInfo.dns_servers.map(dns => (
                      <span key={dns} className="inline-block bg-gray-100 text-gray-700 font-mono text-xs px-2 py-1 rounded mr-1">{dns}</span>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Adapters */}
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Adaptateurs réseau</h3>
              <div className="space-y-2">
                {netInfo.adapters.filter(a => a.family === 'IPv4').map((a, i) => (
                  <div key={i} className="bg-gray-50 rounded p-2 text-xs">
                    <div className="font-semibold text-gray-700 truncate">{a.name}</div>
                    <div className="font-mono text-gray-600">{a.address}</div>
                    <div className="text-gray-400">{a.mac}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {netInfo && (
          <p className="text-xs text-gray-400 mt-3">
            Mis à jour {new Date(netInfo.timestamp).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Bandwidth Test */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-800">⚡ Test de bande passante</h2>
          <button
            onClick={runBandwidthTest}
            disabled={bwLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50"
          >
            {bwLoading ? '⏳ Test en cours (~30s)...' : '▶ Lancer le test'}
          </button>
        </div>

        {bwLoading && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              Test en cours sur l'agent distant... (5 MB + 20 MB + upload)
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
              <div className="h-2 bg-blue-500 rounded-full animate-pulse" style={{ width: '60%' }} />
            </div>
          </div>
        )}
        {bwError && <p className="text-red-500 text-sm">{bwError}</p>}

        {bwResult && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 rounded-lg p-4 text-center">
                <div className={`text-3xl font-bold ${speedColor(bwResult.download_mbps)}`}>
                  {bwResult.download_mbps}
                </div>
                <div className="text-sm text-gray-600 mt-1">Mbps ↓ Download</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 text-center">
                <div className={`text-3xl font-bold ${bwResult.upload_mbps ? speedColor(bwResult.upload_mbps) : 'text-gray-400'}`}>
                  {bwResult.upload_mbps ?? '—'}
                </div>
                <div className="text-sm text-gray-600 mt-1">Mbps ↑ Upload</div>
              </div>
            </div>
            {/* Details */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Test', 'Download (Mbps)', 'Durée', 'Données reçues'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bwResult.details.map((d, i) => (
                    <tr key={i} className="border-b">
                      <td className="px-3 py-2 font-medium">{d.test}</td>
                      <td className={`px-3 py-2 font-mono font-bold ${d.download_mbps ? speedColor(d.download_mbps) : 'text-red-500'}`}>
                        {d.download_mbps ?? d.error ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{d.elapsed_s ? `${d.elapsed_s}s` : '—'}</td>
                      <td className="px-3 py-2 text-gray-600">{d.received_mb ? `${d.received_mb} MB` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400">Test effectué le {new Date(bwResult.timestamp).toLocaleString()}</p>
          </div>
        )}
        {!bwResult && !bwLoading && !bwError && (
          <p className="text-gray-400 text-sm">Cliquez sur "Lancer le test" pour mesurer la bande passante depuis le device.</p>
        )}
      </div>
    </div>
  );
}
