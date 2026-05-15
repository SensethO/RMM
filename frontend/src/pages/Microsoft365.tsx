import { useState, useEffect, useCallback } from 'react';
import { useApiClient } from '../hooks/useApi';
import { microsoft365API } from '../api/client';

type Tab = 'overview' | 'azure' | 'intune' | 'autopilot' | 'licenses' | 'users';

interface M365Status { configured: boolean; connected?: boolean; tenant_id?: string; }

// ─── Badges ───────────────────────────────────────────────────────────────────
function ComplianceBadge({ state }: { state: string }) {
  const map: Record<string, [string, string]> = {
    compliant:       ['bg-green-100 text-green-700',  '✅ Conforme'],
    noncompliant:    ['bg-red-100 text-red-700',      '❌ Non conforme'],
    unknown:         ['bg-gray-100 text-gray-600',    '? Inconnu'],
    notapplicable:   ['bg-gray-100 text-gray-500',    '— N/A'],
    inGracePeriod:   ['bg-yellow-100 text-yellow-700','⏳ Délai de grâce'],
    configManager:   ['bg-blue-100 text-blue-700',    '🔧 Config Mgr'],
  };
  const [cls, lbl] = map[state] || ['bg-gray-100 text-gray-600', state];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{lbl}</span>;
}
function TrustBadge({ type }: { type: string }) {
  const map: Record<string, [string, string]> = {
    AzureAd:    ['bg-blue-100 text-blue-700',   '☁️ Azure AD Joined'],
    Workplace:  ['bg-yellow-100 text-yellow-700','🏠 Registered'],
    ServerAd:   ['bg-purple-100 text-purple-700','🖥️ Hybrid Joined'],
  };
  const [cls, lbl] = map[type] || ['bg-gray-100 text-gray-600', type || '—'];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{lbl}</span>;
}
function EnrollBadge({ state }: { state: string }) {
  const map: Record<string, [string, string]> = {
    enrolled:       ['bg-green-100 text-green-700', '✅ Inscrit'],
    notContacted:   ['bg-gray-100 text-gray-600',   '⏳ Non contacté'],
    failed:         ['bg-red-100 text-red-700',     '❌ Échec'],
    unknown:        ['bg-gray-100 text-gray-500',   '? Inconnu'],
  };
  const [cls, lbl] = map[state] || ['bg-gray-100 text-gray-600', state];
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{lbl}</span>;
}

// ─── Loading spinner ──────────────────────────────────────────────────────────
function Loading({ text }: { text: string }) {
  return (
    <div className="py-16 text-center text-gray-400">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
      <p className="text-sm">{text}</p>
    </div>
  );
}
function Err({ msg }: { msg: string }) {
  return <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{msg}</div>;
}

// ─── Setup guide (shown when not configured) ──────────────────────────────────
function SetupGuide() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow p-8 text-center mb-6">
        <p className="text-5xl mb-4">🔌</p>
        <h2 className="text-xl font-bold text-gray-800">Connecter Microsoft 365</h2>
        <p className="text-sm text-gray-500 mt-2">Configurez une App Registration Azure AD pour intégrer Intune, Autopilot et vos licences dans le RMM.</p>
      </div>

      <div className="space-y-4 text-sm">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5">
          <h3 className="font-bold text-blue-800 mb-3">Étape 1 — Créer une App Registration Azure AD</h3>
          <ol className="list-decimal list-inside space-y-1.5 text-blue-700">
            <li>Ouvrez <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer" className="underline font-medium">Azure Portal → App Registrations</a></li>
            <li>Cliquez <strong>+ New registration</strong>, donnez un nom : <code className="bg-blue-100 px-1 rounded">RMM Platform</code></li>
            <li>Après création, copiez <strong>Application (client) ID</strong> et <strong>Directory (tenant) ID</strong></li>
            <li>Allez dans <strong>Certificates &amp; secrets</strong> → <strong>New client secret</strong> — copiez la valeur</li>
          </ol>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-5">
          <h3 className="font-bold text-yellow-800 mb-3">Étape 2 — Permissions API (Microsoft Graph · Application)</h3>
          <p className="text-yellow-700 mb-2">Dans <strong>API permissions</strong> → <strong>Add permission</strong> → <strong>Microsoft Graph</strong> → <strong>Application permissions</strong> :</p>
          <div className="grid grid-cols-2 gap-1.5 mb-2">
            {['Device.Read.All', 'DeviceManagementManagedDevices.Read.All', 'DeviceManagementServiceConfig.Read.All', 'Directory.Read.All', 'Organization.Read.All', 'User.Read.All'].map(p => (
              <code key={p} className="bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded text-xs">{p}</code>
            ))}
          </div>
          <p className="text-yellow-600 text-xs">⚠️ Cliquez <strong>Grant admin consent for [votre org]</strong> après avoir ajouté toutes les permissions.</p>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-5">
          <h3 className="font-bold text-green-800 mb-3">Étape 3 — Variables d'environnement Vercel (backend)</h3>
          <p className="text-green-700 mb-3">Ajoutez ces 3 variables dans <a href="https://vercel.com/sensethos-projects/backend/settings/environment-variables" target="_blank" rel="noopener noreferrer" className="underline font-medium">Vercel → backend → Settings → Environment Variables</a> :</p>
          <div className="space-y-2">
            {[
              { name: 'AZURE_TENANT_ID',     desc: 'Directory (tenant) ID depuis Azure Portal' },
              { name: 'AZURE_CLIENT_ID',     desc: 'Application (client) ID depuis Azure Portal' },
              { name: 'AZURE_CLIENT_SECRET', desc: 'Valeur du client secret créé à l\'étape 1' },
            ].map(v => (
              <div key={v.name} className="flex items-start gap-2">
                <code className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs font-mono shrink-0">{v.name}</code>
                <span className="text-green-600 text-xs">{v.desc}</span>
              </div>
            ))}
          </div>
          <p className="text-green-600 text-xs mt-3">Puis redéployez le backend : <code className="bg-green-100 px-1 rounded">npx vercel --prod</code> dans le dossier backend/</p>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
          <h3 className="font-bold text-gray-700 mb-2">Fonctionnalités disponibles après connexion</h3>
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
            {[
              ['☁️ Azure AD', 'Appareils joints, statut de conformité, dernière activité'],
              ['🔒 Intune', 'Gestion MDM, conformité, dernière synchronisation'],
              ['🚀 Autopilot', 'Profils de déploiement, état d\'inscription'],
              ['🔑 Licences', 'SKU souscrits, taux d\'utilisation en temps réel'],
              ['👥 Utilisateurs', 'Comptes Azure AD, licences assignées, statut'],
              ['📊 Aperçu', 'Tableau de bord unifié de votre parc Microsoft 365'],
            ].map(([icon, desc]) => (
              <div key={icon} className="flex items-start gap-1">
                <span>{icon}</span><span>{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function Microsoft365() {
  const { isReady } = useApiClient();
  const [status, setStatus]       = useState<M365Status | null>(null);
  const [tab, setTab]             = useState<Tab>('overview');
  const [tabData, setTabData]     = useState<Record<string, unknown[]>>({});
  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({});
  const [tabError, setTabError]   = useState<Record<string, string>>({});

  const checkStatus = useCallback(async () => {
    try {
      const r = await microsoft365API.status();
      setStatus(r.data.data as unknown as M365Status || { configured: false });
    } catch { setStatus({ configured: false }); }
  }, []);

  useEffect(() => { if (isReady) checkStatus(); }, [isReady, checkStatus]);

  const fetchTab = useCallback(async (t: Tab) => {
    if (t === 'overview' || tabData[t] || tabLoading[t]) return;
    setTabLoading(p => ({ ...p, [t]: true }));
    try {
      let r;
      if (t === 'azure')     r = await microsoft365API.azureDevices();
      else if (t === 'intune')    r = await microsoft365API.intune();
      else if (t === 'autopilot') r = await microsoft365API.autopilot();
      else if (t === 'licenses')  r = await microsoft365API.subscriptions();
      else if (t === 'users')     r = await microsoft365API.users();
      if (r) setTabData(p => ({ ...p, [t]: r!.data.data as unknown[] || [] }));
    } catch (e) { setTabError(p => ({ ...p, [t]: e instanceof Error ? e.message : 'Erreur réseau' })); }
    setTabLoading(p => ({ ...p, [t]: false }));
  }, [tabData, tabLoading]);

  const switchTab = (t: Tab) => { setTab(t); fetchTab(t); };

  // Auto-load overview stats by fetching each tab silently
  useEffect(() => {
    if (status?.connected && tab === 'overview') {
      (['azure', 'intune', 'autopilot', 'licenses', 'users'] as Tab[]).forEach(t => fetchTab(t));
    }
  }, [status, tab, fetchTab]);

  if (!status) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" /></div>;
  if (!status.configured || !status.connected) return <SetupGuide />;

  const azure     = (tabData.azure     || []) as Record<string, unknown>[];
  const intune    = (tabData.intune    || []) as Record<string, unknown>[];
  const autopilot = (tabData.autopilot || []) as Record<string, unknown>[];
  const licenses  = (tabData.licenses  || []) as Record<string, unknown>[];
  const users     = (tabData.users     || []) as Record<string, unknown>[];

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'overview',  label: 'Aperçu',        icon: '📊' },
    { key: 'azure',     label: 'Azure AD',       icon: '☁️' },
    { key: 'intune',    label: 'Intune',          icon: '🔒' },
    { key: 'autopilot', label: 'Autopilot',       icon: '🚀' },
    { key: 'licenses',  label: 'Licences',        icon: '🔑' },
    { key: 'users',     label: 'Utilisateurs',    icon: '👥' },
  ];

  return (
    <div className="space-y-4">
      {/* Connection banner */}
      <div className="bg-green-50 border border-green-300 rounded-lg p-3 flex items-center gap-3">
        <span className="text-lg">✅</span>
        <div className="flex-1">
          <p className="font-semibold text-green-800 text-sm">Microsoft 365 connecté</p>
          <p className="text-xs text-green-600">Tenant ID : {status.tenant_id}</p>
        </div>
        <button onClick={() => { setTabData({}); setStatus(null); checkStatus(); }} className="text-xs text-green-700 hover:underline">🔄 Actualiser</button>
      </div>

      {/* Tab panel */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="border-b flex overflow-x-auto">
          {tabs.map(t => (
            <button key={t.key} onClick={() => switchTab(t.key)}
              className={`px-5 py-3 text-sm font-medium whitespace-nowrap transition ${tab === t.key ? 'border-b-2 border-blue-600 text-blue-700 bg-blue-50' : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'}`}>
              {t.icon} {t.label}
              {t.key !== 'overview' && tabData[t.key] && (
                <span className="ml-1.5 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">{(tabData[t.key] as unknown[]).length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-6">

          {/* ── Aperçu ── */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Appareils Azure AD',  value: azure.length,     icon: '☁️',  tab: 'azure'     as Tab, loading: tabLoading.azure },
                  { label: 'Gérés Intune',         value: intune.length,    icon: '🔒',  tab: 'intune'    as Tab, loading: tabLoading.intune },
                  { label: 'Autopilot',            value: autopilot.length, icon: '🚀',  tab: 'autopilot' as Tab, loading: tabLoading.autopilot },
                  { label: 'Utilisateurs',          value: users.length,     icon: '👥',  tab: 'users'     as Tab, loading: tabLoading.users },
                ].map(s => (
                  <button key={s.label} onClick={() => switchTab(s.tab)}
                    className="bg-gray-50 hover:bg-blue-50 rounded-lg p-4 text-left transition border border-gray-200 hover:border-blue-300">
                    <div className="text-2xl mb-1">{s.icon}</div>
                    {s.loading ? <div className="animate-pulse h-7 bg-gray-200 rounded w-10 mb-1" /> : <div className="text-2xl font-bold text-gray-800">{s.value}</div>}
                    <div className="text-xs text-gray-500">{s.label}</div>
                  </button>
                ))}
              </div>

              {/* Intune compliance summary */}
              {intune.length > 0 && (() => {
                const compliant    = intune.filter(d => d.complianceState === 'compliant').length;
                const noncompliant = intune.filter(d => d.complianceState === 'noncompliant').length;
                const unknown      = intune.length - compliant - noncompliant;
                const pct = intune.length ? Math.round(compliant / intune.length * 100) : 0;
                return (
                  <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
                    <h3 className="font-semibold text-gray-700 mb-3">🔒 Conformité Intune</h3>
                    <div className="flex items-center gap-4 mb-3">
                      <div className="flex-1 bg-gray-200 rounded-full h-3">
                        <div className="h-3 rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-sm font-bold text-gray-700">{pct}%</span>
                    </div>
                    <div className="flex gap-6 text-sm">
                      <span className="text-green-600 font-medium">✅ {compliant} conformes</span>
                      <span className="text-red-600 font-medium">❌ {noncompliant} non conformes</span>
                      <span className="text-gray-400">? {unknown} inconnus</span>
                    </div>
                  </div>
                );
              })()}

              {/* Licenses usage */}
              {licenses.length > 0 && (
                <div>
                  <h3 className="font-semibold text-gray-700 mb-3">🔑 Licences</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {licenses.map((l, i) => {
                      const pp = (l.prepaidUnits as Record<string, number>) || {};
                      const total = pp.enabled || 0;
                      const used  = (l.consumedUnits as number) || 0;
                      const pct   = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
                      return (
                        <div key={i} className="bg-gray-50 border rounded-lg p-3">
                          <p className="font-mono text-xs text-gray-500 mb-1 truncate">{String(l.skuPartNumber)}</p>
                          <div className="flex items-end justify-between mb-1.5">
                            <span className="text-xl font-bold text-gray-800">{used}</span>
                            <span className="text-xs text-gray-400">/ {total}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div className={`h-1.5 rounded-full ${pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-yellow-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <p className={`text-xs mt-1 ${pct > 90 ? 'text-red-600' : 'text-gray-400'}`}>{pct}% utilisé</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Azure AD Devices ── */}
          {tab === 'azure' && (
            tabLoading.azure ? <Loading text="Chargement des appareils Azure AD..." /> :
            tabError.azure   ? <Err msg={tabError.azure} /> :
            <div className="overflow-x-auto">
              <p className="text-sm text-gray-400 mb-3">{azure.length} appareils enregistrés dans Azure AD</p>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>
                  {['Nom','OS','Version','Jonction','Conforme','Géré','Dernière activité'].map(h => <th key={h} className="px-4 py-2 text-left font-semibold text-gray-600 text-xs">{h}</th>)}
                </tr></thead>
                <tbody>
                  {azure.map((d, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{String(d.displayName || '—')}</td>
                      <td className="px-4 py-2 text-gray-600 text-xs">{String(d.operatingSystem || '—')}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{String(d.operatingSystemVersion || '—')}</td>
                      <td className="px-4 py-2"><TrustBadge type={String(d.trustType || '')} /></td>
                      <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${d.compliant ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{d.compliant ? '✅' : '—'}</span></td>
                      <td className="px-4 py-2"><span className={`text-xs px-2 py-0.5 rounded-full ${d.isManaged ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>{d.isManaged ? 'Géré' : 'Non géré'}</span></td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{d.approximateLastSignInDateTime ? new Date(String(d.approximateLastSignInDateTime)).toLocaleDateString('fr-FR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Intune ── */}
          {tab === 'intune' && (
            tabLoading.intune ? <Loading text="Chargement des appareils Intune..." /> :
            tabError.intune   ? <Err msg={tabError.intune} /> :
            <div className="overflow-x-auto">
              <p className="text-sm text-gray-400 mb-3">{intune.length} appareils gérés par Intune</p>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>
                  {['Nom','Utilisateur','OS','Version','Conformité','Dernier sync','Inscrit le'].map(h => <th key={h} className="px-4 py-2 text-left font-semibold text-gray-600 text-xs">{h}</th>)}
                </tr></thead>
                <tbody>
                  {intune.map((d, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{String(d.deviceName || '—')}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs max-w-xs truncate">{String(d.userPrincipalName || '—')}</td>
                      <td className="px-4 py-2 text-gray-600 text-xs">{String(d.operatingSystem || '—')}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{String(d.osVersion || '—')}</td>
                      <td className="px-4 py-2"><ComplianceBadge state={String(d.complianceState || 'unknown')} /></td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{d.lastSyncDateTime ? new Date(String(d.lastSyncDateTime)).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{d.enrolledDateTime ? new Date(String(d.enrolledDateTime)).toLocaleDateString('fr-FR') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Autopilot ── */}
          {tab === 'autopilot' && (
            tabLoading.autopilot ? <Loading text="Chargement des appareils Autopilot..." /> :
            tabError.autopilot   ? <Err msg={tabError.autopilot} /> :
            <div className="overflow-x-auto">
              <p className="text-sm text-gray-400 mb-3">{autopilot.length} appareils Autopilot</p>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>
                  {['N° de série','Fabricant','Modèle','Groupe','État'].map(h => <th key={h} className="px-4 py-2 text-left font-semibold text-gray-600 text-xs">{h}</th>)}
                </tr></thead>
                <tbody>
                  {autopilot.map((d, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-xs">{String(d.serialNumber || '—')}</td>
                      <td className="px-4 py-2 text-gray-600">{String(d.manufacturer || '—')}</td>
                      <td className="px-4 py-2 text-gray-600">{String(d.model || '—')}</td>
                      <td className="px-4 py-2">{d.groupTag ? <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{String(d.groupTag)}</span> : '—'}</td>
                      <td className="px-4 py-2"><EnrollBadge state={String(d.enrollmentState || 'unknown')} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Licences ── */}
          {tab === 'licenses' && (
            tabLoading.licenses ? <Loading text="Chargement des licences..." /> :
            tabError.licenses   ? <Err msg={tabError.licenses} /> :
            <div>
              <p className="text-sm text-gray-400 mb-4">{licenses.length} abonnements actifs</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {licenses.map((l, i) => {
                  const pp    = (l.prepaidUnits as Record<string, number>) || {};
                  const total = pp.enabled || 0;
                  const used  = (l.consumedUnits as number) || 0;
                  const pct   = total ? Math.min(100, Math.round((used / total) * 100)) : 0;
                  return (
                    <div key={i} className="bg-gray-50 border rounded-lg p-4">
                      <p className="font-mono text-xs text-gray-400 mb-2 truncate">{String(l.skuPartNumber)}</p>
                      <div className="flex items-baseline gap-1 mb-2">
                        <span className="text-3xl font-bold text-gray-800">{used}</span>
                        <span className="text-sm text-gray-400">/ {total} licences</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-1.5">
                        <div className={`h-2 rounded-full ${pct > 90 ? 'bg-red-500' : pct > 75 ? 'bg-yellow-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                      <p className={`text-xs font-medium ${pct > 90 ? 'text-red-600' : pct > 75 ? 'text-yellow-600' : 'text-gray-400'}`}>{pct}% utilisé · {total - used} disponibles</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Utilisateurs ── */}
          {tab === 'users' && (
            tabLoading.users ? <Loading text="Chargement des utilisateurs Azure AD..." /> :
            tabError.users   ? <Err msg={tabError.users} /> :
            <div className="overflow-x-auto">
              <p className="text-sm text-gray-400 mb-3">{users.length} utilisateurs Azure AD</p>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b"><tr>
                  {['Nom','Email / UPN','Poste','Département','Licences','Statut'].map(h => <th key={h} className="px-4 py-2 text-left font-semibold text-gray-600 text-xs">{h}</th>)}
                </tr></thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">{String(u.displayName || '—')}</td>
                      <td className="px-4 py-2 text-gray-400 text-xs">{String(u.userPrincipalName || u.mail || '—')}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{String(u.jobTitle || '—')}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{String(u.department || '—')}</td>
                      <td className="px-4 py-2">
                        <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                          {((u.assignedLicenses as unknown[]) || []).length}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${u.accountEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                          {u.accountEnabled ? 'Actif' : 'Désactivé'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
