import { useEffect, useState, useCallback } from 'react';
import { useApiClient } from '../hooks/useApi';
import { deviceAPI, configAPI, AgentConfig } from '../api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Device {
  id: string;
  device_name: string;
  status: string;
}

const DEFAULTS: AgentConfig = {
  telemetryInterval: 30,
  pollInterval:      15,
  commandTimeout:    30,
  maxOutputLength:  1000,
  alerts: { cpuThreshold: 80, ramThreshold: 90, diskThreshold: 85 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function ConfigField({
  label, sublabel, value, min, max, unit, defaultValue, onChange, disabled,
}: {
  label: string; sublabel?: string; value: number; min: number; max: number;
  unit: string; defaultValue: number; onChange: (v: number) => void; disabled?: boolean;
}) {
  const isDefault = value === defaultValue;
  return (
    <div className={`p-4 rounded-lg border ${isDefault ? 'border-gray-200 bg-white' : 'border-blue-200 bg-blue-50'}`}>
      <div className="flex items-center justify-between mb-2">
        <div>
          <span className="text-sm font-semibold text-gray-700">{label}</span>
          {sublabel && <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>}
        </div>
        <div className="flex items-center gap-2">
          {!isDefault && (
            <button
              onClick={() => onChange(defaultValue)}
              className="text-xs text-blue-500 hover:text-blue-700 underline"
            >
              reset
            </button>
          )}
          {!isDefault && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={min} max={max} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="flex-1 h-2 accent-blue-600"
        />
        <div className="flex items-center gap-1 w-28">
          <input
            type="number"
            min={min} max={max} value={value}
            onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
            disabled={disabled}
            className="w-16 px-2 py-1 text-sm border border-gray-300 rounded text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <span className="text-xs text-gray-500">{unit}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Section card ──────────────────────────────────────────────────────────────

function SectionCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="text-base font-semibold text-gray-800">{title}</h3>
      </div>
      <div className="p-6 space-y-4">{children}</div>
    </div>
  );
}

// ─── Per-device override row ──────────────────────────────────────────────────

function DeviceConfigRow({
  device, globalConfig, onSave,
}: {
  device: Device;
  globalConfig: AgentConfig;
  onSave: (deviceId: string, config: Partial<AgentConfig> | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [override, setOverride] = useState<Partial<AgentConfig> | null>(null);
  const [form, setForm] = useState<AgentConfig>({ ...DEFAULTS });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const { isReady } = useApiClient();

  const loadOverride = useCallback(async () => {
    if (!isReady) return;
    setLoading(true);
    try {
      const res = await configAPI.getForDevice(device.id);
      setOverride(res.data.deviceOverride);
      // Form shows merged values
      setForm({ ...DEFAULTS, ...globalConfig, ...(res.data.deviceOverride || {}) } as AgentConfig);
    } finally {
      setLoading(false);
    }
  }, [device.id, globalConfig, isReady]);

  useEffect(() => {
    if (open) loadOverride();
  }, [open, loadOverride]);

  const hasOverride = override !== null && Object.keys(override).length > 0;

  const save = async () => {
    setSaving(true);
    try {
      // Only save fields that differ from global
      const diff: Record<string, unknown> = {};
      if (form.telemetryInterval !== globalConfig.telemetryInterval) diff.telemetryInterval = form.telemetryInterval;
      if (form.pollInterval      !== globalConfig.pollInterval)      diff.pollInterval      = form.pollInterval;
      if (form.commandTimeout    !== globalConfig.commandTimeout)    diff.commandTimeout    = form.commandTimeout;
      if (form.maxOutputLength   !== globalConfig.maxOutputLength)   diff.maxOutputLength   = form.maxOutputLength;

      const alertDiff: Record<string, number> = {};
      if (form.alerts.cpuThreshold  !== globalConfig.alerts.cpuThreshold)  alertDiff.cpuThreshold  = form.alerts.cpuThreshold;
      if (form.alerts.ramThreshold  !== globalConfig.alerts.ramThreshold)  alertDiff.ramThreshold  = form.alerts.ramThreshold;
      if (form.alerts.diskThreshold !== globalConfig.alerts.diskThreshold) alertDiff.diskThreshold = form.alerts.diskThreshold;
      if (Object.keys(alertDiff).length > 0) diff.alerts = alertDiff;

      if (Object.keys(diff).length === 0) {
        // Nothing differs from global → delete override
        await configAPI.resetDevice(device.id);
        setOverride(null);
        await onSave(device.id, null);
      } else {
        await configAPI.saveForDevice(device.id, diff);
        setOverride(diff);
        await onSave(device.id, diff);
      }
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      await configAPI.resetDevice(device.id);
      setOverride(null);
      setForm({ ...DEFAULTS, ...globalConfig } as AgentConfig);
      await onSave(device.id, null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition text-left"
      >
        <div className="flex items-center gap-3">
          <span>{device.status === 'online' ? '🟢' : '⚫'}</span>
          <span className="font-medium text-gray-800 text-sm">{device.device_name}</span>
          {hasOverride && (
            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full font-semibold">
              {Object.keys(override!).length} override{Object.keys(override!).length > 1 ? 's' : ''}
            </span>
          )}
          {!hasOverride && <span className="text-xs text-gray-400 italic">using global defaults</span>}
        </div>
        <span className="text-gray-400 text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-4 bg-white">
          {loading ? (
            <div className="text-center py-4 text-gray-400 text-sm">Loading...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <ConfigField
                  label="Télémétrie" sublabel="Intervalle d'envoi des métriques"
                  value={form.telemetryInterval} min={5} max={300} unit="sec"
                  defaultValue={globalConfig.telemetryInterval}
                  onChange={(v) => setForm((f) => ({ ...f, telemetryInterval: v }))}
                />
                <ConfigField
                  label="Poll commandes" sublabel="Fréquence de lecture des commandes"
                  value={form.pollInterval} min={5} max={120} unit="sec"
                  defaultValue={globalConfig.pollInterval}
                  onChange={(v) => setForm((f) => ({ ...f, pollInterval: v }))}
                />
                <ConfigField
                  label="Timeout commande" sublabel="Durée max d'exécution"
                  value={form.commandTimeout} min={5} max={300} unit="sec"
                  defaultValue={globalConfig.commandTimeout}
                  onChange={(v) => setForm((f) => ({ ...f, commandTimeout: v }))}
                />
                <ConfigField
                  label="Longueur sortie" sublabel="Taille max de l'output"
                  value={form.maxOutputLength} min={100} max={10000} unit="chars"
                  defaultValue={globalConfig.maxOutputLength}
                  onChange={(v) => setForm((f) => ({ ...f, maxOutputLength: v }))}
                />
                <ConfigField
                  label="Seuil alerte CPU"
                  value={form.alerts.cpuThreshold} min={10} max={99} unit="%"
                  defaultValue={globalConfig.alerts.cpuThreshold}
                  onChange={(v) => setForm((f) => ({ ...f, alerts: { ...f.alerts, cpuThreshold: v } }))}
                />
                <ConfigField
                  label="Seuil alerte RAM"
                  value={form.alerts.ramThreshold} min={10} max={99} unit="%"
                  defaultValue={globalConfig.alerts.ramThreshold}
                  onChange={(v) => setForm((f) => ({ ...f, alerts: { ...f.alerts, ramThreshold: v } }))}
                />
                <ConfigField
                  label="Seuil alerte Disque"
                  value={form.alerts.diskThreshold} min={10} max={99} unit="%"
                  defaultValue={globalConfig.alerts.diskThreshold}
                  onChange={(v) => setForm((f) => ({ ...f, alerts: { ...f.alerts, diskThreshold: v } }))}
                />
              </div>

              <div className="flex gap-2 justify-end">
                {hasOverride && (
                  <button
                    onClick={reset}
                    disabled={saving}
                    className="px-4 py-1.5 text-sm border border-gray-300 text-gray-600 rounded hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    Réinitialiser aux globaux
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={saving}
                  className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50 font-semibold"
                >
                  {saving ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Settings page ───────────────────────────────────────────────────────

export default function Settings() {
  const { isReady } = useApiClient();
  const [devices, setDevices] = useState<Device[]>([]);
  const [globalConfig, setGlobalConfig] = useState<AgentConfig>({ ...DEFAULTS });
  const [formConfig, setFormConfig] = useState<AgentConfig>({ ...DEFAULTS });
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [migrationNeeded, setMigrationNeeded] = useState(false);

  // Load global config + devices
  useEffect(() => {
    if (!isReady) return;
    Promise.all([
      configAPI.getGlobal(),
      deviceAPI.list({ limit: 200 }),
    ]).then(([cfgRes, devRes]) => {
      const cfg = cfgRes.data.data as AgentConfig;
      setGlobalConfig(cfg);
      setFormConfig({ ...cfg });
      setIsDefault((cfgRes.data as { isDefault?: boolean }).isDefault ?? true);
      if (devRes.data.data) setDevices(devRes.data.data as Device[]);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [isReady]);

  const saveGlobal = async () => {
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await configAPI.saveGlobal(formConfig);
      if (res.status === 503) {
        setMigrationNeeded(true);
      } else {
        setGlobalConfig({ ...formConfig });
        setIsDefault(false);
        setSavedMsg('✅ Paramètres globaux sauvegardés !');
        setTimeout(() => setSavedMsg(null), 3000);
      }
    } catch (err: unknown) {
      const status = (err as { response?: { status: number } })?.response?.status;
      if (status === 503) setMigrationNeeded(true);
    } finally {
      setSaving(false);
    }
  };

  const resetGlobal = () => {
    setFormConfig({ ...DEFAULTS });
  };

  const hasGlobalChanges = JSON.stringify(formConfig) !== JSON.stringify(globalConfig);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Chargement des paramètres...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">

      {/* Migration banner */}
      {migrationNeeded && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-semibold text-amber-800">Migration SQL requise</p>
              <p className="text-sm text-amber-700 mt-1">
                La table <code className="bg-amber-100 px-1 rounded">device_configs</code> n'existe pas encore dans Supabase.
              </p>
              <p className="text-sm text-amber-700 mt-1">
                Exécute le fichier <code className="bg-amber-100 px-1 rounded">supabase/add_device_configs.sql</code> dans l'éditeur SQL Supabase :{' '}
                <a
                  href="https://console.supabase.com/project/_/sql/new"
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-amber-800"
                >
                  console.supabase.com
                </a>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Global defaults */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🌍</span>
            <div>
              <h3 className="text-base font-semibold text-gray-800">Paramètres globaux</h3>
              <p className="text-xs text-gray-400">S'appliquent à tous les postes sauf surcharge individuelle</p>
            </div>
          </div>
          {!isDefault && (
            <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full font-semibold">
              ✓ Personnalisé
            </span>
          )}
          {isDefault && (
            <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">
              Valeurs par défaut
            </span>
          )}
        </div>

        <div className="p-6 space-y-6">

          {/* Agent timing */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">⏱ Agent — Intervalles</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ConfigField
                label="Intervalle télémétrie"
                sublabel="CPU / RAM / Disque envoyés toutes les…"
                value={formConfig.telemetryInterval} min={5} max={300} unit="sec"
                defaultValue={DEFAULTS.telemetryInterval}
                onChange={(v) => setFormConfig((f) => ({ ...f, telemetryInterval: v }))}
              />
              <ConfigField
                label="Intervalle poll commandes"
                sublabel="Fréquence de lecture des nouvelles commandes"
                value={formConfig.pollInterval} min={5} max={120} unit="sec"
                defaultValue={DEFAULTS.pollInterval}
                onChange={(v) => setFormConfig((f) => ({ ...f, pollInterval: v }))}
              />
            </div>
          </div>

          {/* Command limits */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">⚙️ Commandes — Limites</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ConfigField
                label="Timeout commande"
                sublabel="Durée max avant kill du processus"
                value={formConfig.commandTimeout} min={5} max={300} unit="sec"
                defaultValue={DEFAULTS.commandTimeout}
                onChange={(v) => setFormConfig((f) => ({ ...f, commandTimeout: v }))}
              />
              <ConfigField
                label="Longueur max sortie"
                sublabel="Caractères conservés de l'output"
                value={formConfig.maxOutputLength} min={100} max={10000} unit="chars"
                defaultValue={DEFAULTS.maxOutputLength}
                onChange={(v) => setFormConfig((f) => ({ ...f, maxOutputLength: v }))}
              />
            </div>
          </div>

          {/* Alert thresholds */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">🚨 Alertes — Seuils de déclenchement</h4>
            <p className="text-xs text-gray-400 mb-3">
              Une alerte est créée automatiquement quand la valeur dépasse le seuil (warning) ou 95% (critical).
              Pas de doublon sur 5 minutes.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <ConfigField
                label="Seuil CPU" value={formConfig.alerts.cpuThreshold} min={10} max={99} unit="%"
                defaultValue={DEFAULTS.alerts.cpuThreshold}
                onChange={(v) => setFormConfig((f) => ({ ...f, alerts: { ...f.alerts, cpuThreshold: v } }))}
              />
              <ConfigField
                label="Seuil RAM" value={formConfig.alerts.ramThreshold} min={10} max={99} unit="%"
                defaultValue={DEFAULTS.alerts.ramThreshold}
                onChange={(v) => setFormConfig((f) => ({ ...f, alerts: { ...f.alerts, ramThreshold: v } }))}
              />
              <ConfigField
                label="Seuil Disque" value={formConfig.alerts.diskThreshold} min={10} max={99} unit="%"
                defaultValue={DEFAULTS.alerts.diskThreshold}
                onChange={(v) => setFormConfig((f) => ({ ...f, alerts: { ...f.alerts, diskThreshold: v } }))}
              />
            </div>
          </div>

          {/* Save buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <button
              onClick={resetGlobal}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Réinitialiser aux valeurs par défaut
            </button>
            <div className="flex items-center gap-3">
              {savedMsg && <span className="text-sm text-green-600 font-medium">{savedMsg}</span>}
              <button
                onClick={saveGlobal}
                disabled={saving || !hasGlobalChanges}
                className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                {saving ? 'Sauvegarde...' : '💾 Sauvegarder les globaux'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Per-device overrides */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span className="text-lg">💻</span>
            <div>
              <h3 className="text-base font-semibold text-gray-800">Surcharges par poste</h3>
              <p className="text-xs text-gray-400">
                Cliquez sur un poste pour configurer des valeurs spécifiques. Les champs identiques aux globaux ne sont pas sauvegardés.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-3">
          {devices.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">Aucun device trouvé</div>
          ) : (
            devices.map((device) => (
              <DeviceConfigRow
                key={device.id}
                device={device}
                globalConfig={globalConfig}
                onSave={async () => {}}
              />
            ))
          )}
        </div>
      </div>

      {/* Info: current defaults table */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">📋 Valeurs par défaut (hardcodées agent)</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          {[
            { label: 'Télémétrie',    value: `${DEFAULTS.telemetryInterval}s` },
            { label: 'Poll cmds',     value: `${DEFAULTS.pollInterval}s` },
            { label: 'Timeout cmd',   value: `${DEFAULTS.commandTimeout}s` },
            { label: 'Max output',    value: `${DEFAULTS.maxOutputLength} chars` },
            { label: 'CPU alert',     value: `${DEFAULTS.alerts.cpuThreshold}%` },
            { label: 'RAM alert',     value: `${DEFAULTS.alerts.ramThreshold}%` },
            { label: 'Disk alert',    value: `${DEFAULTS.alerts.diskThreshold}%` },
            { label: 'Config reload', value: '5 min' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="font-mono text-blue-600 font-bold text-sm">{value}</div>
              <div className="text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
