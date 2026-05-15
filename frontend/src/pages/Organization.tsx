import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApiClient } from '../hooks/useApi';
import { orgAPI, deviceAPI } from '../api/client';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Organization {
  id: string; name: string; type: string; description?: string;
  address?: string; city?: string; country?: string; phone?: string; website?: string;
}
interface Site {
  id: string; name: string; organization_id: string | null;
  address?: string; city?: string; postal_code?: string; country?: string;
}
interface Department {
  id: string; name: string; organization_id: string | null;
  site_id: string | null; description?: string;
}
interface Device {
  id: string; device_name: string; status: string;
  organization_id: string | null; site_id: string | null; department_id: string | null;
}
type NodeType = 'org' | 'site' | 'dept';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );
}
function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Organization() {
  const { isReady } = useApiClient();
  const navigate = useNavigate();

  const [orgs, setOrgs]   = useState<Organization[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [depts, setDepts] = useState<Department[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  // Tree expand state
  const [expandedOrgs,  setExpandedOrgs]  = useState<Set<string>>(new Set());
  const [expandedSites, setExpandedSites] = useState<Set<string>>(new Set());

  // Selection
  const [selType, setSelType] = useState<NodeType | 'new_org' | 'new_site' | 'new_dept' | null>(null);
  const [selId,   setSelId]   = useState<string | null>(null);

  // Form
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg]       = useState<string | null>(null);
  const [delConfirm, setDelConfirm] = useState(false);

  // ── Assignment panel state ──
  const [assignDeviceId, setAssignDeviceId] = useState('');
  const [assignOrgId,    setAssignOrgId]    = useState('');
  const [assignSiteId,   setAssignSiteId]   = useState('');
  const [assignDeptId,   setAssignDeptId]   = useState('');
  const [assignNotes,    setAssignNotes]    = useState('');
  const [assignSaving,   setAssignSaving]   = useState(false);
  const [assignMsg,      setAssignMsg]      = useState<string | null>(null);

  // ── Load all data ─────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [orgsR, sitesR, deptsR, devsR] = await Promise.all([
        orgAPI.listOrgs(), orgAPI.listSites(), orgAPI.listDepts(),
        deviceAPI.list({ limit: 500 }),
      ]);
      setOrgs((orgsR.data.data  || []) as Organization[]);
      setSites((sitesR.data.data || []) as Site[]);
      setDepts((deptsR.data.data || []) as Department[]);
      setDevices((devsR.data.data  || []) as Device[]);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { if (isReady) loadAll(); }, [isReady, loadAll]);

  // ── Selection helpers ─────────────────────────────────────────────────────
  function selectOrg(id: string) {
    setSelType('org'); setSelId(id); setDelConfirm(false); setMsg(null);
    const o = orgs.find(x => x.id === id);
    setForm(o ? { name: o.name||'', type: o.type||'company', description: o.description||'', city: o.city||'', country: o.country||'France', phone: o.phone||'', website: o.website||'' } : {});
  }
  function selectSite(id: string) {
    setSelType('site'); setSelId(id); setDelConfirm(false); setMsg(null);
    const s = sites.find(x => x.id === id);
    setForm(s ? { name: s.name||'', organization_id: s.organization_id||'', address: s.address||'', city: s.city||'', postal_code: s.postal_code||'', country: s.country||'France' } : {});
  }
  function selectDept(id: string) {
    setSelType('dept'); setSelId(id); setDelConfirm(false); setMsg(null);
    const d = depts.find(x => x.id === id);
    setForm(d ? { name: d.name||'', organization_id: d.organization_id||'', site_id: d.site_id||'', description: d.description||'' } : {});
  }
  function newOrg()  { setSelType('new_org');  setSelId(null); setDelConfirm(false); setMsg(null); setForm({ name:'', type:'company', description:'', city:'', country:'France', phone:'', website:'' }); }
  function newSite(orgId='') { setSelType('new_site'); setSelId(null); setDelConfirm(false); setMsg(null); setForm({ name:'', organization_id: orgId, address:'', city:'', postal_code:'', country:'France' }); }
  function newDept(orgId='', siteId='') { setSelType('new_dept'); setSelId(null); setDelConfirm(false); setMsg(null); setForm({ name:'', organization_id: orgId, site_id: siteId, description:'' }); }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function save() {
    setSaving(true); setMsg(null);
    try {
      const f: Record<string, unknown> = {};
      Object.entries(form).forEach(([k, v]) => { f[k] = v || null; });
      f.name = form.name; // always keep name as string

      if (selType === 'new_org') {
        const r = await orgAPI.createOrg(f);
        const n = r.data.data as unknown as Organization;
        setOrgs(p => [...p, n]); selectOrg(n.id); setExpandedOrgs(p => new Set([...p, n.id]));
      } else if (selType === 'new_site') {
        const r = await orgAPI.createSite(f);
        const n = r.data.data as unknown as Site;
        setSites(p => [...p, n]); selectSite(n.id);
      } else if (selType === 'new_dept') {
        const r = await orgAPI.createDept(f);
        const n = r.data.data as unknown as Department;
        setDepts(p => [...p, n]); selectDept(n.id);
      } else if (selType === 'org' && selId) {
        const r = await orgAPI.updateOrg(selId, f);
        const n = r.data.data as unknown as Organization;
        setOrgs(p => p.map(x => x.id === selId ? n : x));
      } else if (selType === 'site' && selId) {
        const r = await orgAPI.updateSite(selId, f);
        const n = r.data.data as unknown as Site;
        setSites(p => p.map(x => x.id === selId ? n : x));
      } else if (selType === 'dept' && selId) {
        const r = await orgAPI.updateDept(selId, f);
        const n = r.data.data as unknown as Department;
        setDepts(p => p.map(x => x.id === selId ? n : x));
      }
      setMsg('✅ Enregistré');
    } catch { setMsg('❌ Erreur lors de la sauvegarde'); }
    setSaving(false);
  }

  async function deleteNode() {
    if (!selId) return;
    try {
      if (selType === 'org') { await orgAPI.deleteOrg(selId); setOrgs(p => p.filter(x => x.id !== selId)); setSites(p => p.filter(x => x.organization_id !== selId)); setDepts(p => p.filter(x => x.organization_id !== selId)); }
      else if (selType === 'site') { await orgAPI.deleteSite(selId); setSites(p => p.filter(x => x.id !== selId)); setDepts(p => p.filter(x => x.site_id !== selId)); }
      else if (selType === 'dept') { await orgAPI.deleteDept(selId); setDepts(p => p.filter(x => x.id !== selId)); }
      setSelType(null); setSelId(null); setDelConfirm(false);
    } catch { setMsg('❌ Erreur lors de la suppression'); }
  }

  // ── Assign device ─────────────────────────────────────────────────────────
  async function assignDevice() {
    if (!assignDeviceId) return;
    setAssignSaving(true); setAssignMsg(null);
    try {
      await orgAPI.assignDevice(assignDeviceId, {
        organization_id: assignOrgId || null,
        site_id: assignSiteId || null,
        department_id: assignDeptId || null,
        notes: assignNotes || undefined,
      });
      setDevices(p => p.map(d => d.id === assignDeviceId ? { ...d, organization_id: assignOrgId || null, site_id: assignSiteId || null, department_id: assignDeptId || null } : d));
      setAssignMsg('✅ Appareil assigné');
    } catch { setAssignMsg('❌ Erreur'); }
    setAssignSaving(false);
  }

  // ── Derived counts ────────────────────────────────────────────────────────
  const unassigned  = devices.filter(d => !d.organization_id).length;
  const devByOrg    = (id: string) => devices.filter(d => d.organization_id === id);
  const devBySite   = (id: string) => devices.filter(d => d.site_id === id);
  const devByDept   = (id: string) => devices.filter(d => d.department_id === id);
  const sitesByOrg  = (id: string) => sites.filter(s => s.organization_id === id);
  const deptsBySite = (id: string) => depts.filter(d => d.site_id === id);

  const isNew = selType === 'new_org' || selType === 'new_site' || selType === 'new_dept';

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Entreprises', value: orgs.length,   color: 'blue',   icon: '🏢' },
          { label: 'Sites',       value: sites.length,  color: 'green',  icon: '📍' },
          { label: 'Services',    value: depts.length,  color: 'purple', icon: '🏗️' },
          { label: 'Non assignés',value: unassigned,    color: unassigned > 0 ? 'red' : 'gray', icon: '⚠️' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-lg shadow p-4 flex items-center gap-3">
            <span className="text-2xl">{s.icon}</span>
            <div>
              <p className={`text-2xl font-bold text-${s.color}-600`}>{s.value}</p>
              <p className="text-sm text-gray-500">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main layout */}
      <div className="flex gap-6 items-start">
        {/* ── Tree panel ── */}
        <div className="w-72 shrink-0 bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <span className="font-semibold text-sm text-gray-700">Structure</span>
            <button onClick={newOrg} className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition">
              + Entreprise
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2" />Chargement...
            </div>
          ) : orgs.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              <p className="text-3xl mb-2">🏢</p>
              <p>Aucune entreprise</p>
              <button onClick={newOrg} className="mt-2 text-blue-600 text-xs hover:underline">Créer la première →</button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
              {orgs.map(org => (
                <div key={org.id}>
                  {/* Org row */}
                  <div
                    className={`flex items-center gap-1.5 px-3 py-2.5 cursor-pointer hover:bg-blue-50 transition select-none ${selId === org.id && selType === 'org' ? 'bg-blue-100 border-r-2 border-blue-500' : ''}`}
                    onClick={() => { selectOrg(org.id); setExpandedOrgs(p => { const n = new Set(p); n.has(org.id) ? n.delete(org.id) : n.add(org.id); return n; }); }}
                  >
                    <span className="text-gray-400 text-xs w-3 shrink-0">{expandedOrgs.has(org.id) ? '▼' : '▶'}</span>
                    <span>🏢</span>
                    <span className="text-sm font-medium text-gray-800 flex-1 truncate">{org.name}</span>
                    <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full shrink-0">{devByOrg(org.id).length}</span>
                  </div>

                  {/* Sites */}
                  {expandedOrgs.has(org.id) && (
                    <div>
                      {sitesByOrg(org.id).map(site => (
                        <div key={site.id}>
                          <div
                            className={`flex items-center gap-1.5 pl-7 pr-3 py-2 cursor-pointer hover:bg-green-50 transition select-none ${selId === site.id && selType === 'site' ? 'bg-green-100 border-r-2 border-green-500' : ''}`}
                            onClick={() => { selectSite(site.id); setExpandedSites(p => { const n = new Set(p); n.has(site.id) ? n.delete(site.id) : n.add(site.id); return n; }); }}
                          >
                            <span className="text-gray-400 text-xs w-3 shrink-0">{expandedSites.has(site.id) ? '▼' : '▶'}</span>
                            <span>📍</span>
                            <span className="text-sm text-gray-700 flex-1 truncate">{site.name}</span>
                            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full shrink-0">{devBySite(site.id).length}</span>
                          </div>

                          {/* Departments */}
                          {expandedSites.has(site.id) && (
                            <div>
                              {deptsBySite(site.id).map(dept => (
                                <div
                                  key={dept.id}
                                  className={`flex items-center gap-1.5 pl-14 pr-3 py-2 cursor-pointer hover:bg-purple-50 transition select-none ${selId === dept.id && selType === 'dept' ? 'bg-purple-100 border-r-2 border-purple-500' : ''}`}
                                  onClick={() => selectDept(dept.id)}
                                >
                                  <span>🏗️</span>
                                  <span className="text-sm text-gray-600 flex-1 truncate">{dept.name}</span>
                                  <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full shrink-0">{devByDept(dept.id).length}</span>
                                </div>
                              ))}
                              <div onClick={() => newDept(org.id, site.id)} className="flex items-center gap-1 pl-14 pr-3 py-1.5 text-xs text-purple-400 hover:text-purple-600 cursor-pointer">
                                <span>+</span><span>Ajouter un service</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      <div onClick={() => newSite(org.id)} className="flex items-center gap-1 pl-7 pr-3 py-1.5 text-xs text-green-400 hover:text-green-600 cursor-pointer">
                        <span>+</span><span>Ajouter un site</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right panel ── */}
        <div className="flex-1 min-w-0 space-y-4">
          {selType === null ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-5xl mb-4">🏢</p>
              <h3 className="text-lg font-semibold text-gray-700">Sélectionnez un élément</h3>
              <p className="text-sm text-gray-400 mt-2">Cliquez sur une entreprise, un site ou un service dans l'arbre à gauche pour le modifier, ou créez une nouvelle entreprise.</p>
              <button onClick={newOrg} className="mt-6 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold">
                + Nouvelle entreprise
              </button>
            </div>
          ) : (
            <>
              {/* Form card */}
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center gap-3 mb-5 border-b pb-4">
                  <span className="text-2xl">
                    {selType === 'org' || selType === 'new_org' ? '🏢' : selType === 'site' || selType === 'new_site' ? '📍' : '🏗️'}
                  </span>
                  <div>
                    <h2 className="text-base font-bold text-gray-800">
                      {isNew
                        ? `Nouveau${selType === 'new_org' ? 've entreprise' : selType === 'new_site' ? ' site' : ' service'}`
                        : (orgs.find(x => x.id === selId)?.name || sites.find(x => x.id === selId)?.name || depts.find(x => x.id === selId)?.name || '—')}
                    </h2>
                    <p className="text-xs text-gray-400">
                      {selType === 'org' || selType === 'new_org' ? 'Entreprise cliente' : selType === 'site' || selType === 'new_site' ? 'Site physique' : 'Service / Département'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Nom *" value={form.name || ''} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="Nom..." />

                  {/* Org-specific fields */}
                  {(selType === 'org' || selType === 'new_org') && <>
                    <Select label="Type" value={form.type || 'company'} onChange={v => setForm(f => ({ ...f, type: v }))} options={[
                      { value: 'company', label: 'Entreprise cliente' },
                      { value: 'internal', label: 'Interne (notre société)' },
                      { value: 'subsidiary', label: 'Filiale' },
                      { value: 'partner', label: 'Partenaire' },
                    ]} />
                    <Field label="Ville" value={form.city || ''} onChange={v => setForm(f => ({ ...f, city: v }))} placeholder="Paris" />
                    <Field label="Pays" value={form.country || ''} onChange={v => setForm(f => ({ ...f, country: v }))} placeholder="France" />
                    <Field label="Téléphone" value={form.phone || ''} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+33 1 23 45 67 89" />
                    <Field label="Site web" value={form.website || ''} onChange={v => setForm(f => ({ ...f, website: v }))} placeholder="https://..." />
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                      <textarea value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Notes internes..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </>}

                  {/* Site-specific fields */}
                  {(selType === 'site' || selType === 'new_site') && <>
                    <Select label="Entreprise" value={form.organization_id || ''} onChange={v => setForm(f => ({ ...f, organization_id: v }))} options={[{ value: '', label: '— Aucune —' }, ...orgs.map(o => ({ value: o.id, label: o.name }))]} />
                    <Field label="Adresse" value={form.address || ''} onChange={v => setForm(f => ({ ...f, address: v }))} placeholder="12 rue de la Paix" />
                    <Field label="Code postal" value={form.postal_code || ''} onChange={v => setForm(f => ({ ...f, postal_code: v }))} placeholder="75001" />
                    <Field label="Ville" value={form.city || ''} onChange={v => setForm(f => ({ ...f, city: v }))} placeholder="Paris" />
                    <Field label="Pays" value={form.country || ''} onChange={v => setForm(f => ({ ...f, country: v }))} placeholder="France" />
                  </>}

                  {/* Dept-specific fields */}
                  {(selType === 'dept' || selType === 'new_dept') && <>
                    <Select label="Entreprise" value={form.organization_id || ''} onChange={v => setForm(f => ({ ...f, organization_id: v, site_id: '' }))} options={[{ value: '', label: '— Aucune —' }, ...orgs.map(o => ({ value: o.id, label: o.name }))]} />
                    <Select label="Site" value={form.site_id || ''} onChange={v => setForm(f => ({ ...f, site_id: v }))} options={[{ value: '', label: '— Aucun —' }, ...sites.filter(s => !form.organization_id || s.organization_id === form.organization_id).map(s => ({ value: s.id, label: s.name }))]} />
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                      <textarea value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Description du service..." className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </>}
                </div>

                <div className="flex items-center gap-3 mt-5">
                  <button onClick={save} disabled={saving || !form.name?.trim()} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                    {saving ? '...' : isNew ? '+ Créer' : '💾 Enregistrer'}
                  </button>
                  {!isNew && selId && (
                    delConfirm ? (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-red-600">Confirmer ?</span>
                        <button onClick={deleteNode} className="px-3 py-1.5 bg-red-600 text-white text-sm rounded hover:bg-red-700">Oui</button>
                        <button onClick={() => setDelConfirm(false)} className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded">Non</button>
                      </div>
                    ) : (
                      <button onClick={() => setDelConfirm(true)} className="px-4 py-2 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition">
                        🗑️ Supprimer
                      </button>
                    )
                  )}
                  {msg && <span className="text-sm">{msg}</span>}
                </div>
              </div>

              {/* Devices in this node */}
              {!isNew && selId && (() => {
                const nodeDevs = selType === 'org' ? devByOrg(selId) : selType === 'site' ? devBySite(selId) : devByDept(selId);
                return (
                  <div className="bg-white rounded-lg shadow p-6">
                    <h3 className="font-semibold text-gray-700 mb-4">🖥️ Appareils assignés ({nodeDevs.length})</h3>
                    {nodeDevs.length === 0 ? (
                      <p className="text-sm text-gray-400">Aucun appareil assigné à ce nœud</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                        {nodeDevs.map(d => (
                          <button key={d.id} onClick={() => navigate(`/devices/${d.id}`)}
                            className="flex items-center gap-2 p-2.5 border rounded-lg hover:border-blue-400 hover:bg-blue-50 transition text-left">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${d.status === 'online' ? 'bg-green-500' : 'bg-gray-400'}`} />
                            <span className="text-sm font-medium text-gray-800 truncate">{d.device_name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          )}

          {/* ── Assign device panel ── */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-gray-700 mb-4">🔗 Assigner un appareil</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select label="Appareil" value={assignDeviceId} onChange={v => { setAssignDeviceId(v); const d = devices.find(x => x.id === v); if (d) { setAssignOrgId(d.organization_id || ''); setAssignSiteId(d.site_id || ''); setAssignDeptId(d.department_id || ''); } }}
                options={[{ value: '', label: '— Sélectionner —' }, ...devices.map(d => ({ value: d.id, label: d.device_name }))]} />
              <Select label="Entreprise" value={assignOrgId} onChange={v => { setAssignOrgId(v); setAssignSiteId(''); setAssignDeptId(''); }}
                options={[{ value: '', label: '— Aucune —' }, ...orgs.map(o => ({ value: o.id, label: o.name }))]} />
              <Select label="Site" value={assignSiteId} onChange={v => { setAssignSiteId(v); setAssignDeptId(''); }}
                options={[{ value: '', label: '— Aucun —' }, ...sites.filter(s => !assignOrgId || s.organization_id === assignOrgId).map(s => ({ value: s.id, label: s.name }))]} />
              <Select label="Service" value={assignDeptId} onChange={setAssignDeptId}
                options={[{ value: '', label: '— Aucun —' }, ...depts.filter(d => (!assignSiteId || d.site_id === assignSiteId) && (!assignOrgId || d.organization_id === assignOrgId)).map(d => ({ value: d.id, label: d.name }))]} />
              <div className="sm:col-span-2">
                <Field label="Notes" value={assignNotes} onChange={setAssignNotes} placeholder="Notes sur l'appareil..." />
              </div>
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button onClick={assignDevice} disabled={assignSaving || !assignDeviceId} className="px-5 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50">
                {assignSaving ? '...' : '✅ Assigner'}
              </button>
              {assignMsg && <span className="text-sm">{assignMsg}</span>}
            </div>
          </div>

          {/* Unassigned devices */}
          {unassigned > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <p className="font-semibold text-orange-800 text-sm">⚠️ {unassigned} appareil{unassigned > 1 ? 's' : ''} non assigné{unassigned > 1 ? 's' : ''}</p>
              <div className="flex flex-wrap gap-2 mt-2">
                {devices.filter(d => !d.organization_id).map(d => (
                  <button key={d.id} onClick={() => { setAssignDeviceId(d.id); setAssignOrgId(''); setAssignSiteId(''); setAssignDeptId(''); }}
                    className="text-xs bg-white border border-orange-300 text-orange-700 px-2 py-1 rounded hover:bg-orange-100 transition">
                    {d.device_name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
