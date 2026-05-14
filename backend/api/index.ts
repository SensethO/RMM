import type { VercelRequest, VercelResponse } from '@vercel/node';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

dotenv.config();

// ─── Logger (console only, no file writes on Vercel) ────────────────────────
const logger = {
  info:  (...args: unknown[]) => console.log('[INFO]',  ...args),
  warn:  (...args: unknown[]) => console.warn('[WARN]',  ...args),
  error: (...args: unknown[]) => console.error('[ERROR]', ...args),
  debug: (...args: unknown[]) => console.debug('[DEBUG]', ...args),
};

// ─── Supabase ────────────────────────────────────────────────────────────────
let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}

// ─── Express app ─────────────────────────────────────────────────────────────
const app = express();

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());

app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => logger.info(`${req.method} ${req.path} ${res.statusCode} (${Date.now() - t}ms)`));
  next();
});

// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), environment: process.env.NODE_ENV || 'development' });
});

// ─── Auth route (no middleware) ───────────────────────────────────────────────
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }
  if (username === 'admin' && password === 'demo123') {
    const secret = process.env.JWT_SECRET || 'rmm-prod-jwt-secret-2024';
    const token = jwt.sign(
      { sub: 'demo-user-001', email: 'admin@rmm-demo.local', name: 'Admin User', iss: 'rmm-demo' },
      secret,
      { algorithm: 'HS256', expiresIn: '24h' }
    );
    res.json({ token, user: { id: 'demo-user-001', name: 'Admin User', email: 'admin@rmm-demo.local', role: 'admin' } });
    return;
  }
  res.status(401).json({ error: 'Invalid username or password' });
});

// ─── Auth middleware ──────────────────────────────────────────────────────────
function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header', statusCode: 401 });
      return;
    }
    const token = authHeader.substring(7);
    let decoded: Record<string, unknown> | null = null;
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret) {
      try {
        decoded = jwt.verify(token, jwtSecret) as Record<string, unknown>;
      } catch {
        decoded = jwt.decode(token) as Record<string, unknown> | null;
      }
    } else {
      decoded = jwt.decode(token) as Record<string, unknown> | null;
    }
    if (!decoded) {
      res.status(401).json({ error: 'Invalid token', statusCode: 401 });
      return;
    }
    const tenantId = (decoded.tid || decoded.tenant_id || 'demo-tenant') as string;
    const userId  = (decoded.oid || decoded.sub || 'unknown-user') as string;
    (req as unknown as Record<string, unknown>)._tenantId = tenantId;
    (req as unknown as Record<string, unknown>)._userId   = userId;
    (req as unknown as Record<string, unknown>)._token    = token;
    next();
  } catch (err) {
    logger.error('authMiddleware error:', err);
    res.status(500).json({ error: 'Internal server error', statusCode: 500 });
  }
}

// ─── Tenant middleware ────────────────────────────────────────────────────────
async function tenantMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = (req as unknown as Record<string, unknown>)._tenantId as string;
    if (!tenantId) {
      res.status(401).json({ error: 'Missing tenant context', statusCode: 401 });
      return;
    }

    const supabase = getSupabase();
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (error || !tenant) {
      // For demo-tenant, create a virtual tenant context without DB lookup
      if (tenantId === 'demo-tenant') {
        req.tenant = { id: 'demo-tenant', office365_tenant_id: undefined, name: 'Demo Tenant', subscription_tier: 'demo' };
        next();
        return;
      }
      res.status(401).json({ error: 'Invalid tenant', statusCode: 401 });
      return;
    }

    req.tenant = { id: tenant.id, office365_tenant_id: tenant.office365_tenant_id, name: tenant.name, subscription_tier: tenant.subscription_tier };
    next();
  } catch (err) {
    logger.error('tenantMiddleware error:', err);
    res.status(500).json({ error: 'Internal server error', statusCode: 500 });
  }
}

// Apply auth + tenant to all /api/ routes (except /api/auth and /api/health)
app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/auth') || req.path === '/health') return next();
  authMiddleware(req, res, next);
});
app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/auth') || req.path === '/health') return next();
  tenantMiddleware(req, res, next);
});

// ─── Devices routes ───────────────────────────────────────────────────────────
const devicesRouter = express.Router();

devicesRouter.post('/register', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
    const { device_id, device_name, os, os_version, hardware_id, user_id } = req.body as Record<string, string>;
    if (!device_id || !device_name || !os) {
      res.status(400).json({ error: 'Missing required fields: device_id, device_name, os' }); return;
    }
    const supabase = getSupabase();
    const { data: existing } = await supabase.from('devices').select('id').eq('tenant_id', req.tenant.id).eq('device_id', device_id).single();
    if (existing) { res.status(400).json({ error: 'Device already registered' }); return; }
    const { data: device, error } = await supabase.from('devices').insert({ tenant_id: req.tenant.id, device_id, device_name, os, os_version, hardware_id, user_id, status: 'offline', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single();
    if (error) { logger.error('Register device:', error); res.status(500).json({ error: 'Failed to register device' }); return; }
    res.status(201).json({ data: device, statusCode: 201 });
  } catch (err) { logger.error('Register device error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

devicesRouter.get('/', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
    const limit  = parseInt(req.query.limit  as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const supabase = getSupabase();
    let query = supabase.from('devices').select('*').eq('tenant_id', req.tenant.id).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (req.query.status) query = query.eq('status', req.query.status as string);
    const { data: devices, error } = await query;
    if (error) { logger.error('List devices:', error); res.status(500).json({ error: 'Failed to list devices' }); return; }
    res.json({ data: devices || [], count: (devices || []).length, limit, offset, statusCode: 200 });
  } catch (err) { logger.error('List devices error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

devicesRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
    const supabase = getSupabase();
    const { data: device, error } = await supabase.from('devices').select('*').eq('tenant_id', req.tenant.id).eq('id', req.params.id).single();
    if (error || !device) { res.status(404).json({ error: 'Device not found' }); return; }
    const { data: telemetry } = await supabase.from('device_telemetry').select('*').eq('device_id', req.params.id).order('timestamp', { ascending: false }).limit(1).single();
    res.json({ data: { ...device, latest_telemetry: telemetry || null }, statusCode: 200 });
  } catch (err) { logger.error('Get device error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

devicesRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
    const { status, ip_address, last_seen } = req.body as { status?: string; ip_address?: string; last_seen?: string };
    if (!status) { res.status(400).json({ error: 'Missing required field: status' }); return; }
    if (!['online', 'offline', 'error', 'maintenance'].includes(status)) { res.status(400).json({ error: 'Invalid status value' }); return; }
    const supabase = getSupabase();
    const { data: device, error } = await supabase.from('devices').update({ status, ip_address, last_seen: last_seen || new Date().toISOString(), updated_at: new Date().toISOString() }).eq('tenant_id', req.tenant.id).eq('id', req.params.id).select().single();
    if (error || !device) { res.status(404).json({ error: 'Device not found' }); return; }
    res.json({ data: device, statusCode: 200 });
  } catch (err) { logger.error('Update device error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.use('/api/devices', devicesRouter);

// ─── Telemetry routes ─────────────────────────────────────────────────────────
app.post('/api/devices/:device_id/telemetry', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
    const { cpu_percent, ram_percent, disk_percent, network_bytes_sec } = req.body as { cpu_percent?: number; ram_percent?: number; disk_percent?: number; network_bytes_sec?: number };
    if (cpu_percent === undefined || ram_percent === undefined || disk_percent === undefined) { res.status(400).json({ error: 'Missing required fields' }); return; }
    if ([cpu_percent, ram_percent, disk_percent].some(v => v < 0 || v > 100)) { res.status(400).json({ error: 'Percentage values must be between 0 and 100' }); return; }
    const supabase = getSupabase();
    const { data: device } = await supabase.from('devices').select('id').eq('tenant_id', req.tenant.id).eq('id', req.params.device_id).single();
    if (!device) { res.status(404).json({ error: 'Device not found' }); return; }
    const { data: telemetry, error } = await supabase.from('device_telemetry').insert({ device_id: req.params.device_id, cpu_percent, ram_percent, disk_percent, network_bytes_sec: network_bytes_sec || 0, timestamp: new Date().toISOString() }).select().single();
    if (error) { logger.error('Store telemetry:', error); res.status(500).json({ error: 'Failed to store telemetry' }); return; }
    res.status(201).json({ data: telemetry, statusCode: 201 });
  } catch (err) { logger.error('Telemetry error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.get('/api/devices/:device_id/telemetry', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
    const limit = parseInt(req.query.limit as string) || 100;
    const supabase = getSupabase();
    const { data: device } = await supabase.from('devices').select('id').eq('tenant_id', req.tenant.id).eq('id', req.params.device_id).single();
    if (!device) { res.status(404).json({ error: 'Device not found' }); return; }
    const { data: telemetry, error } = await supabase.from('device_telemetry').select('*').eq('device_id', req.params.device_id).order('timestamp', { ascending: false }).limit(limit);
    if (error) { logger.error('Get telemetry:', error); res.status(500).json({ error: 'Failed to fetch telemetry' }); return; }
    res.json({ data: telemetry || [], count: (telemetry || []).length, statusCode: 200 });
  } catch (err) { logger.error('Get telemetry error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// ─── Commands routes ──────────────────────────────────────────────────────────
const commandsRouter = express.Router();

commandsRouter.get('/:device_id/pending', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
    const limit = parseInt(req.query.limit as string) || 10;
    const supabase = getSupabase();
    const { data: device } = await supabase.from('devices').select('id').eq('tenant_id', req.tenant.id).eq('id', req.params.device_id).single();
    if (!device) { res.status(404).json({ error: 'Device not found' }); return; }
    const { data: commands, error } = await supabase.from('commands').select('*').eq('tenant_id', req.tenant.id).eq('device_id', req.params.device_id).eq('status', 'pending').order('created_at', { ascending: true }).limit(limit);
    if (error) { logger.error('Get pending commands:', error); res.status(500).json({ error: 'Failed to fetch commands' }); return; }
    res.json({ data: commands || [], count: (commands || []).length, statusCode: 200 });
  } catch (err) { logger.error('Get pending commands error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

commandsRouter.post('/:device_id', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
    const { command_type, params } = req.body as { command_type?: string; params?: Record<string, unknown> };
    if (!command_type) { res.status(400).json({ error: 'Missing required field: command_type' }); return; }
    const supabase = getSupabase();
    const { data: device } = await supabase.from('devices').select('id').eq('tenant_id', req.tenant.id).eq('id', req.params.device_id).single();
    if (!device) { res.status(404).json({ error: 'Device not found' }); return; }
    const { data: command, error } = await supabase.from('commands').insert({ tenant_id: req.tenant.id, device_id: req.params.device_id, command_type, params: params || {}, status: 'pending', retry_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single();
    if (error) { logger.error('Queue command:', error); res.status(500).json({ error: 'Failed to queue command' }); return; }
    res.status(201).json({ data: command, statusCode: 201 });
  } catch (err) { logger.error('Queue command error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

commandsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
    const { status, exit_code, output } = req.body as { status?: string; exit_code?: number; output?: string };
    if (!status) { res.status(400).json({ error: 'Missing required field: status' }); return; }
    if (!['executing', 'success', 'failed', 'timeout'].includes(status)) { res.status(400).json({ error: 'Invalid status value' }); return; }
    const supabase = getSupabase();
    const { data: command, error } = await supabase.from('commands').update({ status, exit_code, output, executed_at: status === 'executing' ? new Date().toISOString() : undefined, updated_at: new Date().toISOString() }).eq('tenant_id', req.tenant.id).eq('id', req.params.id).select().single();
    if (error || !command) { res.status(404).json({ error: 'Command not found' }); return; }
    res.json({ data: command, statusCode: 200 });
  } catch (err) { logger.error('Update command error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

commandsRouter.get('/:device_id/history', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
    const limit = parseInt(req.query.limit as string) || 50;
    const supabase = getSupabase();
    const { data: device } = await supabase.from('devices').select('id').eq('tenant_id', req.tenant.id).eq('id', req.params.device_id).single();
    if (!device) { res.status(404).json({ error: 'Device not found' }); return; }
    const { data: commands, error } = await supabase.from('commands').select('*').eq('tenant_id', req.tenant.id).eq('device_id', req.params.device_id).neq('status', 'pending').order('executed_at', { ascending: false }).limit(limit);
    if (error) { logger.error('Get command history:', error); res.status(500).json({ error: 'Failed to fetch command history' }); return; }
    res.json({ data: commands || [], count: (commands || []).length, statusCode: 200 });
  } catch (err) { logger.error('Get command history error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.use('/api/commands', commandsRouter);

// ─── 404 & Error handlers ─────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found', statusCode: 404 }));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error('Unhandled error:', message);
  res.status(500).json({ error: message || 'Internal server error', statusCode: 500 });
});

// ─── Vercel serverless export ─────────────────────────────────────────────────
export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as unknown as Request, res as unknown as Response);
}
