import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignJWT } from 'jose';

export function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('✅ Form submitted');
    setError('');
    setIsLoading(true);

    try {
      // Validate credentials
      console.log('🔐 Checking credentials:', username);
      const storedPassword = localStorage.getItem('rmm_password') || 'demo123';
      if (username !== 'admin' || password !== storedPassword) {
        console.log('❌ Invalid credentials');
        setError('Invalid username or password');
        setIsLoading(false);
        return;
      }

      console.log('✅ Credentials valid, generating JWT...');
      // Generate JWT token locally - NO BACKEND CALL NEEDED
      // Must match backend JWT_SECRET for token verification
      const secret = new TextEncoder().encode('rmm-prod-jwt-secret-2024');
      const payload: Record<string, unknown> = {
        sub: 'demo-user-001',
        email: 'admin@rmm-demo.local',
        name: 'Admin User',
        iss: 'rmm-demo',
      };
      // If tenant_id provided, embed it so API uses that tenant
      if (tenantId.trim()) {
        payload.tenant_id = tenantId.trim();
        console.log(`🏢 Using tenant: ${tenantId.substring(0, 8)}...`);
      }
      // If super-admin enabled, add flag and mock Azure AD groups
      if (isSuperAdmin) {
        payload.isSuperAdmin = true;
        payload.groups = ['8b84b1f8-43cb-41d5-bd37-9530b0f1c0ff']; // RMM-SuperAdmins group
        console.log('👑 Super-admin mode enabled');
      }
      const token = await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(secret);

      console.log('✅ JWT generated:', token.substring(0, 50) + '...');
      console.log('Full token:', token);
      console.log('Token length:', token.length);

      // Store token in localStorage
      if (!token || token.length === 0) {
        console.error('❌ Token is empty!');
        setError('Token generation failed');
        setIsLoading(false);
        return;
      }

      localStorage.setItem('auth_token', token);
      const stored = localStorage.getItem('auth_token');
      console.log('✅ Token stored in localStorage');
      console.log('Verification - Token in storage:', stored ? stored.substring(0, 50) + '...' : 'NOT FOUND');
      localStorage.removeItem('rmm_session_id'); // Fresh session on each login

      // Redirect to dashboard - use hard reload so App.tsx re-reads localStorage
      console.log('🚀 Redirecting to dashboard...');
      setTimeout(() => {
        window.location.href = '/';
      }, 100);
    } catch (err) {
      const errorMessage = 'Login failed. Please try again.';
      setError(errorMessage);
      console.error('❌ Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="bg-white rounded-lg shadow-xl p-8 w-full max-w-md">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">RMM Platform</h1>
          <p className="text-slate-600">Remote Monitoring & Management</p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username Input */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-2">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              disabled={isLoading}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
              required
            />
          </div>

          {/* Password Input */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="demo123"
              disabled={isLoading}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100"
              required
            />
          </div>

          {/* Tenant Selection */}
          <div>
            <label htmlFor="tenant" className="block text-sm font-medium text-slate-700 mb-2">
              Tenant (optionnel)
            </label>
            <input
              id="tenant"
              type="text"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="045edce4-dacf-4d85-a27c-46b1608e0282 (SCDB PRO SARL)"
              disabled={isLoading}
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 font-mono text-xs"
            />
            <p className="text-xs text-slate-500 mt-1">Laisser vide pour le tenant démo</p>
          </div>

          {/* Super-Admin Checkbox */}
          <div className="flex items-center space-x-2">
            <input
              id="superadmin"
              type="checkbox"
              checked={isSuperAdmin}
              onChange={(e) => setIsSuperAdmin(e.target.checked)}
              disabled={isLoading}
              className="w-4 h-4 accent-blue-600 cursor-pointer"
            />
            <label htmlFor="superadmin" className="text-sm font-medium text-slate-700 cursor-pointer">
              👑 Super-Admin Mode (voir tous les tenants)
            </label>
          </div>

          {/* Demo Credentials Hint */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
            <strong>Demo Credentials:</strong>
            <br />
            Username: <code className="bg-blue-100 px-2 py-1 rounded">admin</code>
            <br />
            Password: <code className="bg-blue-100 px-2 py-1 rounded">demo123</code>
            <br />
            <br />
            <strong>Tenant SCDB PRO SARL:</strong>
            <br />
            <code className="bg-blue-100 px-2 py-1 rounded text-xs">045edce4-dacf-4d85-a27c-46b1608e0282</code>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        {/* Footer */}
        <div className="mt-6 text-center text-sm text-slate-600">
          <p>Demo environment for testing</p>
        </div>
      </div>
    </div>
  );
}
