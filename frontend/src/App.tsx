import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useMsalAuthentication } from '@azure/msal-react';

// Pages - TODO: Create these components
// import Dashboard from './pages/Dashboard';
// import Devices from './pages/Devices';
// import DeviceDetail from './pages/DeviceDetail';
// import Apps from './pages/Apps';
// import Deployments from './pages/Deployments';
// import Alerts from './pages/Alerts';

function App() {
  const { isLoading, isAuthenticated, error } = useMsalAuthentication('redirect');

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (error) {
    return <div className="flex items-center justify-center h-screen text-red-600">Authentication Error</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return (
    <BrowserRouter>
      <div className="h-screen flex flex-col">
        {/* Header */}
        <header className="bg-blue-600 text-white p-4">
          <h1 className="text-2xl font-bold">RMM Dashboard</h1>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-auto">
          <Routes>
            <Route path="/" element={<div>Dashboard - Coming Soon</div>} />
            <Route path="/devices" element={<div>Devices - Coming Soon</div>} />
            <Route path="/devices/:id" element={<div>Device Detail - Coming Soon</div>} />
            <Route path="/apps" element={<div>Apps - Coming Soon</div>} />
            <Route path="/deployments" element={<div>Deployments - Coming Soon</div>} />
            <Route path="/alerts" element={<div>Alerts - Coming Soon</div>} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
