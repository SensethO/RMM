import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiClient } from '../hooks/useApi';
import { deviceAPI } from '../api/client';

interface Device {
  id: string;
  device_name: string;
  os: string;
  status: string;
  ip_address?: string;
  agent_version?: string;
  last_seen?: string;
  latest_telemetry?: {
    cpu_percent: number;
    ram_percent: number;
    disk_percent: number;
    network_bytes_sec?: number;
    timestamp?: string;
  } | null;
}

function secondsAgo(dateStr?: string): number {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
}

function formatAgo(secs: number): string {
  if (secs === Infinity) return 'jamais';
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  return `${Math.floor(secs / 3600)}h`;
}

function MetricBar({ label, value, warn = 75, crit = 90 }: { label: string; value?: number; warn?: number; crit?: number }) {
  if (value === undefined) return null;
  const color = value >= crit ? 'bg-red-500' : value >= warn ? 'bg-yellow-400' : 'bg-green-500';
  const text  = value >= crit ? 'text-red-600' : value >= warn ? 'text-yellow-600' : 'text-gray-700';
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-500">{label}</span>
        <span className={`font-bold ${text}`}>{value.toFixed(0)}%</span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-2 rounded-full transition-all duration-700 ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function AgentCard({ device, onClick }: { device: Device; onClick: () => void }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const secs = secondsAgo(device.last_seen);
  const tel  = device.latest_telemetry;

  // Statut de fraîcheur de la télémétrie
  const telSecs = tel?.timestamp ? secondsAgo(tel.timestamp) : Infinity;
  const isStale = secs > 120;   // plus de 2 min sans heartbeat
  const isOnline = device.status === 'online' && !isStale;

  const borderColor = isStale
    ? 'border-red-300 bg-red-50'
    : isOnline
      ? 'border-green-200 bg-white'
      : 'border-gray-200 bg-gray-50';

  const pulse = isOnline && secs < 45
    ? <span className="relative flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"/><span className="relative inline-flex h-3 w-3 rounded-full bg-green-500"/></span>
    : isStale
      ? <span className="h-3 w-3 rounded-full bg-red-400 inline-flex"/>
      : <span className="h-3 w-3 rounded-full bg-gray-300 inline-flex"/>;

  return (
    <div
      onClick={onClick}
      className={`border-2 rounded-xl p-4 cursor-pointer hover:shadow-md transition-all ${borderColor}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {pulse}
          <div>
            <p className="font-bold text-gray-900 text-sm leading-tight">{device.device_name}</p>
            <p className="text-xs text-gray-400">{device.os}</p>
          </div>
        </div>
        <div className="text-right">
          {device.agent_version && (
            <span className="text-xs text-gray-400 font-mono">v{device.agent_version}</span>
          )}
        </div>
      </div>

      {/* Métriques */}
      {tel && isOnline ? (
        <div className="space-y-2">
          <MetricBar label="CPU"  value={tel.cpu_percent}  warn={70} crit={90} />
          <MetricBar label="RAM"  value={tel.ram_percent}  warn={80} crit={92} />
          <MetricBar label="Disk" value={tel.disk_percent} warn={80} crit={90} />
          {tel.network_bytes_sec != null && tel.network_bytes_sec > 0 && (
            <p className="text-xs text-gray-400 pt-1">
              Réseau : {(tel.network_bytes_sec / 1024).toFixed(1)} KB/s
            </p>
          )}
        </div>
      ) : (
        <div className="h-16 flex items-center justify-center">
          <p className="text-xs text-gray-400">
            {isStale ? '⚠️ Pas de réponse' : 'Pas de télémétrie'}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between items-center text-xs">
        <span className={`font-medium ${isStale ? 'text-red-500' : isOnline ? 'text-green-600' : 'text-gray-400'}`}>
          {isStale ? `⚠️ Silencieux ${formatAgo(secs)}` : isOnline ? `● En ligne · ${formatAgo(secs)}` : '○ Hors ligne'}
        </span>
        <span className="text-gray-400">{device.ip_address || '—'}</span>
      </div>
    </div>
  );
}

export default function Monitor() {
  const { isReady } = useApiClient();
  const navigate = useNavigate();
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [refreshIn, setRefreshIn] = useState(30);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const res = await deviceAPI.list({ limit: 200 });
      setDevices((res.data.data as Device[]) || []);
      setLastRefresh(new Date());
      setRefreshIn(30);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!isReady) return;
    fetchAll();

    // Auto-refresh toutes les 30s
    timerRef.current = setInterval(fetchAll, 30_000);

    // Compte à rebours
    countRef.current = setInterval(() => {
      setRefreshIn(v => (v <= 1 ? 30 : v - 1));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countRef.current) clearInterval(countRef.current);
    };
  }, [isReady, fetchAll]);

  const online  = devices.filter(d => d.status === 'online' && secondsAgo(d.last_seen) <= 120);
  const stale   = devices.filter(d => d.status === 'online' && secondsAgo(d.last_seen) > 120);
  const offline = devices.filter(d => d.status !== 'online');

  // Alertes CPU/RAM/Disk
  const alerts = devices.filter(d => {
    const t = d.latest_telemetry;
    return t && (t.cpu_percent >= 90 || t.ram_percent >= 90 || t.disk_percent >= 90);
  });

  return (
    <div className="space-y-5">

      {/* Barre de statut */}
      <div className="bg-white rounded-xl shadow px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6 text-sm">
          <span className="flex items-center gap-1.5 text-green-600 font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-green-500 inline-block" />
            {online.length} en ligne
          </span>
          {stale.length > 0 && (
            <span className="flex items-center gap-1.5 text-red-500 font-semibold">
              <span className="h-2.5 w-2.5 rounded-full bg-red-400 inline-block" />
              {stale.length} silencieux
            </span>
          )}
          <span className="flex items-center gap-1.5 text-gray-400">
            <span className="h-2.5 w-2.5 rounded-full bg-gray-300 inline-block" />
            {offline.length} hors ligne
          </span>
          {alerts.length > 0 && (
            <span className="flex items-center gap-1.5 text-orange-500 font-semibold">
              ⚠️ {alerts.length} alerte{alerts.length > 1 ? 's' : ''} métrique
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {lastRefresh && (
            <span className="text-xs text-gray-400">
              Mis à jour {lastRefresh.toLocaleTimeString()} · refresh dans {refreshIn}s
            </span>
          )}
          <button
            onClick={fetchAll}
            className="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition"
          >
            ↻ Actualiser
          </button>
        </div>
      </div>

      {/* Alertes métriques */}
      {alerts.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <p className="font-semibold text-orange-800 mb-2">⚠️ Ressources critiques (&gt;90%)</p>
          <div className="flex flex-wrap gap-2">
            {alerts.map(d => {
              const t = d.latest_telemetry!;
              const metrics = [
                t.cpu_percent  >= 90 && `CPU ${t.cpu_percent.toFixed(0)}%`,
                t.ram_percent  >= 90 && `RAM ${t.ram_percent.toFixed(0)}%`,
                t.disk_percent >= 90 && `Disk ${t.disk_percent.toFixed(0)}%`,
              ].filter(Boolean).join(' · ');
              return (
                <button
                  key={d.id}
                  onClick={() => navigate(`/devices/${d.id}`)}
                  className="text-xs bg-orange-100 hover:bg-orange-200 text-orange-800 px-3 py-1 rounded-full font-medium transition"
                >
                  {d.device_name} — {metrics}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Grille agents */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="border-2 border-gray-100 rounded-xl p-4 animate-pulse h-48 bg-gray-50" />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="text-center py-16 text-gray-400">Aucun device enregistré</div>
      ) : (
        <>
          {/* En ligne */}
          {(online.length > 0 || stale.length > 0) && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                Agents actifs ({online.length + stale.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...online, ...stale].map(d => (
                  <AgentCard key={d.id} device={d} onClick={() => navigate(`/devices/${d.id}`)} />
                ))}
              </div>
            </div>
          )}

          {/* Hors ligne */}
          {offline.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                Hors ligne ({offline.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {offline.map(d => (
                  <AgentCard key={d.id} device={d} onClick={() => navigate(`/devices/${d.id}`)} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
