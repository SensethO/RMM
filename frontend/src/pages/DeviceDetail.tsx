import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApiClient } from '../hooks/useApi';
import { deviceAPI, commandAPI, orgAPI } from '../api/client';
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
  organization_id?: string | null;
  site_id?: string | null;
  department_id?: string | null;
  notes?: string | null;
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

      {/* Org Assignment */}
      <OrgSection device={device} onUpdate={d => setDevice(d)} />

      {/* Deploy apps to this device */}
      <DeploySection deviceId={id!} />

      {/* Installed Apps */}
      <InstalledAppsSection deviceId={id!} />

      {/* Services Windows */}
      <ServicesSection deviceId={id!} />

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

// ─── Organisation assignment section ─────────────────────────────────────────
interface OrgItem { id: string; name: string; }

function OrgSection({ device, onUpdate }: { device: Device; onUpdate: (d: Device) => void }) {
  const [orgs,  setOrgs]  = useState<OrgItem[]>([]);
  const [sites, setSites] = useState<(OrgItem & { organization_id: string | null })[]>([]);
  const [depts, setDepts] = useState<(OrgItem & { organization_id: string | null; site_id: string | null })[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open,   setOpen]   = useState(false);
  const [orgId,  setOrgId]  = useState(device.organization_id || '');
  const [siteId, setSiteId] = useState(device.site_id || '');
  const [deptId, setDeptId] = useState(device.department_id || '');
  const [notes,  setNotes]  = useState(device.notes || '');
  const [saving, setSaving] = useState(false);
  const [msg,    setMsg]    = useState<string | null>(null);

  const loadOrg = useCallback(async () => {
    if (loaded) return;
    try {
      const [or, sr, dr] = await Promise.all([orgAPI.listOrgs(), orgAPI.listSites(), orgAPI.listDepts()]);
      setOrgs((or.data.data || []) as OrgItem[]);
      setSites((sr.data.data || []) as (OrgItem & { organization_id: string | null })[]);
      setDepts((dr.data.data || []) as (OrgItem & { organization_id: string | null; site_id: string | null })[]);
      setLoaded(true);
    } catch {}
  }, [loaded]);

  useEffect(() => {
    if (open) loadOrg();
  }, [open, loadOrg]);

  // Sync when device changes
  useEffect(() => {
    setOrgId(device.organization_id || '');
    setSiteId(device.site_id || '');
    setDeptId(device.department_id || '');
    setNotes(device.notes || '');
  }, [device.organization_id, device.site_id, device.department_id, device.notes]);

  const orgName  = orgs.find(o => o.id === (device.organization_id || ''))?.name;
  const siteName = sites.find(s => s.id === (device.site_id || ''))?.name;
  const deptName = depts.find(d => d.id === (device.department_id || ''))?.name;

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const r = await orgAPI.assignDevice(device.id, {
        organization_id: orgId || null,
        site_id: siteId || null,
        department_id: deptId || null,
        notes: notes || undefined,
      });
      onUpdate(r.data.data as unknown as Device);
      setMsg('✅ Assignation enregistrée');
      setOpen(false);
    } catch { setMsg('❌ Erreur'); }
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-800">🏢 Organisation</h2>
        <button onClick={() => setOpen(o => !o)} className="text-sm text-blue-600 hover:underline">
          {open ? '▲ Fermer' : '✏️ Modifier'}
        </button>
      </div>

      {!open ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><p className="text-gray-400 text-xs mb-0.5">Entreprise</p><p className="font-medium text-gray-800">{orgName || <span className="text-gray-300">—</span>}</p></div>
          <div><p className="text-gray-400 text-xs mb-0.5">Site</p><p className="font-medium text-gray-800">{siteName || <span className="text-gray-300">—</span>}</p></div>
          <div><p className="text-gray-400 text-xs mb-0.5">Service</p><p className="font-medium text-gray-800">{deptName || <span className="text-gray-300">—</span>}</p></div>
          <div><p className="text-gray-400 text-xs mb-0.5">Notes</p><p className="font-medium text-gray-800 truncate">{device.notes || <span className="text-gray-300">—</span>}</p></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Entreprise</label>
            <select value={orgId} onChange={e => { setOrgId(e.target.value); setSiteId(''); setDeptId(''); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Aucune —</option>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Site</label>
            <select value={siteId} onChange={e => { setSiteId(e.target.value); setDeptId(''); }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Aucun —</option>
              {sites.filter(s => !orgId || s.organization_id === orgId).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Service</label>
            <select value={deptId} onChange={e => setDeptId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— Aucun —</option>
              {depts.filter(d => (!siteId || d.site_id === siteId) && (!orgId || d.organization_id === orgId)).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes internes..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="sm:col-span-2 flex items-center gap-3">
            <button onClick={save} disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
              {saving ? '...' : '💾 Enregistrer'}
            </button>
            <button onClick={() => setOpen(false)} className="px-4 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-gray-200">Annuler</button>
            {msg && <span className="text-sm">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── App catalog for in-device deployment ─────────────────────────────────────
const DEPLOY_CATALOG = [
  { id:'chrome',    name:'Google Chrome',     icon:'🌐', package_id:'Google.Chrome',                     category:'Navigateurs'  },
  { id:'firefox',   name:'Mozilla Firefox',   icon:'🦊', package_id:'Mozilla.Firefox',                   category:'Navigateurs'  },
  { id:'edge',      name:'Microsoft Edge',    icon:'🔵', package_id:'Microsoft.Edge',                    category:'Navigateurs'  },
  { id:'teams',     name:'Microsoft Teams',   icon:'💬', package_id:'Microsoft.Teams',                   category:'Bureautique'  },
  { id:'zoom',      name:'Zoom',              icon:'📹', package_id:'Zoom.Zoom',                         category:'Bureautique'  },
  { id:'libreoffice',name:'LibreOffice',      icon:'📄', package_id:'TheDocumentFoundation.LibreOffice', category:'Bureautique'  },
  { id:'reader',    name:'Adobe Reader',      icon:'📕', package_id:'Adobe.Acrobat.Reader.64-bit',       category:'Bureautique'  },
  { id:'slack',     name:'Slack',             icon:'💼', package_id:'SlackTechnologies.Slack',           category:'Bureautique'  },
  { id:'adwcleaner',name:'ADWCleaner',        icon:'🧹', package_id:'Malwarebytes.AdwCleaner',           category:'Sécurité'     },
  { id:'malwarebytes',name:'Malwarebytes',    icon:'🛡️', package_id:'Malwarebytes.Malwarebytes',         category:'Sécurité'     },
  { id:'bitwarden', name:'Bitwarden',         icon:'🔑', package_id:'Bitwarden.Bitwarden',               category:'Sécurité'     },
  { id:'vscode',    name:'VS Code',           icon:'🔷', package_id:'Microsoft.VisualStudioCode',        category:'Dev'          },
  { id:'git',       name:'Git',               icon:'🌿', package_id:'Git.Git',                           category:'Dev'          },
  { id:'nodejs',    name:'Node.js LTS',       icon:'💚', package_id:'OpenJS.NodeJS.LTS',                 category:'Dev'          },
  { id:'chatgpt',   name:'ChatGPT',           icon:'🤖', package_id:'9NTM2QC6QWS7',                     category:'IA'           },
  { id:'claude',    name:'Claude',            icon:'🧠', package_id:'Anthropic.Claude',                  category:'IA'           },
  { id:'copilot',   name:'Copilot',           icon:'🪟', package_id:'9NHT9RB2F4HD',                     category:'IA'           },
  { id:'perplexity',name:'Perplexity',        icon:'🔍', package_id:'Perplexity.Perplexity',            category:'IA'           },
  { id:'ollama',    name:'Ollama',            icon:'🦙', package_id:'Ollama.Ollama',                    category:'IA'           },
  { id:'7zip',      name:'7-Zip',             icon:'📦', package_id:'7zip.7zip',                         category:'Utilitaires'  },
  { id:'vlc',       name:'VLC',               icon:'🎬', package_id:'VideoLAN.VLC',                      category:'Utilitaires'  },
  { id:'notepadpp', name:'Notepad++',         icon:'📝', package_id:'Notepad++.Notepad++',               category:'Utilitaires'  },
];
const DEPLOY_CATS = ['Tous', ...Array.from(new Set(DEPLOY_CATALOG.map(a => a.category)))];

function DeploySection({ deviceId }: { deviceId: string }) {
  const [cat,     setCat]     = useState('Tous');
  const [search,  setSearch]  = useState('');
  const [pending, setPending] = useState<Record<string, string>>({});  // appId → status
  const [msgs,    setMsgs]    = useState<Record<string, string>>({});

  const filtered = DEPLOY_CATALOG.filter(a =>
    (cat === 'Tous' || a.category === cat) &&
    (!search || a.name.toLowerCase().includes(search.toLowerCase()) || a.package_id.toLowerCase().includes(search.toLowerCase()))
  );

  async function install(app: typeof DEPLOY_CATALOG[0]) {
    setPending(p => ({ ...p, [app.id]: 'sending' }));
    setMsgs(p => ({ ...p, [app.id]: '' }));
    try {
      await commandAPI.queue(deviceId, {
        command_type: 'install_app',
        params: { method: 'winget', package_id: app.package_id, display_name: app.name },
      });
      setPending(p => ({ ...p, [app.id]: 'sent' }));
      setMsgs(p => ({ ...p, [app.id]: '✅ Commande envoyée' }));
      setTimeout(() => setPending(p => { const n = { ...p }; delete n[app.id]; return n; }), 4000);
    } catch {
      setPending(p => ({ ...p, [app.id]: 'error' }));
      setMsgs(p => ({ ...p, [app.id]: '❌ Erreur' }));
    }
  }

  async function uninstall(app: typeof DEPLOY_CATALOG[0]) {
    setPending(p => ({ ...p, [app.id + '_u']: 'sending' }));
    try {
      await commandAPI.queue(deviceId, {
        command_type: 'uninstall_app',
        params: { method: 'winget', package_id: app.package_id, display_name: app.name },
      });
      setPending(p => ({ ...p, [app.id + '_u']: 'sent' }));
      setMsgs(p => ({ ...p, [app.id]: '✅ Désinstallation envoyée' }));
      setTimeout(() => setPending(p => { const n = { ...p }; delete n[app.id + '_u']; return n; }), 4000);
    } catch {
      setPending(p => ({ ...p, [app.id + '_u']: 'error' }));
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">🚀 Déployer une application</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Rechercher une app..."
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-48"
        />
        {DEPLOY_CATS.map(c => (
          <button key={c} onClick={() => setCat(c)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition ${cat === c ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {c}
          </button>
        ))}
      </div>

      {/* App grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {filtered.map(app => {
          const st  = pending[app.id];
          const stU = pending[app.id + '_u'];
          const msg = msgs[app.id];
          return (
            <div key={app.id} className="border border-gray-200 rounded-lg p-3 flex flex-col gap-2 hover:border-blue-300 hover:shadow-sm transition">
              <div className="flex items-center gap-2">
                <span className="text-xl">{app.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate">{app.name}</p>
                  <p className="text-xs text-gray-400 truncate">{app.category}</p>
                </div>
              </div>
              {msg && <p className="text-xs text-green-600">{msg}</p>}
              <div className="flex gap-1 mt-auto">
                <button
                  onClick={() => install(app)}
                  disabled={!!st || !!stU}
                  className="flex-1 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded transition disabled:opacity-50"
                >
                  {st === 'sending' ? '...' : st === 'sent' ? '✓' : '⬇ Installer'}
                </button>
                <button
                  onClick={() => uninstall(app)}
                  disabled={!!st || !!stU}
                  title="Désinstaller"
                  className="px-2 py-1 bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-500 text-xs rounded transition disabled:opacity-50"
                >
                  {stU === 'sending' ? '...' : '✕'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
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

// ─── Services Windows section ─────────────────────────────────────────────────
interface ServiceInfo {
  Name: string;
  DisplayName: string;
  State: string;     // "Running" | "Stopped" | "Paused" | ...
  StartMode: string; // "Auto" | "Manual" | "Disabled" | "Boot" | "System"
}

function ServicesSection({ deviceId }: { deviceId: string }) {
  const [services,      setServices]      = useState<ServiceInfo[] | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  const [search,        setSearch]        = useState('');
  const [filter,        setFilter]        = useState<'all' | 'running' | 'stopped'>('all');
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [pending,       setPending]       = useState<Record<string, string>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadFromHistory();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [deviceId]);

  async function loadFromHistory() {
    try {
      const hist = await commandAPI.getHistory(deviceId, 30);
      const cmds = (hist.data.data as Record<string, unknown>[]) || [];
      const recent = cmds.find(c => c.command_type === 'list_services' && c.status === 'success');
      if (recent?.output) {
        try {
          const parsed = JSON.parse(recent.output as string);
          if (Array.isArray(parsed)) { setServices(parsed as ServiceInfo[]); setLastRefreshed(recent.created_at as string); }
        } catch {}
      }
    } catch {}
  }

  async function refresh() {
    setLoading(true); setError(null);
    try {
      const res = await commandAPI.queue(deviceId, { command_type: 'list_services' });
      const cmdId = (res.data.data as Record<string, unknown>).id as string;
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        if (attempts > 30) { clearInterval(pollRef.current!); setError("Timeout — l'agent ne répond pas"); setLoading(false); return; }
        try {
          const hist = await commandAPI.getHistory(deviceId, 10);
          const cmd = (hist.data.data as Record<string, unknown>[])?.find(c => c.id === cmdId);
          if (cmd?.status === 'success' && cmd.output) {
            clearInterval(pollRef.current!);
            try {
              const parsed = JSON.parse(cmd.output as string);
              setServices(Array.isArray(parsed) ? parsed as ServiceInfo[] : []);
              setLastRefreshed(cmd.created_at as string);
            } catch { setError('Erreur parsing JSON'); }
            setLoading(false);
          } else if (cmd?.status === 'failed') {
            clearInterval(pollRef.current!);
            setError((cmd.output as string) || 'Échec');
            setLoading(false);
          }
        } catch {}
      }, 3000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Erreur'); setLoading(false); }
  }

  async function serviceAction(name: string, action: 'start' | 'stop' | 'restart') {
    setPending(p => ({ ...p, [name]: action }));
    try {
      const res = await commandAPI.queue(deviceId, { command_type: 'service_action', params: { service_name: name, action } });
      const cmdId = (res.data.data as Record<string, unknown>).id as string;
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        if (attempts > 20) { clearInterval(poll); setPending(p => { const n = { ...p }; delete n[name]; return n; }); return; }
        const hist = await commandAPI.getHistory(deviceId, 10);
        const cmd = (hist.data.data as Record<string, unknown>[])?.find(c => c.id === cmdId);
        if (cmd?.status === 'success' || cmd?.status === 'failed') {
          clearInterval(poll);
          setPending(p => { const n = { ...p }; delete n[name]; return n; });
          if (cmd.status === 'success' && cmd.output) {
            try {
              const result = JSON.parse(cmd.output as string) as { new_status?: string };
              if (result.new_status)
                setServices(svcs => svcs?.map(s => s.Name === name ? { ...s, State: result.new_status! } : s) || null);
            } catch {}
          }
        }
      }, 2000);
    } catch { setPending(p => { const n = { ...p }; delete n[name]; return n; }); }
  }

  async function changeStartup(name: string, startupType: string) {
    const key = name + '_startup';
    setPending(p => ({ ...p, [key]: startupType }));
    const wmiMode = startupType === 'Automatic' ? 'Auto' : startupType;
    try {
      const res = await commandAPI.queue(deviceId, { command_type: 'service_startup', params: { service_name: name, startup_type: startupType } });
      const cmdId = (res.data.data as Record<string, unknown>).id as string;
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        if (attempts > 10) { clearInterval(poll); setPending(p => { const n = { ...p }; delete n[key]; return n; }); return; }
        const hist = await commandAPI.getHistory(deviceId, 10);
        const cmd = (hist.data.data as Record<string, unknown>[])?.find(c => c.id === cmdId);
        if (cmd?.status === 'success' || cmd?.status === 'failed') {
          clearInterval(poll);
          setPending(p => { const n = { ...p }; delete n[key]; return n; });
          if (cmd.status === 'success')
            setServices(svcs => svcs?.map(s => s.Name === name ? { ...s, StartMode: wmiMode } : s) || null);
        }
      }, 2000);
    } catch { setPending(p => { const n = { ...p }; delete n[key]; return n; }); }
  }

  const filtered = (services || []).filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.DisplayName.toLowerCase().includes(q) || s.Name.toLowerCase().includes(q);
    const matchFilter = filter === 'all' || (filter === 'running' && s.State === 'Running') || (filter === 'stopped' && s.State === 'Stopped');
    return matchSearch && matchFilter;
  });

  const stateBadge = (state: string, pendingAction?: string) => {
    if (pendingAction) return (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700 animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{pendingAction}…
      </span>
    );
    const cfg = state === 'Running' ? 'bg-green-100 text-green-700' : state === 'Stopped' ? 'bg-gray-100 text-gray-600' : 'bg-yellow-100 text-yellow-700';
    const dot = state === 'Running' ? 'bg-green-500' : state === 'Stopped' ? 'bg-gray-400' : 'bg-yellow-500';
    return <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-full font-medium ${cfg}`}><span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{state}</span>;
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-6">
      <div className="flex items-center justify-between border-b dark:border-slate-700 pb-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100">⚙️ Services Windows</h2>
        <button onClick={refresh} disabled={loading}
          className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
          {loading ? '⏳ Chargement...' : '↻ Actualiser'}
        </button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un service..."
          className="border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400 w-56" />
        {(['all','running','stopped'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs rounded-lg font-medium transition ${filter === f ? 'bg-slate-600 text-white' : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200'}`}>
            {f === 'all' ? 'Tous' : f === 'running' ? '▶ En cours' : '■ Arrêtés'}
          </button>
        ))}
        {services && <span className="text-xs text-gray-400 self-center">{filtered.length} / {services.length} service(s)</span>}
      </div>

      {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
      {loading && !services && (
        <div className="flex items-center gap-2 text-gray-500 text-sm py-6">
          <div className="animate-spin h-4 w-4 border-2 border-slate-500 border-t-transparent rounded-full" />
          Récupération des services Windows...
        </div>
      )}

      {services && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700" style={{ maxHeight: '500px', overflowY: 'auto' }}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-700 border-b dark:border-slate-600" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-600 dark:text-slate-300">Service</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600 dark:text-slate-300">Statut</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600 dark:text-slate-300">Démarrage</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-600 dark:text-slate-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(svc => {
                const isRunning      = svc.State === 'Running';
                const pendingAction  = pending[svc.Name];
                const pendingStartup = pending[svc.Name + '_startup'];
                const isBusy         = !!pendingAction || !!pendingStartup;
                const isKernelDriver = svc.StartMode === 'Boot' || svc.StartMode === 'System';
                return (
                  <tr key={svc.Name} className="border-b dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700/50">
                    <td className="px-4 py-2">
                      <p className="font-medium text-gray-800 dark:text-slate-200">{svc.DisplayName}</p>
                      <p className="text-xs text-gray-400 font-mono">{svc.Name}</p>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{stateBadge(svc.State, pendingAction)}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1.5">
                        <select
                          disabled={isBusy || isKernelDriver}
                          value={svc.StartMode}
                          onChange={e => changeStartup(svc.Name, e.target.value === 'Auto' ? 'Automatic' : e.target.value)}
                          className="border border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 disabled:opacity-50"
                        >
                          <option value="Auto">Automatique</option>
                          <option value="Manual">Manuel</option>
                          <option value="Disabled">Désactivé</option>
                          {svc.StartMode === 'Boot'   && <option value="Boot">Boot</option>}
                          {svc.StartMode === 'System' && <option value="System">Système</option>}
                        </select>
                        {pendingStartup && <span className="text-blue-500 text-sm">↻</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-1">
                        <button title="Démarrer" disabled={isRunning || isBusy} onClick={() => serviceAction(svc.Name, 'start')}
                          className="px-2 py-1 rounded text-xs font-bold text-green-700 bg-green-50 hover:bg-green-100 disabled:opacity-25 disabled:cursor-not-allowed transition">▶ Start</button>
                        <button title="Arrêter" disabled={!isRunning || isBusy} onClick={() => serviceAction(svc.Name, 'stop')}
                          className="px-2 py-1 rounded text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 disabled:opacity-25 disabled:cursor-not-allowed transition">■ Stop</button>
                        <button title="Redémarrer" disabled={!isRunning || isBusy} onClick={() => serviceAction(svc.Name, 'restart')}
                          className="px-2 py-1 rounded text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-25 disabled:cursor-not-allowed transition">↺ Restart</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">Aucun service trouvé</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {!services && !loading && !error && (
        <p className="text-gray-400 text-sm">Cliquez sur "Actualiser" pour lister les services Windows de ce device.</p>
      )}
      {lastRefreshed && (
        <p className="text-xs text-gray-400 mt-2">Dernière mise à jour : {new Date(lastRefreshed).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
      )}
    </div>
  );
}
