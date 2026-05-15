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
// ─── Versions ────────────────────────────────────────────────────────────────
const EXPECTED_AGENT_VERSION = '1.1.1';
const APP_VERSION             = '1.1.0';

app.get('/api/system/info', (_req, res) => {
  res.json({
    app_version:   APP_VERSION,
    agent_version: EXPECTED_AGENT_VERSION,
    build_date:    '2026-05-14',
  });
});

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
      // For demo JWT tokens (no tid/tenant_id claim), use the seeded demo tenant
      const DEMO_TENANT_ID = 'a0000000-dead-beef-0000-000000000001';
      if (tenantId === 'demo-tenant') {
        req.tenant = { id: DEMO_TENANT_ID, office365_tenant_id: undefined, name: 'Demo Tenant', subscription_tier: 'demo' };
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
  if (req.path.startsWith('/auth') || req.path === '/health' || req.path.startsWith('/system')) return next();
  authMiddleware(req, res, next);
});
app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/auth') || req.path === '/health' || req.path.startsWith('/system')) return next();
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
    const { data: devicesRaw, error } = await query;
    if (error) { logger.error('List devices:', error); res.status(500).json({ error: 'Failed to list devices' }); return; }

    // Auto-offline: mark devices as offline if last_seen > 3 minutes ago
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const devices = (devicesRaw || []).map((d: Record<string, unknown>) => {
      if (d.status === 'online' && d.last_seen && (d.last_seen as string) < threeMinutesAgo) {
        return { ...d, status: 'offline' };
      }
      return d;
    });
    res.json({ data: devices, count: devices.length, limit, offset, statusCode: 200 });
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
    const { status, ip_address, last_seen, agent_version } = req.body as { status?: string; ip_address?: string; last_seen?: string; agent_version?: string };
    if (!status) { res.status(400).json({ error: 'Missing required field: status' }); return; }
    if (!['online', 'offline', 'error', 'maintenance'].includes(status)) { res.status(400).json({ error: 'Invalid status value' }); return; }
    const supabase = getSupabase();
    const updatePayload: Record<string, unknown> = { status, ip_address, last_seen: last_seen || new Date().toISOString(), updated_at: new Date().toISOString() };
    if (agent_version) updatePayload.agent_version = agent_version;
    const { data: device, error } = await supabase.from('devices').update(updatePayload).eq('tenant_id', req.tenant.id).eq('id', req.params.id).select().single();
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
    // Update last_seen + ensure status=online on every telemetry
    await supabase.from('devices').update({ last_seen: new Date().toISOString(), status: 'online', updated_at: new Date().toISOString() }).eq('id', req.params.device_id).eq('tenant_id', req.tenant.id);

    // ─── Auto-alert based on configured thresholds ──────────────────────────
    try {
      const [{ data: globalCfg }, { data: deviceCfg }] = await Promise.all([
        supabase.from('device_configs').select('config').eq('tenant_id', req.tenant.id).eq('device_id', GLOBAL_CONFIG_KEY).single(),
        supabase.from('device_configs').select('config').eq('tenant_id', req.tenant.id).eq('device_id', req.params.device_id).single(),
      ]);
      const cfg = mergeConfig(globalCfg?.config || {}, deviceCfg?.config || {});
      const checks: { metric: string; value: number; threshold: number; type: string }[] = [
        { metric: 'CPU',  value: cpu_percent,  threshold: cfg.alerts.cpuThreshold,  type: 'cpu_high'  },
        { metric: 'RAM',  value: ram_percent,  threshold: cfg.alerts.ramThreshold,  type: 'ram_high'  },
        { metric: 'Disk', value: disk_percent, threshold: cfg.alerts.diskThreshold, type: 'disk_high' },
      ];
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      for (const check of checks) {
        if (check.value >= check.threshold) {
          // Skip if recent unacknowledged alert of same type already exists
          const { data: recent } = await supabase.from('alerts').select('id').eq('tenant_id', req.tenant.id).eq('device_id', req.params.device_id).eq('alert_type', check.type).eq('acknowledged', false).gte('created_at', fiveMinutesAgo).limit(1).single();
          if (!recent) {
            const severity = check.value >= 95 ? 'critical' : 'warning';
            await supabase.from('alerts').insert({ tenant_id: req.tenant.id, device_id: req.params.device_id, alert_type: check.type, severity, message: `${check.metric} at ${check.value}% (threshold: ${check.threshold}%)`, acknowledged: false, created_at: new Date().toISOString() });
            logger.info(`Alert created: ${check.type} ${check.value}% on device ${req.params.device_id}`);
          }
        }
      }
    } catch (alertErr) { logger.warn('Auto-alert error (non-fatal):', alertErr); }

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

// ─── Config / Settings routes ────────────────────────────────────────────────
// Sentinel UUID used as device_id for tenant-wide global defaults
const GLOBAL_CONFIG_KEY = '00000000-0000-0000-0000-000000000000';

const DEFAULT_CONFIG = {
  telemetryInterval: 30,   // seconds between telemetry reports
  pollInterval:      15,   // seconds between command polls
  commandTimeout:    30,   // seconds before a command is killed
  maxOutputLength:  1000,  // chars kept from command output
  alerts: {
    cpuThreshold:  80,     // % CPU  → creates alert
    ramThreshold:  90,     // % RAM  → creates alert
    diskThreshold: 85,     // % Disk → creates alert
  },
};

type AgentConfig = typeof DEFAULT_CONFIG;

function mergeConfig(...layers: Partial<AgentConfig>[]): AgentConfig {
  let result: AgentConfig = { ...DEFAULT_CONFIG, alerts: { ...DEFAULT_CONFIG.alerts } };
  for (const layer of layers) {
    if (!layer) continue;
    const { alerts, ...rest } = layer as Record<string, unknown>;
    result = { ...result, ...rest } as AgentConfig;
    if (alerts && typeof alerts === 'object') {
      result.alerts = { ...result.alerts, ...(alerts as Record<string, number>) };
    }
  }
  return result;
}

// GET /api/config — global defaults for the tenant
app.get('/api/config', async (req: Request, res: Response) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  try {
    const { data } = await getSupabase()
      .from('device_configs')
      .select('config')
      .eq('tenant_id', req.tenant.id)
      .eq('device_id', GLOBAL_CONFIG_KEY)
      .single();
    const merged = mergeConfig(data?.config || {});
    res.json({ data: merged, isDefault: !data, statusCode: 200 });
  } catch {
    res.json({ data: DEFAULT_CONFIG, isDefault: true, statusCode: 200 });
  }
});

// PUT /api/config — save global defaults
app.put('/api/config', async (req: Request, res: Response) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  try {
    const config = req.body as Record<string, unknown>;
    const { error } = await getSupabase()
      .from('device_configs')
      .upsert(
        { tenant_id: req.tenant.id, device_id: GLOBAL_CONFIG_KEY, config, updated_at: new Date().toISOString() },
        { onConflict: 'tenant_id,device_id' }
      );
    if (error) {
      logger.error('Save global config:', error);
      res.status(503).json({ error: 'Settings table not ready — run supabase/add_device_configs.sql first', statusCode: 503 });
      return;
    }
    res.json({ data: mergeConfig(config), statusCode: 200 });
  } catch (err) { logger.error('PUT /api/config:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// GET /api/devices/:id/config — merged config (defaults + global + device overrides)
app.get('/api/devices/:id/config', async (req: Request, res: Response) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  try {
    const supabase = getSupabase();
    const [{ data: globalRow }, { data: deviceRow }] = await Promise.all([
      supabase.from('device_configs').select('config').eq('tenant_id', req.tenant.id).eq('device_id', GLOBAL_CONFIG_KEY).single(),
      supabase.from('device_configs').select('config').eq('tenant_id', req.tenant.id).eq('device_id', req.params.id).single(),
    ]);
    const merged = mergeConfig(globalRow?.config || {}, deviceRow?.config || {});
    res.json({ data: merged, globalConfig: globalRow?.config || null, deviceOverride: deviceRow?.config || null, statusCode: 200 });
  } catch {
    res.json({ data: DEFAULT_CONFIG, globalConfig: null, deviceOverride: null, statusCode: 200 });
  }
});

// PUT /api/devices/:id/config — save device-specific overrides
app.put('/api/devices/:id/config', async (req: Request, res: Response) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  try {
    const config = req.body as Record<string, unknown>;
    const { error } = await getSupabase()
      .from('device_configs')
      .upsert(
        { tenant_id: req.tenant.id, device_id: req.params.id, config, updated_at: new Date().toISOString() },
        { onConflict: 'tenant_id,device_id' }
      );
    if (error) {
      logger.error('Save device config:', error);
      res.status(503).json({ error: 'Settings table not ready — run supabase/add_device_configs.sql first', statusCode: 503 });
      return;
    }
    // Return merged view
    const { data: globalRow } = await getSupabase().from('device_configs').select('config').eq('tenant_id', req.tenant.id).eq('device_id', GLOBAL_CONFIG_KEY).single();
    res.json({ data: mergeConfig(globalRow?.config || {}, config), deviceOverride: config, statusCode: 200 });
  } catch (err) { logger.error('PUT device config:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// DELETE /api/devices/:id/config — remove device overrides (reverts to global)
app.delete('/api/devices/:id/config', async (req: Request, res: Response) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  try {
    await getSupabase().from('device_configs').delete().eq('tenant_id', req.tenant.id).eq('device_id', req.params.id);
    res.json({ data: null, statusCode: 200 });
  } catch (err) { logger.error('DELETE device config:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// ─── Alerts routes ────────────────────────────────────────────────────────────
app.get('/api/alerts', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
    const limit = parseInt(req.query.limit as string) || 50;
    const supabase = getSupabase();
    const { data: alerts, error } = await supabase
      .from('alerts')
      .select('*')
      .eq('tenant_id', req.tenant.id)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) { logger.error('Get alerts:', error); res.status(500).json({ error: 'Failed to fetch alerts' }); return; }
    res.json({ data: alerts || [], count: (alerts || []).length, statusCode: 200 });
  } catch (err) { logger.error('Alerts error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.patch('/api/alerts/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
    const supabase = getSupabase();
    const { data: alert, error } = await supabase
      .from('alerts')
      .update({ acknowledged: true, updated_at: new Date().toISOString() })
      .eq('tenant_id', req.tenant.id)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error || !alert) { res.status(404).json({ error: 'Alert not found' }); return; }
    res.json({ data: alert, statusCode: 200 });
  } catch (err) { logger.error('Acknowledge alert error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// ─── Deploy routes ────────────────────────────────────────────────────────────

// GET /api/deploy/history — historique des install_app / uninstall_app sur tout le parc
app.get('/api/deploy/history', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
    const limit = parseInt(req.query.limit as string) || 100;
    const supabase = getSupabase();
    const { data: commands, error } = await supabase
      .from('commands')
      .select('id, device_id, command_type, params, status, output, created_at, executed_at, updated_at')
      .eq('tenant_id', req.tenant.id)
      .in('command_type', ['install_app', 'uninstall_app'])
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) { logger.error('Deploy history:', error); res.status(500).json({ error: 'Failed to fetch deploy history' }); return; }

    // Joindre les noms des devices
    const deviceIds = [...new Set((commands || []).map(c => c.device_id))];
    let devicesMap: Record<string, string> = {};
    if (deviceIds.length) {
      const { data: devices } = await supabase
        .from('devices')
        .select('id, device_name')
        .in('id', deviceIds);
      (devices || []).forEach(d => { devicesMap[d.id] = d.device_name; });
    }

    const enriched = (commands || []).map(c => ({
      ...c,
      device_name: devicesMap[c.device_id] || c.device_id,
    }));

    res.json({ data: enriched, count: enriched.length, statusCode: 200 });
  } catch (err) { logger.error('Deploy history error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// ─── 404 & Error handlers ─────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found', statusCode: 404 }));

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error('Unhandled error:', message);
  res.status(500).json({ error: message || 'Internal server error', statusCode: 500 });
});

// ─── Heartbeat watchdog : marque offline les devices silencieux > 5 min ──────
app.post('/api/system/watchdog', async (_req, res) => {
  try {
    const supabase = getSupabase();
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('devices')
      .update({ status: 'offline', updated_at: new Date().toISOString() })
      .eq('status', 'online')
      .lt('last_seen', cutoff)
      .select('device_name');
    if (error) { res.status(500).json({ error: error.message }); return; }
    const names = (data || []).map((d: Record<string, unknown>) => d.device_name);
    if (names.length) logger.info('Watchdog marked offline:', names);
    res.json({ marked_offline: names, cutoff });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'error' });
  }
});

// ─── Vercel serverless export ─────────────────────────────────────────────────
export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as unknown as Request, res as unknown as Response);
}
