import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMsal } from '@azure/msal-react';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { instance, accounts } = useMsal();

  const handleLogout = () => {
    instance.logout();
  };

  const navItems = [
    { href: '/', label: 'Dashboard', icon: '📊' },
    { href: '/devices', label: 'Devices', icon: '💻' },
    { href: '/commands', label: 'Commands', icon: '⚙️' },
    { href: '/alerts', label: 'Alerts', icon: '🚨' },
  ];

  const isActive = (href: string) => {
    return location.pathname === href ? 'bg-blue-700' : '';
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <div className="w-64 bg-blue-600 text-white shadow-lg">
        <div className="p-6 border-b border-blue-700">
          <h1 className="text-2xl font-bold">RMM</h1>
          <p className="text-blue-200 text-sm mt-1">Remote Management</p>
        </div>

        <nav className="mt-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={`flex items-center px-6 py-3 text-white hover:bg-blue-700 transition ${isActive(
                item.href
              )}`}
            >
              <span className="mr-3 text-lg">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-6 bg-blue-700 border-t border-blue-600">
          <div className="text-sm text-blue-100 mb-3">
            <p className="font-semibold">{accounts[0]?.name || 'User'}</p>
            <p className="text-xs text-blue-200">{accounts[0]?.username || 'Loading...'}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full bg-blue-500 hover:bg-blue-400 text-white font-semibold py-2 px-4 rounded transition"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-white shadow">
          <div className="px-8 py-4">
            <h2 className="text-2xl font-bold text-gray-800">
              {navItems.find((item) => item.href === location.pathname)?.label || 'Dashboard'}
            </h2>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>
    </div>
  );
}
