import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { APP_VERSION } from '../version';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();

  const handleLogout = () => {
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
  ];

  const isActive = (href: string) =>
    location.pathname === href ? 'bg-blue-700' : '';

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-blue-600 text-white shadow-lg flex flex-col">
        <div className="p-6 border-b border-blue-700">
          <h1 className="text-2xl font-bold">RMM</h1>
          <p className="text-blue-200 text-sm mt-1">Remote Management</p>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto">
          {/* Main group */}
          {navItems.filter(i => i.group === 'main').map((item) => (
            <Link key={item.href} to={item.href}
              className={`flex items-center px-6 py-2.5 text-white hover:bg-blue-700 transition text-sm ${isActive(item.href)}`}>
              <span className="mr-3">{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
          {/* Org group */}
          <div className="mx-4 my-2 border-t border-blue-500 opacity-40" />
          <p className="px-6 py-1 text-xs text-blue-300 uppercase tracking-wide font-semibold">Organisation</p>
          {navItems.filter(i => i.group === 'org').map((item) => (
            <Link key={item.href} to={item.href}
              className={`flex items-center px-6 py-2.5 text-white hover:bg-blue-700 transition text-sm ${isActive(item.href)}`}>
              <span className="mr-3">{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
          {/* System group */}
          <div className="mx-4 my-2 border-t border-blue-500 opacity-40" />
          <p className="px-6 py-1 text-xs text-blue-300 uppercase tracking-wide font-semibold">Système</p>
          {navItems.filter(i => i.group === 'sys').map((item) => (
            <Link key={item.href} to={item.href}
              className={`flex items-center px-6 py-2.5 text-white hover:bg-blue-700 transition text-sm ${isActive(item.href)}`}>
              <span className="mr-3">{item.icon}</span><span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="p-6 bg-blue-700 border-t border-blue-600">
          <div className="text-sm text-blue-100 mb-3">
            <p className="font-semibold">Admin User</p>
            <p className="text-xs text-blue-200">admin@rmm-demo.local</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full bg-blue-500 hover:bg-blue-400 text-white font-semibold py-2 px-4 rounded transition"
          >
            Logout
          </button>
          <p className="text-center text-blue-300 text-xs mt-3 opacity-70">
            RMM v{APP_VERSION}
          </p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow">
          <div className="px-8 py-4">
            <h2 className="text-2xl font-bold text-gray-800">
              {navItems.find((item) => item.href === location.pathname || (item.href !== '/' && location.pathname.startsWith(item.href)))?.label || 'Dashboard'}
            </h2>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
