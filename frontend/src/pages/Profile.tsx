import React, { useState, useEffect } from 'react';
import { useTheme } from '../contexts/ThemeContext';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface SessionRow {
  id: string;
  ip_address: string;
  browser: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  is_active: boolean;
  page_count: number;
}

function formatDuration(sec?: number): string {
  if (!sec) return '—';
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function Profile() {
  const { theme, setTheme } = useTheme();

  // Password change state
  const [currentPw, setCurrentPw]   = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [pwMsg, setPwMsg]           = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [saving, setSaving]         = useState(false);

  // Recent sessions
  const [sessions, setSessions]     = useState<SessionRow[]>([]);
  const [sessionsLoading, setSessLoad] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const res = await fetch(`${API_BASE}/api/admin/sessions?limit=5`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        setSessions(json.data || []);
      } catch {}
      setSessLoad(false);
    };
    load();
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (newPw !== confirmPw) {
      setPwMsg({ type: 'err', text: 'Les mots de passe ne correspondent pas.' });
      return;
    }
    if (newPw.length < 8) {
      setPwMsg({ type: 'err', text: 'Le mot de passe doit contenir au moins 8 caractères.' });
      return;
    }
    const stored = localStorage.getItem('rmm_password') || 'demo123';
    if (currentPw !== stored) {
      setPwMsg({ type: 'err', text: 'Mot de passe actuel incorrect.' });
      return;
    }
    setSaving(true);
    await new Promise(r => setTimeout(r, 400));
    localStorage.setItem('rmm_password', newPw);
    setPwMsg({ type: 'ok', text: 'Mot de passe mis à jour avec succès.' });
    setSaving(false);
    setCurrentPw(''); setNewPw(''); setConfirmPw('');
  };

  const handleLogout = () => {
    // End session tracking before logout
    const sid = localStorage.getItem('rmm_session_id');
    if (sid) {
      const token = localStorage.getItem('auth_token');
      fetch(`${API_BASE}/api/sessions/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: sid, last_page: '/profile', time_on_last_page: 0 }),
        keepalive: true,
      }).catch(() => {});
      localStorage.removeItem('rmm_session_id');
    }
    localStorage.removeItem('auth_token');
    window.location.href = '/';
  };

  // ─── Input classes ─────────────────────────────────────────────────────────
  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-100 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400';
  const cardCls  = 'bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 p-6';

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* ── User card ───────────────────────────────────────────────────────── */}
      <div className={`${cardCls} flex items-center gap-5`}>
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-2xl font-bold select-none shadow-md">
          A
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-slate-100">Admin User</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">admin@rmm-demo.local</p>
          <span className="inline-block mt-1.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 rounded-full font-semibold border border-blue-200 dark:border-blue-800">
            Administrateur
          </span>
        </div>
      </div>

      {/* ── Theme card ──────────────────────────────────────────────────────── */}
      <div className={cardCls}>
        <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-1">🎨 Apparence</h3>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-5">Thème de l'interface, enregistré automatiquement.</p>
        <div className="grid grid-cols-2 gap-4">
          {/* Light */}
          <button
            onClick={() => setTheme('light')}
            className={`relative p-4 rounded-xl border-2 text-left transition-all ${
              theme === 'light'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
            }`}
          >
            {theme === 'light' && (
              <span className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">✓</span>
            )}
            {/* Preview */}
            <div className="w-full h-14 bg-gray-100 rounded-lg border border-gray-200 overflow-hidden flex mb-3">
              <div className="w-9 bg-blue-500 h-full" />
              <div className="flex-1 p-1.5 space-y-1.5">
                <div className="h-2 bg-white rounded w-full" />
                <div className="h-1.5 bg-gray-200 rounded w-3/4" />
                <div className="h-1.5 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
            <span className={`text-sm font-semibold ${theme === 'light' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-slate-300'}`}>
              ☀️ Clair
            </span>
          </button>

          {/* Dark */}
          <button
            onClick={() => setTheme('dark')}
            className={`relative p-4 rounded-xl border-2 text-left transition-all ${
              theme === 'dark'
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
            }`}
          >
            {theme === 'dark' && (
              <span className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs">✓</span>
            )}
            {/* Preview */}
            <div className="w-full h-14 bg-slate-900 rounded-lg border border-slate-700 overflow-hidden flex mb-3">
              <div className="w-9 bg-blue-600 h-full" />
              <div className="flex-1 p-1.5 space-y-1.5">
                <div className="h-2 bg-slate-700 rounded w-full" />
                <div className="h-1.5 bg-slate-600 rounded w-3/4" />
                <div className="h-1.5 bg-slate-600 rounded w-1/2" />
              </div>
            </div>
            <span className={`text-sm font-semibold ${theme === 'dark' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-slate-300'}`}>
              🌙 Sombre
            </span>
          </button>
        </div>
      </div>

      {/* ── Password change card ─────────────────────────────────────────────── */}
      <div className={cardCls}>
        <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-1">🔐 Changer le mot de passe</h3>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-5">Minimum 8 caractères.</p>

        {pwMsg && (
          <div className={`mb-4 p-3 rounded-lg text-sm border ${
            pwMsg.type === 'ok'
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800'
          }`}>
            {pwMsg.type === 'ok' ? '✅ ' : '❌ '}{pwMsg.text}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Mot de passe actuel</label>
            <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required className={inputCls} placeholder="••••••••" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Nouveau mot de passe</label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required minLength={8} className={inputCls} placeholder="••••••••" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">Confirmer le nouveau mot de passe</label>
            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required className={inputCls} placeholder="••••••••" />
          </div>
          <button
            type="submit" disabled={saving}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Enregistrement…' : 'Mettre à jour'}
          </button>
        </form>
      </div>

      {/* ── 2FA card ─────────────────────────────────────────────────────────── */}
      <div className={cardCls}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-1">🛡️ Double authentification (2FA)</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">Protégez votre compte avec une application d'authentification (TOTP).</p>
          </div>
          <span className="shrink-0 px-2.5 py-1 text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full border border-amber-200 dark:border-amber-800">
            Bientôt
          </span>
        </div>
        <div className="mt-4 p-4 bg-gray-50 dark:bg-slate-700/40 rounded-xl border border-gray-200 dark:border-slate-600 opacity-60 pointer-events-none select-none">
          <div className="flex items-center gap-4">
            <span className="text-3xl">📱</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-700 dark:text-slate-300">Application TOTP</p>
              <p className="text-xs text-gray-500 dark:text-slate-400">Google Authenticator · Authy · Microsoft Authenticator</p>
            </div>
            <button disabled className="px-3 py-1.5 bg-gray-200 dark:bg-slate-600 text-gray-500 dark:text-slate-400 text-xs font-semibold rounded-lg">Activer</button>
          </div>
        </div>
      </div>

      {/* ── Recent sessions ──────────────────────────────────────────────────── */}
      <div className={cardCls}>
        <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-1">🕓 Dernières connexions</h3>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">Historique des 5 dernières sessions.</p>

        {sessionsLoading ? (
          <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-slate-500">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            Chargement…
          </div>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-slate-500 italic">Aucune session enregistrée.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-slate-700/50 border border-gray-100 dark:border-slate-600">
                <span className="text-lg">{s.is_active ? '🟢' : '⚫'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-slate-200 truncate">
                    {s.browser || 'Navigateur inconnu'} · {s.ip_address || '—'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {formatDate(s.started_at)}
                    {s.is_active ? ' · En cours' : s.duration_seconds ? ` · Durée : ${formatDuration(s.duration_seconds)}` : ''}
                  </p>
                </div>
                {s.page_count > 0 && (
                  <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">{s.page_count} pages</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Logout ───────────────────────────────────────────────────────────── */}
      <div className={`${cardCls} border-red-100 dark:border-red-900/30`}>
        <h3 className="text-base font-semibold text-gray-900 dark:text-slate-100 mb-1">🚪 Déconnexion</h3>
        <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">Met fin à la session en cours et efface le token local.</p>
        <button
          onClick={handleLogout}
          className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg transition"
        >
          Se déconnecter
        </button>
      </div>

    </div>
  );
}
