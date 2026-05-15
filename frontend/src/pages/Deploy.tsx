import { useEffect, useState, useCallback, useRef } from 'react';
import { deployAPI, deviceAPI, commandAPI, AppDeployParams } from '../api/client';

// ─── Parser inventaire logiciels ─────────────────────────────────────────────
interface InstalledApp { name: string; version: string; publisher: string; install_date: string; id: string; available: string; }

/** Tente JSON (registre Windows) puis fallback texte (winget list) */
function parseAppsOutput(raw: string): InstalledApp[] {
  const trimmed = raw.trim();

  // ── Mode JSON (registre PowerShell) ──────────────────────────────────────
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      return arr
        .filter((a: Record<string,string>) => a.name)
        .map((a: Record<string,string>) => ({
          name:         a.name         || '',
          version:      a.version      || '',
          publisher:    a.publisher    || '',
          install_date: a.install_date || '',
          id:           '',   // registre n'a pas d'ID winget
          available:    '',
        }));
    } catch { /* fallback */ }
  }

  // ── Mode texte (winget list) ──────────────────────────────────────────────
  const lines = raw.split('\n');
  const sepIdx = lines.findIndex(l => /^-[\-\s]+$/.test(l.trim()));
  if (sepIdx < 1) return [];
  const sep = lines[sepIdx];
  const cols: number[] = [];
  let inDash = false;
  for (let i = 0; i < sep.length; i++) {
    if (sep[i] === '-' && !inDash) { cols.push(i); inDash = true; }
    if (sep[i] === ' ' && inDash)  { inDash = false; }
  }
  const extract = (line: string, ci: number) => {
    const start = cols[ci] ?? 0;
    const end   = cols[ci + 1] ?? line.length;
    return line.substring(start, end).trim();
  };
  return lines.slice(sepIdx + 1)
    .filter(l => l.trim() && !/^[\-\s]+$/.test(l.trim()))
    .map(l => ({
      name:         extract(l, 0),
      id:           extract(l, 1),
      version:      extract(l, 2),
      available:    extract(l, 3),
      publisher:    '',
      install_date: '',
    }))
    .filter(a => a.name);
}

function exportCSV(apps: InstalledApp[], deviceName: string) {
  const header = 'Nom,Version,Éditeur,Date installation,ID winget,Mise à jour disponible';
  const rows = apps.map(a =>
    [a.name, a.version, a.publisher, a.install_date, a.id, a.available]
      .map(v => `"${(v || '').replace(/"/g, '""')}"`)
      .join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `inventaire-${deviceName}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

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
  { id: 'adwcleaner',   name: 'ADWCleaner',      category: 'Sécurité',     icon: '🧹', package_id: 'Malwarebytes.AdwCleaner',   publisher: 'Malwarebytes',description: 'Nettoyeur PUP/adware — scan RMM + quarantaine à distance' },
  { id: 'malwarebytes', name: 'Malwarebytes',   category: 'Sécurité',     icon: '🛡️', package_id: 'Malwarebytes.Malwarebytes',         publisher: 'Malwarebytes',description: 'Protection antimalware' },
  { id: 'bitwarden', name: 'Bitwarden',         category: 'Sécurité',     icon: '🔑', package_id: 'Bitwarden.Bitwarden',               publisher: 'Bitwarden',   description: 'Gestionnaire de mots de passe open-source' },
  { id: 'keepass',   name: 'KeePass',           category: 'Sécurité',     icon: '🗝️', package_id: 'DominikReichl.KeePass',             publisher: 'D.Reichl',    description: 'Gestionnaire de mots de passe local' },
  // Développement
  { id: 'vscode',    name: 'VS Code',           category: 'Développement',icon: '🔷', package_id: 'Microsoft.VisualStudioCode',         publisher: 'Microsoft',   description: 'Éditeur de code léger et extensible' },
  { id: 'git',       name: 'Git',               category: 'Développement',icon: '🌿', package_id: 'Git.Git',                           publisher: 'Git',         description: 'Gestionnaire de versions' },
  { id: 'nodejs',    name: 'Node.js LTS',       category: 'Développement',icon: '💚', package_id: 'OpenJS.NodeJS.LTS',                 publisher: 'OpenJS',      description: 'Runtime JavaScript' },
  { id: 'python',    name: 'Python 3',          category: 'Développement',icon: '🐍', package_id: 'Python.Python.3',                   publisher: 'Python.org',  description: 'Langage de programmation Python' },
  // Intelligence Artificielle
  { id: 'chatgpt',    name: 'ChatGPT',            category: 'Intelligence Artificielle', icon: '🤖', package_id: '9NTM2QC6QWS7',               publisher: 'OpenAI',      description: 'Assistant IA conversationnel — app officielle OpenAI' },
  { id: 'claude',     name: 'Claude',             category: 'Intelligence Artificielle', icon: '🧠', package_id: 'Anthropic.Claude',             publisher: 'Anthropic',   description: 'Assistant IA Anthropic — raisonnement avancé' },
  { id: 'copilot',    name: 'Microsoft Copilot',  category: 'Intelligence Artificielle', icon: '🪟', package_id: '9NHT9RB2F4HD',                publisher: 'Microsoft',   description: 'IA intégrée à Windows & Microsoft 365' },
  { id: 'perplexity', name: 'Perplexity AI',      category: 'Intelligence Artificielle', icon: '🔍', package_id: 'Perplexity.Perplexity',        publisher: 'Perplexity',  description: 'Moteur de recherche IA avec sources citées' },
  { id: 'ollama',     name: 'Ollama',             category: 'Intelligence Artificielle', icon: '🦙', package_id: 'Ollama.Ollama',                publisher: 'Ollama',      description: 'Exécution locale de modèles IA (Llama, Mistral...)' },
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
  const [catalogMode, setCatalogMode]   = useState<'install' | 'uninstall'>('install');
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
  const [tab, setTab]                   = useState<'catalog' | 'url' | 'inventory'>('catalog');
  // ── Inventaire ──
  const [invDeviceId, setInvDeviceId]   = useState('');
  const [invScanning, setInvScanning]   = useState(false);
  const [invApps, setInvApps]           = useState<InstalledApp[] | null>(null);
  const [invRaw, setInvRaw]             = useState('');
  const [invSearch, setInvSearch]       = useState('');
  const [invError, setInvError]         = useState('');
  const pollRef                         = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Déploiement/désinstallation catalogue
  const handleDeploy = async () => {
    if (!selectedApp || selectedDevices.size === 0) return;
    setDeploying(true);
    setDeployResult(null);
    const isUninstall = catalogMode === 'uninstall';
    try {
      const params: AppDeployParams = {
        method: 'winget',
        package_id: selectedApp.package_id,
        display_name: selectedApp.name,
      };
      if (isUninstall) {
        await deployAPI.dispatchUninstall([...selectedDevices], { package_id: selectedApp.package_id, display_name: selectedApp.name });
      } else {
        await deployAPI.dispatch([...selectedDevices], params);
      }
      const verb = isUninstall ? 'Désinstallation' : 'Déploiement';
      setDeployResult(`✅ ${verb} de "${selectedApp.name}" envoyé sur ${selectedDevices.size} machine(s).`);
      setSelectedDevices(new Set());
      setTimeout(loadHistory, 3000);
    } catch (e) {
      setDeployResult(`❌ Erreur lors de l'envoi.`);
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

  // ── Scanner un device : list_installed_apps + polling résultat ──────────────
  const handleScan = useCallback(async () => {
    if (!invDeviceId) return;
    setInvScanning(true);
    setInvApps(null);
    setInvRaw('');
    setInvError('');

    // Envoyer la commande
    const sentAt = Date.now();
    try {
      await commandAPI.queue(invDeviceId, { command_type: 'list_installed_apps', params: {} });
    } catch {
      setInvError('Impossible d\'envoyer la commande à cet appareil.');
      setInvScanning(false);
      return;
    }

    // Polling toutes les 2s, max 90s
    let elapsed = 0;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      elapsed += 2;
      if (elapsed > 90) {
        clearInterval(pollRef.current!);
        setInvScanning(false);
        setInvError('Timeout : l\'appareil n\'a pas répondu dans les 90 secondes.');
        return;
      }
      try {
        const res = await commandAPI.getHistory(invDeviceId, 20);
        const cmds = (res.data.data as Record<string, unknown>[]) || [];
        const found = cmds.find(c =>
          c.command_type === 'list_installed_apps' &&
          new Date(c.created_at as string).getTime() >= sentAt - 5000 &&
          (c.status === 'success' || c.status === 'failed')
        );
        if (found) {
          clearInterval(pollRef.current!);
          setInvScanning(false);
          if (found.status === 'failed') {
            setInvError(`Échec : ${found.output || 'Erreur inconnue'}`);
          } else {
            const raw = (found.output as string) || '';
            setInvRaw(raw);
            setInvApps(parseAppsOutput(raw));
          }
        }
      } catch {}
    }, 2000);
  }, [invDeviceId]);

  // Nettoyage polling au démontage
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

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
        {([['catalog','📦 Catalogue'], ['url','🔗 URL personnalisée'], ['inventory','🗂 Inventaire']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${tab === t ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Onglet Inventaire (pleine largeur) ─────────────────────────── */}
      {tab === 'inventory' && (
        <div className="space-y-4">
          {/* Sélecteur de machine */}
          <div className="bg-white rounded-xl shadow p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Scanner les logiciels installés</h3>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Machine</label>
                <select value={invDeviceId} onChange={e => { setInvDeviceId(e.target.value); setInvApps(null); setInvError(''); }}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
                  <option value="">— Choisir une machine —</option>
                  {devices.filter(d => d.status === 'online').map(d => (
                    <option key={d.id} value={d.id}>{d.device_name} ({d.os})</option>
                  ))}
                  {devices.filter(d => d.status !== 'online').length > 0 && (
                    <optgroup label="Hors ligne">
                      {devices.filter(d => d.status !== 'online').map(d => (
                        <option key={d.id} value={d.id} disabled>{d.device_name} (hors ligne)</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <button onClick={handleScan} disabled={!invDeviceId || invScanning}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition text-sm">
                {invScanning ? (
                  <span className="flex items-center gap-2"><span className="animate-spin">⚙️</span> Scan en cours...</span>
                ) : '🔍 Scanner'}
              </button>
              {invApps && (
                <button onClick={() => exportCSV(invApps, devices.find(d => d.id === invDeviceId)?.device_name || invDeviceId)}
                  className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition text-sm">
                  ⬇ Export CSV
                </button>
              )}
            </div>
            {invScanning && (
              <p className="mt-3 text-xs text-blue-500 animate-pulse">
                ⏳ En attente de la réponse de l'agent (jusqu'à 90s selon le nombre de logiciels)...
              </p>
            )}
            {invError && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">{invError}</div>
            )}
          </div>

          {/* Résultats */}
          {invApps !== null && (
            <div className="bg-white rounded-xl shadow">
              <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
                <div>
                  <h3 className="font-semibold text-gray-800">
                    {devices.find(d => d.id === invDeviceId)?.device_name} — {invApps.length} logiciels
                  </h3>
                  {invApps.some(a => a.available) && (
                    <p className="text-xs text-orange-500 font-medium mt-0.5">
                      ⬆ {invApps.filter(a => a.available).length} mise(s) à jour disponible(s)
                    </p>
                  )}
                </div>
                <input type="text" placeholder="Filtrer..." value={invSearch}
                  onChange={e => setInvSearch(e.target.value)}
                  className="ml-auto border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 w-64" />
              </div>

              {invApps.length === 0 ? (
                <div className="p-6 text-center text-gray-400 text-sm">
                  <p>Aucun logiciel parsé.</p>
                  <details className="mt-2 text-left">
                    <summary className="cursor-pointer text-xs text-gray-400">Voir la sortie brute</summary>
                    <pre className="mt-2 text-xs bg-gray-900 text-green-400 p-3 rounded overflow-auto max-h-48">{invRaw}</pre>
                  </details>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b bg-gray-50">
                        <th className="px-5 py-3">Nom</th>
                        <th className="px-5 py-3">Éditeur</th>
                        <th className="px-5 py-3">Version</th>
                        <th className="px-5 py-3">Date install.</th>
                        <th className="px-5 py-3">Mise à jour</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {invApps
                        .filter(a => !invSearch || a.name.toLowerCase().includes(invSearch.toLowerCase()) || a.id.toLowerCase().includes(invSearch.toLowerCase()))
                        .map((a, i) => (
                          <tr key={i} className={`hover:bg-gray-50 ${a.available ? 'bg-orange-50' : ''}`}>
                            <td className="px-5 py-2.5 font-medium text-gray-900">{a.name || '—'}</td>
                            <td className="px-5 py-2.5 text-gray-500 text-xs">{a.publisher || (a.id ? <span className="font-mono">{a.id}</span> : '—')}</td>
                            <td className="px-5 py-2.5 text-gray-600 text-xs">{a.version || '—'}</td>
                            <td className="px-5 py-2.5 text-gray-400 text-xs">{a.install_date || '—'}</td>
                            <td className="px-5 py-2.5">
                              {a.available ? (
                                <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
                                  ⬆ {a.available}
                                </span>
                              ) : a.id ? (
                                <span className="text-xs text-green-600">✓ à jour</span>
                              ) : '—'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-5 ${tab === 'inventory' ? 'hidden' : ''}`}>

        {/* ── Panneau gauche : catalogue ou URL ────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {tab === 'catalog' ? (
            <>
              {/* Toggle Installer / Désinstaller + Filtres */}
              <div className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-3 items-center">
                {/* Mode toggle */}
                <div className="flex rounded-lg overflow-hidden border border-gray-200 shrink-0">
                  <button onClick={() => setCatalogMode('install')}
                    className={`px-4 py-2 text-sm font-semibold transition ${catalogMode === 'install' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    ⬇ Installer
                  </button>
                  <button onClick={() => setCatalogMode('uninstall')}
                    className={`px-4 py-2 text-sm font-semibold transition ${catalogMode === 'uninstall' ? 'bg-red-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                    🗑 Désinstaller
                  </button>
                </div>
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
              {catalogMode === 'uninstall' && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                  <span className="text-lg">⚠️</span>
                  <span>Mode désinstallation actif — sélectionnez une application et des machines pour envoyer la commande de suppression.</span>
                </div>
              )}

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
                  className={`w-full disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition text-sm ${catalogMode === 'uninstall' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                  {deploying ? '⏳ Envoi...' : selectedApp
                    ? catalogMode === 'uninstall'
                      ? `🗑 Désinstaller ${selectedApp.name}`
                      : `🚀 Installer ${selectedApp.name}`
                    : '← Choisir une app'}
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
      <div className={`bg-white rounded-xl shadow ${tab === 'inventory' ? 'hidden' : ''}`}>
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
