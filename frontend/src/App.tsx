import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useApiClient } from './hooks/useApi';
import { ThemeProvider } from './contexts/ThemeContext';
import { Login } from './pages/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Devices from './pages/Devices';
import Commands from './pages/Commands';
import Alerts from './pages/Alerts';
import Settings from './pages/Settings';
import DeviceDetail from './pages/DeviceDetail';
import Versions from './pages/Versions';
import Monitor from './pages/Monitor';
import Deploy from './pages/Deploy';
import Organization from './pages/Organization';
import Microsoft365 from './pages/Microsoft365';
import Profile from './pages/Profile';
import AdminLogs from './pages/AdminLogs';
import Tenants from './pages/Tenants';

function App() {
  const { isReady } = useApiClient();
  const [hasManualAuth, setHasManualAuth] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    setHasManualAuth(!!token);
    setIsLoading(false);
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-slate-400">Chargement…</p>
        </div>
      </div>
    );
  }

  if (!hasManualAuth) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    );
  }

  if (!isReady) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-slate-400">Initialisation API…</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/"              element={<Dashboard />} />
          <Route path="/devices"       element={<Devices />} />
          <Route path="/devices/:id"   element={<DeviceDetail />} />
          <Route path="/commands"      element={<Commands />} />
          <Route path="/alerts"        element={<Alerts />} />
          <Route path="/settings"      element={<Settings />} />
          <Route path="/versions"      element={<Versions />} />
          <Route path="/monitor"       element={<Monitor />} />
          <Route path="/deploy"        element={<Deploy />} />
          <Route path="/organization"  element={<Organization />} />
          <Route path="/microsoft365"  element={<Microsoft365 />} />
          <Route path="/profile"       element={<Profile />} />
          <Route path="/admin/logs"    element={<AdminLogs />} />
          <Route path="/tenants"       element={<Tenants />} />
          <Route path="*"              element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default function AppWithTheme() {
  return (
    <ThemeProvider>
      <App />
    </ThemeProvider>
  );
}
