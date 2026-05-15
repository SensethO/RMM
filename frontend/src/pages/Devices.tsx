import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiClient } from '../hooks/useApi';
import { deviceAPI, orgAPI } from '../api/client';
import { useSystemInfo, isAgentOutdated } from '../hooks/useSystemInfo';

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
  agent_version?: string;
  organization_id?: string | null;
  site_id?: string | null;
  department_id?: string | null;
}
interface OrgItem { id: string; name: string; }
interface SiteItem { id: string; name: string; organization_id: string | null; }

export default function Devices() {
  const navigate = useNavigate();
  const { isReady } = useApiClient();
  const { info: sysInfo } = useSystemInfo();
  const [devices, setDevices]     = useState<Device[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error,   setError]       = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [orgFilter,    setOrgFilter]    = useState('');
  const [siteFilter,   setSiteFilter]   = useState('');
  const [search,       setSearch]       = useState('');
  const [orgs,  setOrgs]  = useState<OrgItem[]>([]);
  const [sites, setSites] = useState<SiteItem[]>([]);

  useEffect(() => {
    if (!isReady) return;
    fetchDevices();
    orgAPI.listOrgs().then(r => setOrgs((r.data.data || []) as OrgItem[])).catch(() => {});
    orgAPI.listSites().then(r => setSites((r.data.data || []) as SiteItem[])).catch(() => {});
  }, [isReady]);

  useEffect(() => { if (isReady) fetchDevices(); }, [statusFilter]);

  const fetchDevices = async () => {
    try {
      setLoading(true);
      const response = await deviceAPI.list({ status: statusFilter || undefined, limit: 500 });
      if (response.data.data) { setDevices(response.data.data as Device[]); setError(null); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch devices');
    } finally { setLoading(false); }
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

  // Client-side filtering
  const filteredDevices = devices.filter(d => {
    if (orgFilter  && d.organization_id !== orgFilter)  return false;
    if (siteFilter && d.site_id         !== siteFilter)  return false;
    if (search && !d.device_name.toLowerCase().includes(search.toLowerCase()) &&
        !(d.user_id || '').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const orgName  = (id: string | null | undefined) => id ? (orgs.find(o => o.id === id)?.name || '—') : '—';
  const siteName = (id: string | null | undefined) => id ? (sites.find(s => s.id === id)?.name || '—') : '—';

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-3 items-center">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Rechercher..."
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48" />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tous les statuts</option>
            <option value="online">🟢 En ligne</option>
            <option value="offline">⚫ Hors ligne</option>
            <option value="error">🔴 Erreur</option>
          </select>
          {orgs.length > 0 && (
            <select value={orgFilter} onChange={e => { setOrgFilter(e.target.value); setSiteFilter(''); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">🏢 Toutes les entreprises</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
          {sites.filter(s => !orgFilter || s.organization_id === orgFilter).length > 0 && (
            <select value={siteFilter} onChange={e => setSiteFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">📍 Tous les sites</option>
              {sites.filter(s => !orgFilter || s.organization_id === orgFilter).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <button onClick={fetchDevices} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-semibold">
            🔄 Rafraîchir
          </button>
          {(orgFilter || siteFilter || search || statusFilter) && (
            <button onClick={() => { setOrgFilter(''); setSiteFilter(''); setSearch(''); setStatusFilter(''); }}
              className="text-xs text-gray-400 hover:text-gray-600">✕ Effacer</button>
          )}
        </div>
      </div>

      {/* Devices List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-800">
            Appareils {loading ? '(Chargement...)' : `(${filteredDevices.length}${filteredDevices.length !== devices.length ? ` / ${devices.length}` : ''})`}
          </h2>
        </div>

        {error && (
          <div className="p-6 bg-red-50 border-l-4 border-red-500">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="p-6 text-center text-gray-500">Chargement...</div>
        ) : filteredDevices.length === 0 ? (
          <div className="p-6 text-center text-gray-500">Aucun appareil trouvé</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">OS</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Utilisateur</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Entreprise</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Site</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Vu le</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">Agent</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600"></th>
                </tr>
              </thead>
              <tbody>
                {filteredDevices.map((device) => (
                  <tr key={device.id} className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/devices/${device.id}`)}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{device.device_name}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{device.os}{device.os_version ? ` (${device.os_version})` : ''}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{device.user_id || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${getStatusColor(device.status)}`}>
                        {device.status === 'online' ? '🟢' : '⚫'} {device.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{orgName(device.organization_id)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{siteName(device.site_id)}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {device.last_seen ? new Date(device.last_seen).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : 'Jamais'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {device.agent_version ? (
                        isAgentOutdated(device.agent_version, sysInfo?.agent_version) ? (
                          <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 text-xs font-mono px-2 py-0.5 rounded-full">⚠️ v{device.agent_version}</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 text-xs font-mono px-2 py-0.5 rounded-full">✓ v{device.agent_version}</span>
                        )
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm" onClick={e => e.stopPropagation()}>
                      <button onClick={() => navigate(`/devices/${device.id}`)} className="text-blue-600 hover:text-blue-800 text-xs font-semibold">Détails →</button>
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
