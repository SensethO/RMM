import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { APP_VERSION } from '../version';
import { useTheme } from '../contexts/ThemeContext';
import { useSessionTracker } from '../hooks/useSessionTracker';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location  = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { endSession } = useSessionTracker();

  const handleLogout = async () => {
    await endSession();
    localStorage.removeItem('auth_token');
    window.location.href = '/';
  };

  const navItems = [
    { href: '/',              label: 'Dashboard',      icon: '📊', group: 'main' },
    { href: '/devices',       label: 'Appareils',      icon: '💻', group: 'main' },
    { href: '/deploy',        label: 'Déploiements',   icon: '🚀', group: 'main' },
    { href: '/commands',      label: 'Commandes',      icon: '⚙️', group: 'main' },
    { href: '/monitor',       label: 'Monitor',        icon: '📡', group: 'main' },
    { href: '/organization',  label: 'Organisation',   icon: '🏢', group: 'org'  },
    { href: '/microsoft365',  label: 'Microsoft 365',  icon: '🔷', group: 'org'  },
    { href: '/alerts',        label: 'Alertes',        icon: '🚨', group: 'sys'  },
    { href: '/versions',      label: 'Versions',       icon: '🔖', group: 'sys'  },
    { href: '/settings',      label: 'Paramètres',     icon: '⚙️', group: 'sys'  },
    { href: '/tenants',       label: 'Tenants clients', icon: '🏢', group: 'admin' },
    { href: '/profile',       label: 'Mon profil',      icon: '👤', group: 'admin' },
    { href: '/admin/logs',    label: 'Logs connexion',  icon: '📋', group: 'admin' },
  ];

  const isActive = (href: string) =>
    location.pathname === href ? 'bg-blue-700' : '';

  const PAGE_TITLES: Record<string, string> = {
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
    '/tenants':      'Tenants clients',
    '/profile':      'Mon profil',
    '/admin/logs':   'Logs de connexion',
  };

  const pageTitle = PAGE_TITLES[location.pathname]
    || (location.pathname.startsWith('/devices/') ? 'Détail appareil' : 'Dashboard');

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-slate-900">

      {/* ── Sidebar ───────────────────────────────────────────────────────────── */}
      <div className="w-64 bg-blue-600 text-white shadow-lg flex flex-col shrink-0">

        {/* Logo */}
        <div className="p-6 border-b border-blue-700">
          <h1 className="text-2xl font-bold">RMM</h1>
          <p className="text-blue-200 text-sm mt-1">Remote Management</p>
        </div>

        {/* Nav */}
        <nav className="mt-4 flex-1 overflow-y-auto">
          {/* Main */}
          {navItems.filter(i => i.group === 'main').map((item) => (
            <Link key={item.href} to={item.href}
              className={`flex items-center px-6 py-2.5 text-white hover:bg-blue-700 transition text-sm ${isActive(item.href)}`}>
              <span className="mr-3 text-base">{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}

          {/* Org */}
          <div className="mx-4 my-2 border-t border-blue-500 opacity-40" />
          <p className="px-6 py-1 text-xs text-blue-300 uppercase tracking-wide font-semibold">Organisation</p>
          {navItems.filter(i => i.group === 'org').map((item) => (
            <Link key={item.href} to={item.href}
              className={`flex items-center px-6 py-2.5 text-white hover:bg-blue-700 transition text-sm ${isActive(item.href)}`}>
              <span className="mr-3 text-base">{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}

          {/* System */}
          <div className="mx-4 my-2 border-t border-blue-500 opacity-40" />
          <p className="px-6 py-1 text-xs text-blue-300 uppercase tracking-wide font-semibold">Système</p>
          {navItems.filter(i => i.group === 'sys').map((item) => (
            <Link key={item.href} to={item.href}
              className={`flex items-center px-6 py-2.5 text-white hover:bg-blue-700 transition text-sm ${isActive(item.href)}`}>
              <span className="mr-3 text-base">{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}

          {/* Admin */}
          <div className="mx-4 my-2 border-t border-blue-500 opacity-40" />
          <p className="px-6 py-1 text-xs text-blue-300 uppercase tracking-wide font-semibold">Admin</p>
          {navItems.filter(i => i.group === 'admin').map((item) => (
            <Link key={item.href} to={item.href}
              className={`flex items-center px-6 py-2.5 text-white hover:bg-blue-700 transition text-sm ${isActive(item.href)}`}>
              <span className="mr-3 text-base">{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>

        {/* Bottom: user + theme toggle + logout */}
        <div className="p-4 bg-blue-700 border-t border-blue-600">
          {/* User info */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm shrink-0">A</div>
            <div className="min-w-0">
              <p className="text-sm text-blue-100 font-semibold truncate">Admin User</p>
              <p className="text-xs text-blue-300 truncate">admin@rmm-demo.local</p>
            </div>
          </div>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Passer en mode clair' : 'Passer en mode sombre'}
            className="w-full mb-2 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-blue-100 text-xs font-semibold py-1.5 px-3 rounded-lg transition"
          >
            {theme === 'dark' ? '☀️ Mode clair' : '🌙 Mode sombre'}
          </button>

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="w-full bg-blue-500 hover:bg-blue-400 text-white font-semibold py-1.5 px-4 rounded-lg transition text-sm"
          >
            Déconnexion
          </button>

          <p className="text-center text-blue-300 text-xs mt-2 opacity-70">RMM v{APP_VERSION}</p>
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <header className="bg-white dark:bg-slate-800 shadow dark:shadow-slate-700/50 shrink-0">
          <div className="px-8 py-4 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-slate-100">{pageTitle}</h2>
            {/* Quick theme toggle in header */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-400 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition text-lg"
              title={theme === 'dark' ? 'Mode clair' : 'Mode sombre'}
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-8 bg-gray-50 dark:bg-slate-900">
          {children}
        </main>
      </div>
    </div>
  );
}
