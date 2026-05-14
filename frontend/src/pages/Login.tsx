import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SignJWT } from 'jose';

export function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
      if (username !== 'admin' || password !== 'demo123') {
        console.log('❌ Invalid credentials');
        setError('Invalid username or password');
        setIsLoading(false);
        return;
      }

      console.log('✅ Credentials valid, generating JWT...');
      // Generate JWT token locally - NO BACKEND CALL NEEDED
      // Must match backend JWT_SECRET for token verification
      const secret = new TextEncoder().encode('rmm-prod-jwt-secret-2024');
      const token = await new SignJWT({
        sub: 'demo-user-001',
        email: 'admin@rmm-demo.local',
        name: 'Admin User',
        iss: 'rmm-demo',
      })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('24h')
        .sign(secret);

      console.log('✅ JWT generated:', token.substring(0, 50) + '...');
      // Store token in localStorage
      localStorage.setItem('auth_token', token);
      console.log('✅ Token stored in localStorage');

      // Redirect to dashboard
      console.log('🚀 Redirecting to dashboard...');
      navigate('/');
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

          {/* Demo Credentials Hint */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
            <strong>Demo Credentials:</strong>
            <br />
            Username: <code className="bg-blue-100 px-2 py-1 rounded">admin</code>
            <br />
            Password: <code className="bg-blue-100 px-2 py-1 rounded">demo123</code>
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
