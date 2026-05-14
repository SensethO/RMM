import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Simple login endpoint for demo/testing
// Hardcoded credentials: admin / demo123
router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;

  // Validate input
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  // Hardcoded demo credentials
  if (username === 'admin' && password === 'demo123') {
    const jwtSecret = process.env.JWT_SECRET || 'default-secret-change-in-production';

    // Create JWT token
    const token = jwt.sign(
      {
        sub: 'demo-user-001', // User ID
        email: 'admin@rmm-demo.local',
        name: 'Admin User',
        iss: 'rmm-demo', // Issuer
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
      },
      jwtSecret,
      { algorithm: 'HS256' }
    );

    return res.json({
      token,
      user: {
        id: 'demo-user-001',
        name: 'Admin User',
        email: 'admin@rmm-demo.local',
        role: 'admin',
      },
    });
  }

  // Invalid credentials
  return res.status(401).json({ error: 'Invalid username or password' });
});

export default router;
