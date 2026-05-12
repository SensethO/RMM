import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { authMiddleware } from './middleware/auth';
import { tenantMiddleware } from './middleware/tenant';
import devicesRouter from './routes/devices';
import commandsRouter from './routes/commands';
import telemetryRouter from './routes/telemetry';
import './types/express'; // Import type extensions

dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Logger middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const tenantId = req.tenant?.id || 'unknown';
    logger.info(
      `${req.method} ${req.path} - ${res.statusCode} (${duration}ms) - tenant: ${tenantId}`
    );
  });
  next();
});

// Health check (no auth required)
app.get('/api/health', (_req: Request, res: Response) => {
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
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Endpoint not found',
    statusCode: 404,
  });
});

// Error handling middleware (place last)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const error = err instanceof Error ? err : new Error(String(err));
  logger.error('Unhandled error:', error);
  res.status(500).json({
    error: error.message || 'Internal server error',
    statusCode: 500,
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`RMM API listening on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info('Endpoints:');
  logger.info('  GET  /api/health                          - Health check');
  logger.info('  POST /api/devices/register                - Register device');
  logger.info('  GET  /api/devices                         - List devices');
  logger.info('  GET  /api/devices/:id                     - Get device');
  logger.info('  PATCH /api/devices/:id                    - Update device');
  logger.info('  GET  /api/commands/:device_id/pending     - Get pending commands');
  logger.info('  POST /api/commands/:device_id             - Queue command');
  logger.info('  PATCH /api/commands/:id                   - Update command status');
  logger.info('  GET  /api/commands/:device_id/history     - Get command history');
  logger.info('  POST /api/devices/:device_id/telemetry    - Report telemetry');
  logger.info('  GET  /api/devices/:device_id/telemetry    - Get telemetry history');
});

export default app;
