import { useEffect, useState } from 'react';
import { getApiClient } from '../api/client';

interface Tenant {
  id: string;
  name: string;
  office365_tenant_id?: string;
  subscription_tier: string;
  device_count: number;
  created_at: string;
  updated_at: string;
}

const TIERS = ['starter', 'professional', 'enterprise', 'demo', 'trial'];

export default function Tenants() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create dialog
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newO365Id, setNewO365Id] = useState('');
  const [newTier, setNewTier] = useState('starter');

  // Edit dialog
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [editName, setEditName] = useState('');
  const [editO365Id, setEditO365Id] = useState('');
  const [editTier, setEditTier] = useState('');
  const [saving, setSaving] = useState(false);

  // Agent config panel
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const resp = await getApiClient().get('/api/tenants');
      setTenants(resp.data.data || []);
    } catch {
      setError('Impossible de charger les tenants.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const createTenant = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await getApiClient().post('/api/tenants', {
        name: newName.trim(),
        office365_tenant_id: newO365Id.trim() || undefined,
        subscription_tier: newTier,
      });
      setNewName('');
      setNewO365Id('');
      setNewTier('starter');
      setShowCreate(false);
      await load();
    } catch {
      alert('Erreur lors de la création du tenant.');
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (t: Tenant) => {
    setEditing(t);
    setEditName(t.name);
    setEditO365Id(t.office365_tenant_id || '');
    setEditTier(t.subscription_tier);
  };

  const saveTenant = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await getApiClient().patch(`/api/tenants/${editing.id}`, {
        name: editName.trim(),
        office365_tenant_id: editO365Id.trim() || undefined,
        subscription_tier: editTier,
      });
      setEditing(null);
      await load();
    } catch {
      alert('Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  };

  const tierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      enterprise:   'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
      professional: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
      starter:      'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
      demo:         'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
      trial:        'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
    };
    return (
      <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase ${colors[tier] || colors.demo}`}>
        {tier}
      </span>
    );
  };

  // ── Agent config block ──────────────────────────────────────────────────────
  const AgentPanel = ({ t }: { t: Tenant }) => {
    const [copied, setCopied] = useState('');
    const backendUrl = import.meta.env.VITE_API_URL || 'https://backend-rmm.vercel.app';

    const copy = (val: string, key: string) => {
      navigator.clipboard.writeText(val).then(() => {
        setCopied(key);
        setTimeout(() => setCopied(''), 2000);
      });
    };

    const agentSnippet =
`// Ajouter au début de agent.js (ou agent-NomDuPC.js) :
const TENANT_ID = '${t.id}'; // ${t.name}
const BACKEND_URL = '${backendUrl}';

// Dans la fonction loginAndGetToken() :
// body: JSON.stringify({ username: 'admin', password: 'demo123', tenant_id: TENANT_ID })`;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Config agent — {t.name}</h2>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">Identifiants à intégrer dans l'agent Windows pour ce client</p>
            </div>
            <button onClick={() => setSelectedTenant(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-slate-200 text-2xl leading-none">&times;</button>
          </div>
          <div className="p-6 space-y-4">
            {/* Tenant ID */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase mb-1">Tenant ID (Supabase)</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-100 dark:bg-slate-900 text-gray-800 dark:text-green-400 text-sm px-3 py-2 rounded font-mono break-all">
                  {t.id}
                </code>
                <button
                  onClick={() => copy(t.id, 'tid')}
                  className="shrink-0 px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition"
                >
                  {copied === 'tid' ? '✓ Copié' : 'Copier'}
                </button>
              </div>
            </div>

            {/* O365 tenant ID */}
            {t.office365_tenant_id && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase mb-1">Tenant Azure AD</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-gray-100 dark:bg-slate-900 text-gray-800 dark:text-green-400 text-sm px-3 py-2 rounded font-mono break-all">
                    {t.office365_tenant_id}
                  </code>
                  <button
                    onClick={() => copy(t.office365_tenant_id!, 'o365')}
                    className="shrink-0 px-3 py-2 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition"
                  >
                    {copied === 'o365' ? '✓ Copié' : 'Copier'}
                  </button>
                </div>
              </div>
            )}

            {/* Code snippet */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase mb-1">Extrait de code agent</label>
              <div className="relative">
                <pre className="bg-gray-900 text-green-400 text-xs px-4 py-3 rounded overflow-x-auto whitespace-pre-wrap leading-relaxed">
                  {agentSnippet}
                </pre>
                <button
                  onClick={() => copy(agentSnippet, 'snippet')}
                  className="absolute top-2 right-2 px-2 py-1 bg-gray-700 text-gray-300 hover:bg-gray-600 text-xs rounded transition"
                >
                  {copied === 'snippet' ? '✓ Copié' : 'Copier'}
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-sm text-blue-800 dark:text-blue-300">
              <p className="font-semibold mb-2">Comment déployer l'agent sur les PC de ce client :</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Copier le dossier <code>agent-windows/</code> sur le PC du client</li>
                <li>Dans <code>agent.js</code>, ajouter le <strong>TENANT_ID</strong> ci-dessus à la constante <code>TENANT_ID</code></li>
                <li>S'assurer que <code>BACKEND_URL</code> pointe vers le backend Vercel</li>
                <li>Exécuter <code>install-tray.bat</code> en tant qu'administrateur</li>
              </ol>
            </div>
          </div>
          <div className="flex justify-end px-6 py-4 border-t border-gray-200 dark:border-slate-700">
            <button onClick={() => setSelectedTenant(null)} className="px-4 py-2 bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-slate-500 transition text-sm">
              Fermer
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Gestion des tenants</h1>
          <p className="text-gray-500 dark:text-slate-400 mt-1 text-sm">
            Gérez vos entreprises clientes — chaque tenant a ses propres appareils, alertes et données.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-semibold"
        >
          <span>+</span> Nouveau tenant
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mr-3" />
          <span className="text-gray-500 dark:text-slate-400">Chargement…</span>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow overflow-hidden">
          {tenants.length === 0 ? (
            <div className="text-center py-16 text-gray-400 dark:text-slate-500">
              <div className="text-5xl mb-4">🏢</div>
              <p className="text-lg font-semibold mb-2">Aucun tenant configuré</p>
              <p className="text-sm">Créez votre premier tenant pour commencer à gérer un parc client.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-slate-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Entreprise</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Tenant Azure AD</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Abonnement</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Appareils</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30 transition">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900 dark:text-white">{t.name}</div>
                      <div className="text-xs text-gray-400 dark:text-slate-500 font-mono mt-0.5 truncate max-w-xs">{t.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      {t.office365_tenant_id ? (
                        <span className="text-xs font-mono text-gray-600 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded">
                          {t.office365_tenant_id}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-slate-500 italic">Non configuré</span>
                      )}
                    </td>
                    <td className="px-6 py-4">{tierBadge(t.subscription_tier)}</td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold text-sm">
                        {t.device_count}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setSelectedTenant(t)}
                          className="px-3 py-1.5 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-800/40 transition font-semibold"
                        >
                          📦 Config agent
                        </button>
                        <button
                          onClick={() => startEdit(t)}
                          className="px-3 py-1.5 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40 transition font-semibold"
                        >
                          ✏️ Modifier
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Create dialog ───────────────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Nouveau tenant</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Nom de l'entreprise <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Ex: Cabinet Dupont & Associés"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
                  Tenant ID Azure AD / Office 365
                  <span className="text-xs text-gray-400 dark:text-slate-500 font-normal ml-1">(optionnel)</span>
                </label>
                <input
                  type="text"
                  value={newO365Id}
                  onChange={e => setNewO365Id(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">
                  Visible dans le portail Azure → Propriétés du tenant
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Abonnement</label>
                <select
                  value={newTier}
                  onChange={e => setNewTier(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-slate-700">
              <button
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 text-sm bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-slate-500 transition"
              >
                Annuler
              </button>
              <button
                onClick={createTenant}
                disabled={!newName.trim() || creating}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition font-semibold"
              >
                {creating ? 'Création…' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit dialog ─────────────────────────────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Modifier : {editing.name}</h2>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Nom</label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Tenant ID Azure AD</label>
                <input
                  type="text"
                  value={editO365Id}
                  onChange={e => setEditO365Id(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Abonnement</label>
                <select
                  value={editTier}
                  onChange={e => setEditTier(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-slate-700">
              <button
                onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm bg-gray-200 dark:bg-slate-600 text-gray-700 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-slate-500 transition"
              >
                Annuler
              </button>
              <button
                onClick={saveTenant}
                disabled={!editName.trim() || saving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition font-semibold"
              >
                {saving ? 'Sauvegarde…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Agent config panel ───────────────────────────────────────────────── */}
      {selectedTenant && <AgentPanel t={selectedTenant} />}
    </div>
  );
}
