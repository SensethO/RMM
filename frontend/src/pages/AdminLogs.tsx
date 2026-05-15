import { useState, useEffect, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Session {
  id: string;
  user_name: string;
  user_email: string;
  ip_address: string;
  browser: string;
  user_agent: string;
  screen_resolution: string;
  started_at: string;
  last_active_at: string;
  ended_at?: string;
  duration_seconds?: number;
  is_active: boolean;
  page_count: number;
}

interface SessionEvent {
  id: string;
  event_type: 'page_view' | 'heartbeat' | 'logout' | 'action';
  page?: string;
  previous_page?: string;
  action_label?: string;
  time_on_page_seconds?: number;
  time_on_previous_page?: number;
  created_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────
const PAGE_LABELS: Record<string, string> = {
  '/':             'Dashboard',
  '/devices':      'Appareils',
  '/deploy':       'Déploiements',
  '/commands':     'Commandes',
  '/monitor':      'Monitor',
  '/organization': 'Organisation',
  '/microsoft365': 'Microsoft 365',
  '/alerts':       'Alertes',
  '/versions':     'Versions',
  '/settings':     'Paramètres',
  '/profile':      'Profil',
  '/admin/logs':   'Admin Logs',
};

function pageLabel(path?: string): string {
  if (!path) return '—';
  return PAGE_LABELS[path] || path;
}

function formatDuration(sec?: number): string {
  if (!sec || sec <= 0) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s > 0 ? ` ${s}s` : ''}`.trim();
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function timeSince(iso: string): string {
  const diff = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `il y a ${diff}s`;
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}m`;
  return `il y a ${Math.floor(diff / 3600)}h`;
}

function eventIcon(type: string, page?: string): string {
  if (type === 'heartbeat') return '💓';
  if (type === 'logout') return '🚪';
  if (type === 'action') return '⚡';
  // page_view
  const icons: Record<string, string> = {
    '/': '📊', '/devices': '💻', '/deploy': '🚀',
    '/commands': '⚙️', '/monitor': '📡', '/organization': '🏢',
    '/microsoft365': '🔷', '/alerts': '🚨', '/profile': '👤',
    '/admin/logs': '📋', '/settings': '⚙️',
  };
  return icons[page || ''] || '📄';
}

function getAuthHeaders(): HeadersInit {
  const token = localStorage.getItem('auth_token');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function AdminLogs() {
  const [sessions, setSessions]       = useState<Session[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [events, setEvents]           = useState<Record<string, SessionEvent[]>>({});
  const [evtLoading, setEvtLoading]   = useState(false);

  // Filters
  const [search, setSearch]   = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]   = useState('');
  const [statusFilter, setStatus] = useState<'all' | 'active' | 'ended'>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Stats derived
  const activeCount  = sessions.filter(s => s.is_active).length;
  const uniqueUsers  = new Set(sessions.map(s => s.user_email)).size;
  const avgDuration  = (() => {
    const ended = sessions.filter(s => s.duration_seconds);
    if (!ended.length) return 0;
    return Math.round(ended.reduce((a, s) => a + (s.duration_seconds || 0), 0) / ended.length);
  })();

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (search) params.set('user_name', search);
      if (dateFrom) params.set('date_from', new Date(dateFrom).toISOString());
      if (dateTo) params.set('date_to', new Date(dateTo + 'T23:59:59').toISOString());
      const res = await fetch(`${API_BASE}/api/admin/sessions?${params}`, { headers: getAuthHeaders() });
      const json = await res.json();
      let data: Session[] = json.data || [];
      if (statusFilter === 'active') data = data.filter(s => s.is_active);
      if (statusFilter === 'ended')  data = data.filter(s => !s.is_active);
      setSessions(data);
      setTotal(json.count ?? data.length);
    } catch {}
    setLoading(false);
  }, [search, dateFrom, dateTo, statusFilter]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(fetchSessions, 30_000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchSessions]);

  const toggleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (events[id]) return;
    setEvtLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/sessions/${id}/events`, { headers: getAuthHeaders() });
      const json = await res.json();
      setEvents(prev => ({ ...prev, [id]: json.data || [] }));
    } catch {}
    setEvtLoading(false);
  };

  // ── Card helper ─────────────────────────────────────────────────────────────
  const StatCard = ({ icon, label, value, sub }: { icon: string; label: string; value: string | number; sub?: string }) => (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-2xl">{icon}</span>
        <p className="text-sm text-gray-500 dark:text-slate-400 font-medium">{label}</p>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-slate-100">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── Stats bar ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="🔗" label="Sessions (affiché)" value={sessions.length} sub={`sur ${total} total`} />
        <StatCard icon="🟢" label="Actives maintenant" value={activeCount} />
        <StatCard icon="👥" label="Utilisateurs uniques" value={uniqueUsers} />
        <StatCard icon="⏱️" label="Durée moyenne" value={formatDuration(avgDuration)} sub="sessions terminées" />
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Rechercher utilisateur</label>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Admin…"
              className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Du</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Au</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">Statut</label>
            <select value={statusFilter} onChange={e => setStatus(e.target.value as 'all' | 'active' | 'ended')}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="all">Toutes</option>
              <option value="active">Actives</option>
              <option value="ended">Terminées</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={fetchSessions}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition flex items-center gap-1.5">
              {loading ? <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : '🔍'} Rechercher
            </button>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400 cursor-pointer select-none">
              <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)}
                className="rounded" />
              Auto 30s
            </label>
          </div>
        </div>
      </div>

      {/* ── Sessions table ────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-200">
            Sessions ({sessions.length})
          </h3>
          <span className="text-xs text-gray-400 dark:text-slate-500">Cliquer sur une ligne pour voir le détail</span>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500 dark:text-slate-400">Chargement…</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-gray-500 dark:text-slate-400 text-sm">Aucune session enregistrée.</p>
            <p className="text-gray-400 dark:text-slate-500 text-xs mt-1">Les sessions apparaîtront après la migration Supabase.</p>
          </div>
        ) : (
          <div>
            {/* Table header */}
            <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-gray-50 dark:bg-slate-700/50 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide border-b border-gray-100 dark:border-slate-700">
              <div className="col-span-1">Statut</div>
              <div className="col-span-2">Utilisateur</div>
              <div className="col-span-2">IP</div>
              <div className="col-span-2">Navigateur</div>
              <div className="col-span-2">Connexion</div>
              <div className="col-span-1">Durée</div>
              <div className="col-span-1">Pages</div>
              <div className="col-span-1"></div>
            </div>

            {/* Rows */}
            {sessions.map(s => (
              <div key={s.id}>
                {/* Session row */}
                <div
                  onClick={() => toggleExpand(s.id)}
                  className={`grid grid-cols-12 gap-2 px-5 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors border-b border-gray-50 dark:border-slate-700/50 ${expandedId === s.id ? 'bg-blue-50/60 dark:bg-blue-900/10' : ''}`}
                >
                  <div className="col-span-1 flex items-center">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
                      s.is_active
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.is_active ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                      {s.is_active ? 'Live' : 'Off'}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">{s.user_name || 'Admin'}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{s.user_email}</p>
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span className="text-sm text-gray-600 dark:text-slate-300 font-mono text-xs">{s.ip_address || '—'}</span>
                  </div>
                  <div className="col-span-2 flex items-center">
                    <span className="text-sm text-gray-600 dark:text-slate-300 truncate">{s.browser || '—'}</span>
                  </div>
                  <div className="col-span-2">
                    <p className="text-sm text-gray-700 dark:text-slate-300">{formatDate(s.started_at)}</p>
                    {s.is_active && (
                      <p className="text-xs text-green-600 dark:text-green-400">{timeSince(s.last_active_at)}</p>
                    )}
                  </div>
                  <div className="col-span-1 flex items-center text-sm text-gray-600 dark:text-slate-300">
                    {s.is_active ? timeSince(s.started_at) : formatDuration(s.duration_seconds)}
                  </div>
                  <div className="col-span-1 flex items-center">
                    <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-semibold">
                      {s.page_count}
                    </span>
                  </div>
                  <div className="col-span-1 flex items-center justify-end">
                    <span className={`text-gray-400 text-xs transition-transform ${expandedId === s.id ? 'rotate-90' : ''}`}>▶</span>
                  </div>
                </div>

                {/* Expanded timeline */}
                {expandedId === s.id && (
                  <div className="px-6 pb-5 pt-3 bg-blue-50/40 dark:bg-blue-900/5 border-b border-gray-100 dark:border-slate-700">
                    <p className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-3">
                      Chronologie de la session · {s.id.slice(0, 8)}…
                    </p>

                    {evtLoading && !events[s.id] ? (
                      <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500 py-2">
                        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                        Chargement des événements…
                      </div>
                    ) : !events[s.id] || events[s.id].length === 0 ? (
                      <p className="text-sm text-gray-400 dark:text-slate-500 italic py-2">Aucun événement enregistré.</p>
                    ) : (
                      <div className="relative pl-6">
                        {/* Vertical line */}
                        <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-blue-200 dark:bg-blue-800 rounded" />

                        {events[s.id]
                          .filter(e => e.event_type !== 'heartbeat')
                          .map((e, i) => (
                          <div key={e.id || i} className="relative mb-3 last:mb-0 flex items-start gap-3">
                            {/* Dot */}
                            <span className="absolute -left-4 top-0.5 w-4 h-4 rounded-full flex items-center justify-center bg-white dark:bg-slate-800 border-2 border-blue-300 dark:border-blue-700 text-xs z-10">
                              {eventIcon(e.event_type, e.page)}
                            </span>
                            {/* Content */}
                            <div className="flex-1 bg-white dark:bg-slate-700/60 rounded-lg px-3 py-2 border border-gray-100 dark:border-slate-600 ml-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-gray-800 dark:text-slate-200">
                                  {e.event_type === 'page_view' && pageLabel(e.page)}
                                  {e.event_type === 'logout' && `Déconnexion depuis ${pageLabel(e.page)}`}
                                  {e.event_type === 'action' && (e.action_label || 'Action')}
                                </span>
                                <span className="text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap">
                                  {formatDate(e.created_at)}
                                </span>
                              </div>
                              {(e.time_on_previous_page || e.time_on_page_seconds) ? (
                                <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                                  Temps sur la page précédente : <span className="font-semibold text-blue-600 dark:text-blue-400">
                                    {formatDuration(e.time_on_previous_page || e.time_on_page_seconds)}
                                  </span>
                                </p>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Session meta */}
                    <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                      {[
                        { label: 'Résolution', value: s.screen_resolution || '—' },
                        { label: 'Navigateur', value: s.browser || '—' },
                        { label: 'User-Agent', value: (s.user_agent || '').slice(0, 60) + (s.user_agent?.length > 60 ? '…' : '') },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-white dark:bg-slate-700/60 rounded-lg p-2.5 border border-gray-100 dark:border-slate-600">
                          <p className="text-gray-400 dark:text-slate-500 uppercase tracking-wide font-semibold mb-0.5">{label}</p>
                          <p className="text-gray-700 dark:text-slate-300 break-words">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
