import { useEffect, useState, useCallback } from 'react';
import { deployAPI, deviceAPI, commandAPI, AppDeployParams } from '../api/client';

// ─── Catalogue d'applications ─────────────────────────────────────────────────
interface CatalogApp {
  id: string;
  name: string;
  category: string;
  icon: string;
  package_id: string;   // winget ID
  description: string;
  publisher: string;
}

const APP_CATALOG: CatalogApp[] = [
  // Navigateurs
  { id: 'chrome',    name: 'Google Chrome',     category: 'Navigateurs',  icon: '🌐', package_id: 'Google.Chrome',                     publisher: 'Google',      description: 'Navigateur web rapide et sécurisé' },
  { id: 'firefox',   name: 'Mozilla Firefox',   category: 'Navigateurs',  icon: '🦊', package_id: 'Mozilla.Firefox',                   publisher: 'Mozilla',     description: 'Navigateur open-source respectueux de la vie privée' },
  { id: 'edge',      name: 'Microsoft Edge',    category: 'Navigateurs',  icon: '🔵', package_id: 'Microsoft.Edge',                    publisher: 'Microsoft',   description: 'Navigateur basé sur Chromium' },
  // Bureautique
  { id: 'teams',     name: 'Microsoft Teams',   category: 'Bureautique',  icon: '💬', package_id: 'Microsoft.Teams',                   publisher: 'Microsoft',   description: 'Messagerie et visioconférence' },
  { id: 'zoom',      name: 'Zoom',              category: 'Bureautique',  icon: '📹', package_id: 'Zoom.Zoom',                         publisher: 'Zoom',        description: 'Vidéoconférence professionnelle' },
  { id: 'libreoffice',name:'LibreOffice',       category: 'Bureautique',  icon: '📄', package_id: 'TheDocumentFoundation.LibreOffice', publisher: 'TDF',         description: 'Suite bureautique open-source' },
  { id: 'reader',    name: 'Adobe Acrobat Reader', category: 'Bureautique', icon: '📕', package_id: 'Adobe.Acrobat.Reader.64-bit',   publisher: 'Adobe',       description: 'Lecteur PDF gratuit' },
  { id: 'slack',     name: 'Slack',             category: 'Bureautique',  icon: '💼', package_id: 'SlackTechnologies.Slack',           publisher: 'Slack',       description: 'Messagerie d\'équipe' },
  // Sécurité
  { id: 'malwarebytes', name: 'Malwarebytes',   category: 'Sécurité',     icon: '🛡️', package_id: 'Malwarebytes.Malwarebytes',         publisher: 'Malwarebytes',description: 'Protection antimalware' },
  { id: 'bitwarden', name: 'Bitwarden',         category: 'Sécurité',     icon: '🔑', package_id: 'Bitwarden.Bitwarden',               publisher: 'Bitwarden',   description: 'Gestionnaire de mots de passe open-source' },
  { id: 'keepass',   name: 'KeePass',           category: 'Sécurité',     icon: '🗝️', package_id: 'DominikReichl.KeePass',             publisher: 'D.Reichl',    description: 'Gestionnaire de mots de passe local' },
  // Développement
  { id: 'vscode',    name: 'VS Code',           category: 'Développement',icon: '🔷', package_id: 'Microsoft.VisualStudioCode',         publisher: 'Microsoft',   description: 'Éditeur de code léger et extensible' },
  { id: 'git',       name: 'Git',               category: 'Développement',icon: '🌿', package_id: 'Git.Git',                           publisher: 'Git',         description: 'Gestionnaire de versions' },
  { id: 'nodejs',    name: 'Node.js LTS',       category: 'Développement',icon: '💚', package_id: 'OpenJS.NodeJS.LTS',                 publisher: 'OpenJS',      description: 'Runtime JavaScript' },
  { id: 'python',    name: 'Python 3',          category: 'Développement',icon: '🐍', package_id: 'Python.Python.3',                   publisher: 'Python.org',  description: 'Langage de programmation Python' },
  // Utilitaires
  { id: '7zip',      name: '7-Zip',             category: 'Utilitaires',  icon: '📦', package_id: '7zip.7zip',                         publisher: '7-Zip',       description: 'Archiveur gratuit haute compression' },
  { id: 'vlc',       name: 'VLC',               category: 'Utilitaires',  icon: '🎬', package_id: 'VideoLAN.VLC',                      publisher: 'VideoLAN',    description: 'Lecteur multimédia universel' },
  { id: 'notepadpp', name: 'Notepad++',         category: 'Utilitaires',  icon: '📝', package_id: 'Notepad++.Notepad++',               publisher: 'Notepad++',   description: 'Éditeur de texte avancé' },
  { id: 'winrar',    name: 'WinRAR',            category: 'Utilitaires',  icon: '🗜️', package_id: 'RARLab.WinRAR',                    publisher: 'RARLab',      description: 'Archiveur RAR/ZIP' },
  { id: 'greenshot', name: 'Greenshot',         category: 'Utilitaires',  icon: '📷', package_id: 'Greenshot.Greenshot',               publisher: 'Greenshot',   description: 'Capture d\'écran avancée' },
];

const CATEGORIES = ['Tous', ...Array.from(new Set(APP_CATALOG.map(a => a.category)))];

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Device { id: string; device_name: string; status: string; os: string; }
interface DeployRecord {
  id: string;
  device_id: string;
  device_name: string;
  command_type: string;
  params: { display_name?: string; package_id?: string };
  status: string;
  output?: string;
  created_at: string;
  executed_at?: string;
}

// ─── Composants utilitaires ────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:   'bg-yellow-100 text-yellow-700',
    executing: 'bg-blue-100 text-blue-700 animate-pulse',
    success:   'bg-green-100 text-green-700',
    failed:    'bg-red-100 text-red-700',
    timeout:   'bg-gray-100 text-gray-600',
  };
  const icons: Record<string, string> = {
    pending: '⏳', executing: '⚙️', success: '✅', failed: '❌', timeout: '⌛',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {icons[status] || '?'} {status}
    </span>
  );
}

// ─── Page principale ───────────────────────────────────────────────────────────
export default function Deploy() {
  const [category, setCategory]         = useState('Tous');
  const [search, setSearch]             = useState('');
  const [devices, setDevices]           = useState<Device[]>([]);
  const [selectedApp, setSelectedApp]   = useState<CatalogApp | null>(null);
  const [selectedDevices, setSelectedDevices] = useState<Set<string>>(new Set());
  const [deploying, setDeploying]       = useState(false);
  const [deployResult, setDeployResult] = useState<string | null>(null);
  const [history, setHistory]           = useState<DeployRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expandedRow, setExpandedRow]       = useState<string | null>(null);
  const [verifying, setVerifying]           = useState<string | null>(null);
  const [customUrl, setCustomUrl]       = useState('');
  const [customName, setCustomName]     = useState('');
  const [customArgs, setCustomArgs]     = useState('');
  const [tab, setTab]                   = useState<'catalog' | 'url'>('catalog');

  // Charger devices + historique
  const loadHistory = useCallback(async () => {
    try {
      const res = await deployAPI.history(50);
      setHistory((res.data.data as DeployRecord[]) || []);
    } catch {} finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => {
    deviceAPI.list({ limit: 200 }).then(r => setDevices((r.data.data as Device[]) || [])).catch(() => {});
    loadHistory();
  }, [loadHistory]);

  // Filtrage catalogue
  const filtered = APP_CATALOG.filter(a => {
    const matchCat = category === 'Tous' || a.category === category;
    const matchSearch = !search || a.name.toLowerCase().includes(search.toLowerCase()) || a.package_id.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const toggleDevice = (id: string) =>
    setSelectedDevices(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const selectAllOnline = () =>
    setSelectedDevices(new Set(devices.filter(d => d.status === 'online').map(d => d.id)));

  // Déploiement catalogue
  const handleDeploy = async () => {
    if (!selectedApp || selectedDevices.size === 0) return;
    setDeploying(true);
    setDeployResult(null);
    try {
      const params: AppDeployParams = {
        method: 'winget',
        package_id: selectedApp.package_id,
        display_name: selectedApp.name,
      };
      await deployAPI.dispatch([...selectedDevices], params);
      setDeployResult(`✅ Déploiement de "${selectedApp.name}" envoyé sur ${selectedDevices.size} machine(s). L'installation démarrera dans les prochaines secondes.`);
      setSelectedDevices(new Set());
      setTimeout(loadHistory, 3000);
    } catch (e) {
      setDeployResult(`❌ Erreur lors de l'envoi du déploiement.`);
    } finally { setDeploying(false); }
  };

  // Déploiement URL personnalisée
  const handleDeployUrl = async () => {
    if (!customUrl || selectedDevices.size === 0) return;
    setDeploying(true);
    setDeployResult(null);
    try {
      const params: AppDeployParams = {
        method: 'url',
        url: customUrl,
        install_args: customArgs || undefined,
        display_name: customName || customUrl,
      };
      await deployAPI.dispatch([...selectedDevices], params);
      setDeployResult(`✅ Déploiement depuis URL envoyé sur ${selectedDevices.size} machine(s).`);
      setSelectedDevices(new Set());
      setCustomUrl(''); setCustomName(''); setCustomArgs('');
      setTimeout(loadHistory, 3000);
    } catch {
      setDeployResult(`❌ Erreur lors de l'envoi du déploiement.`);
    } finally { setDeploying(false); }
  };

  // Envoyer une commande check_app pour un déploiement de l'historique
  const handleVerify = async (h: DeployRecord) => {
    if (!h.params?.package_id) return;
    setVerifying(h.id);
    try {
      await commandAPI.queue(h.device_id, {
        command_type: 'check_app',
        params: { package_id: h.params.package_id, display_name: h.params.display_name || h.params.package_id },
      });
      setTimeout(loadHistory, 4000);
    } finally { setVerifying(null); }
  };

  const onlineDevices  = devices.filter(d => d.status === 'online');
  const offlineDevices = devices.filter(d => d.status !== 'online');

  return (
    <div className="space-y-5">

      {/* Onglets */}
      <div className="bg-white rounded-xl shadow p-1 flex gap-1 w-fit">
        {(['catalog', 'url'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${tab === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {t === 'catalog' ? '📦 Catalogue' : '🔗 URL personnalisée'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Panneau gauche : catalogue ou URL ────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {tab === 'catalog' ? (
            <>
              {/* Filtres */}
              <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-3 items-center">
                <input
                  type="text" placeholder="Rechercher..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm flex-1 min-w-[160px] focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <div className="flex flex-wrap gap-1">
                  {CATEGORIES.map(cat => (
                    <button key={cat} onClick={() => setCategory(cat)}
                      className={`text-xs px-3 py-1.5 rounded-full font-medium transition ${category === cat ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grille catalogue */}
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {filtered.map(app => (
                  <button key={app.id} onClick={() => setSelectedApp(selectedApp?.id === app.id ? null : app)}
                    className={`text-left border-2 rounded-xl p-4 transition hover:shadow-md ${selectedApp?.id === app.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}>
                    <div className="flex items-start gap-3">
                      <span className="text-2xl mt-0.5">{app.icon}</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm leading-tight">{app.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{app.publisher}</p>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{app.description}</p>
                        <span className="inline-block mt-2 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-mono">{app.package_id}</span>
                      </div>
                    </div>
                    {selectedApp?.id === app.id && (
                      <div className="mt-2 pt-2 border-t border-blue-200">
                        <p className="text-xs text-blue-600 font-semibold">✓ Sélectionné — choisissez les machines →</p>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </>
          ) : (
            /* ── URL personnalisée ────────────────────────────────────── */
            <div className="bg-white rounded-xl shadow p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">Déploiement depuis une URL</h3>
              <p className="text-sm text-gray-500">Télécharge et installe un .exe ou .msi depuis une URL directe. L'agent détecte automatiquement le type de fichier.</p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">URL du fichier *</label>
                  <input type="url" placeholder="https://example.com/installer.exe"
                    value={customUrl} onChange={e => setCustomUrl(e.target.value)}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Nom affiché</label>
                  <input type="text" placeholder="Mon Application 1.0"
                    value={customName} onChange={e => setCustomName(e.target.value)}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Arguments d'installation</label>
                  <input type="text" placeholder="/S (auto-détecté si vide)"
                    value={customArgs} onChange={e => setCustomArgs(e.target.value)}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300" />
                  <p className="text-xs text-gray-400 mt-1">EXE : <code>/S</code> ou <code>/silent</code> · MSI : <code>/qn /norestart</code></p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Panneau droit : sélection machines + déploiement ─────────── */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800 text-sm">Machines cibles</h3>
              <button onClick={selectAllOnline}
                className="text-xs text-blue-600 hover:underline font-medium">
                Tout en ligne ({onlineDevices.length})
              </button>
            </div>

            {devices.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Aucune machine enregistrée</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {onlineDevices.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-green-600 uppercase tracking-wide px-1 mt-1">En ligne</p>
                    {onlineDevices.map(d => (
                      <label key={d.id} className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer transition ${selectedDevices.has(d.id) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={selectedDevices.has(d.id)} onChange={() => toggleDevice(d.id)}
                          className="rounded border-gray-300 text-blue-600" />
                        <span className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{d.device_name}</p>
                          <p className="text-xs text-gray-400 truncate">{d.os}</p>
                        </div>
                      </label>
                    ))}
                  </>
                )}
                {offlineDevices.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mt-2">Hors ligne</p>
                    {offlineDevices.map(d => (
                      <label key={d.id} className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer opacity-50 transition ${selectedDevices.has(d.id) ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'}`}>
                        <input type="checkbox" checked={selectedDevices.has(d.id)} onChange={() => toggleDevice(d.id)}
                          className="rounded border-gray-300 text-blue-600" />
                        <span className="h-2 w-2 rounded-full bg-gray-400 flex-shrink-0" />
                        <p className="text-sm text-gray-600 truncate">{d.device_name}</p>
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}

            <div className="mt-4 pt-3 border-t">
              {selectedDevices.size > 0 && (
                <p className="text-xs text-blue-600 font-medium mb-2">
                  {selectedDevices.size} machine(s) sélectionnée(s)
                </p>
              )}

              {tab === 'catalog' ? (
                <button
                  onClick={handleDeploy}
                  disabled={!selectedApp || selectedDevices.size === 0 || deploying}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition text-sm">
                  {deploying ? '⏳ Envoi...' : selectedApp ? `🚀 Installer ${selectedApp.name}` : '← Choisir une app'}
                </button>
              ) : (
                <button
                  onClick={handleDeployUrl}
                  disabled={!customUrl || selectedDevices.size === 0 || deploying}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition text-sm">
                  {deploying ? '⏳ Envoi...' : '🚀 Déployer depuis URL'}
                </button>
              )}

              {deployResult && (
                <div className={`mt-3 p-3 rounded-lg text-xs ${deployResult.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {deployResult}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Historique des déploiements ────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">Historique des déploiements</h3>
          <button onClick={loadHistory} className="text-xs text-blue-600 hover:underline">↻ Actualiser</button>
        </div>

        {historyLoading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Chargement...</div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">Aucun déploiement pour le moment</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b">
                  <th className="px-5 py-3">Application</th>
                  <th className="px-5 py-3">Machine</th>
                  <th className="px-5 py-3">Type</th>
                  <th className="px-5 py-3">Statut</th>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map(h => {
                  const isExpanded = expandedRow === h.id;
                  // Détecter si la vérif est positive/négative depuis l'output
                  const outputVerified = h.output?.includes('VÉRIFIÉ installé') || h.output?.includes('est INSTALLÉ');
                  const outputFailed   = h.output?.includes('n\'est PAS installé') || h.status === 'failed';
                  return (
                    <>
                      <tr key={h.id} className={`hover:bg-gray-50 ${isExpanded ? 'bg-blue-50' : ''}`}>
                        <td className="px-5 py-3 font-medium text-gray-900">
                          {h.params?.display_name || h.params?.package_id || '—'}
                        </td>
                        <td className="px-5 py-3 text-gray-600">{h.device_name}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${h.command_type === 'install_app' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                            {h.command_type === 'install_app' ? '📦 install' : '🗑 uninstall'}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <StatusBadge status={h.status} />
                            {h.status === 'success' && outputVerified && (
                              <span className="text-xs text-green-600 font-semibold">✓ vérifié</span>
                            )}
                            {h.status === 'success' && outputFailed && (
                              <span className="text-xs text-orange-500 font-semibold">⚠️ non vérifié</span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-gray-400 text-xs">
                          {new Date(h.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {h.output && (
                              <button onClick={() => setExpandedRow(isExpanded ? null : h.id)}
                                className="text-xs text-blue-600 hover:underline font-medium">
                                {isExpanded ? '▲ Masquer' : '▼ Output'}
                              </button>
                            )}
                            {h.params?.package_id && (
                              <button
                                onClick={() => handleVerify(h)}
                                disabled={verifying === h.id}
                                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded font-medium transition disabled:opacity-50">
                                {verifying === h.id ? '⏳' : '🔍 Vérifier'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && h.output && (
                        <tr key={`${h.id}-expanded`} className="bg-gray-50">
                          <td colSpan={6} className="px-5 py-3">
                            <pre className={`text-xs rounded-lg p-3 whitespace-pre-wrap font-mono max-h-64 overflow-y-auto border ${
                              outputVerified ? 'bg-green-50 border-green-200 text-green-800' :
                              outputFailed   ? 'bg-red-50 border-red-200 text-red-800' :
                                               'bg-gray-900 border-gray-700 text-green-400'
                            }`}>
                              {h.output}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
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
