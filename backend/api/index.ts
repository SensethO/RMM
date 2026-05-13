import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from '../dist/utils/logger.js';
import { authMiddleware } from '../dist/middleware/auth.js';
import { tenantMiddleware } from '../dist/middleware/tenant.js';
import devicesRouter from '../dist/routes/devices.js';
import commandsRouter from '../dist/routes/commands.js';
import telemetryRouter from '../dist/routes/telemetry.js';
import '../dist/types/express.js';

dotenv.config();

const app = express();

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Logger middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const tenantId = (req as any).tenant?.id || 'unknown';
    logger.info(
      `${req.method} ${req.path} - ${res.statusCode} (${duration}ms) - tenant: ${tenantId}`
    );
  });
  next();
});

// Health check (no auth required)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Authentication and tenant extraction middleware
app.use('/api/', authMiddleware);
app.use('/api/', tenantMiddleware);

// Routes
app.use('/api/devices', devicesRouter);
app.use('/api/commands', commandsRouter);
app.use('/api/devices', telemetryRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    statusCode: 404,
  });
});

// Error handling middleware
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const error = err instanceof Error ? err : new Error(String(err));
  logger.error('Unhandled error:', error);
  res.status(500).json({
    error: error.message || 'Internal server error',
    statusCode: 500,
  });
});

// Vercel serverless handler - redirect all requests to Express app
export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req, res);
}
