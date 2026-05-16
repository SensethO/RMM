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
const EXPECTED_AGENT_VERSION = '1.1.5';
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

// DEBUG: Check environment variables (remove in production)
app.get('/api/debug/config', (_req, res) => {
  res.json({
    NODE_ENV: process.env.NODE_ENV,
    SUPER_ADMIN_GROUP_ID: process.env.SUPER_ADMIN_GROUP_ID || 'NOT_SET',
    JWT_SECRET: process.env.JWT_SECRET ? '***SET***' : 'NOT_SET',
    SUPABASE_URL: process.env.SUPABASE_URL ? '***SET***' : 'NOT_SET',
  });
});

// ─── Auth route (no middleware) ───────────────────────────────────────────────
app.post('/api/auth/login', (req: Request, res: Response) => {
  const { username, password, tenant_id } = req.body as { username?: string; password?: string; tenant_id?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }
  if (username === 'admin' && password === 'demo123') {
    const secret = process.env.JWT_SECRET || 'rmm-prod-jwt-secret-2024';
    const payload: Record<string, unknown> = {
      sub: 'demo-user-001', email: 'admin@rmm-demo.local', name: 'Admin User', iss: 'rmm-demo',
    };
    // If a tenant_id is provided (e.g., from a per-company agent), embed it so
    // tenantMiddleware can look up the correct tenant via tenants.id
    if (tenant_id) payload.tenant_id = tenant_id;
    const token = jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '24h' });
    res.json({ token, user: { id: 'demo-user-001', name: 'Admin User', email: 'admin@rmm-demo.local', role: 'admin' } });
    return;
  }
  res.status(401).json({ error: 'Invalid username or password' });
});

// ─── Auth middleware ──────────────────────────────────────────────────────────
// SUPER_ADMIN_GROUP_ID: Configure this to your Azure AD group GUID for RMM super-admins
// Example: '00000000-0000-0000-0000-000000000001'
const SUPER_ADMIN_GROUP_ID = process.env.SUPER_ADMIN_GROUP_ID || '';
logger.info(`[STARTUP] SUPER_ADMIN_GROUP_ID configured: ${SUPER_ADMIN_GROUP_ID ? 'YES (' + SUPER_ADMIN_GROUP_ID + ')' : 'NO - super-admin disabled'}`);

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
    const userId  = (decoded.oid || decoded.sub || 'unknown-user') as string;
    // Distinguish Azure AD tokens (claim: 'tid') from custom JWTs (claim: 'tenant_id')
    const azureTid       = decoded.tid        as string | undefined;  // Azure AD tenant GUID
    const customTenantId = decoded.tenant_id  as string | undefined;  // custom JWT claim
    const groups         = (decoded.groups || []) as string[];        // Azure AD group IDs

    // Check if user is super-admin (member of SUPER_ADMIN_GROUP_ID)
    const isSuperAdmin = SUPER_ADMIN_GROUP_ID && groups.includes(SUPER_ADMIN_GROUP_ID);

    (req as unknown as Record<string, unknown>)._azureTid       = azureTid;
    (req as unknown as Record<string, unknown>)._customTenantId = customTenantId;
    (req as unknown as Record<string, unknown>)._userId         = userId;
    (req as unknown as Record<string, unknown>)._token          = token;
    (req as unknown as Record<string, unknown>)._isSuperAdmin   = isSuperAdmin;

    if (isSuperAdmin) logger.info(`Super-admin access for user ${userId}`);
    next();
  } catch (err) {
    logger.error('authMiddleware error:', err);
    res.status(500).json({ error: 'Internal server error', statusCode: 500 });
  }
}

// ─── Tenant middleware ────────────────────────────────────────────────────────
const DEMO_TENANT_ID = 'a0000000-dead-beef-0000-000000000001';

async function tenantMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const r = req as unknown as Record<string, unknown>;
    const azureTid       = r._azureTid       as string | undefined;
    const customTenantId = r._customTenantId as string | undefined;
    const isSuperAdmin   = r._isSuperAdmin   as boolean | undefined;

    // Super-admin users can see ALL tenants (no tenant isolation)
    if (isSuperAdmin) {
      (req as unknown as Record<string, unknown>)._tenantId = null;
      req.tenant = {
        id: 'super-admin-all-tenants',  // Placeholder ID for typing
        office365_tenant_id: undefined,
        name: 'Super-Admin (All Tenants)',
        subscription_tier: 'enterprise',
        isSuperAdmin: true,
      };
      logger.info('Super-admin context: viewing all tenants');
      next(); return;
    }

    const supabase = getSupabase();

    if (azureTid) {
      // Azure AD token → look up by office365_tenant_id
      const { data: tenant } = await supabase
        .from('tenants')
        .select('*')
        .eq('office365_tenant_id', azureTid)
        .single();
      if (tenant) {
        req.tenant = { id: tenant.id, office365_tenant_id: tenant.office365_tenant_id, name: tenant.name, subscription_tier: tenant.subscription_tier };
        next(); return;
      }
      // Azure tenant not registered yet — allow access with azureTid as the effective id
      // so the MSP can still log in and register their tenant
      req.tenant = { id: azureTid, office365_tenant_id: azureTid, name: 'Unregistered Azure Tenant', subscription_tier: 'trial' };
      next(); return;
    }

    if (customTenantId) {
      // Custom JWT → look up by Supabase tenant id
      const { data: tenant } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', customTenantId)
        .single();
      if (tenant) {
        req.tenant = { id: tenant.id, office365_tenant_id: tenant.office365_tenant_id, name: tenant.name, subscription_tier: tenant.subscription_tier };
        next(); return;
      }
      res.status(401).json({ error: 'Tenant not found', statusCode: 401 });
      return;
    }

    // No tenant claim → demo fallback
    req.tenant = { id: DEMO_TENANT_ID, office365_tenant_id: undefined, name: 'Demo Tenant', subscription_tier: 'demo' };
    next();
  } catch (err) {
    logger.error('tenantMiddleware error:', err);
    res.status(500).json({ error: 'Internal server error', statusCode: 500 });
  }
}

// Apply auth + tenant to all /api/ routes (except /api/auth, /api/health, /api/sessions)
// /api/tenants only requires auth (no tenant isolation — it's a cross-tenant admin resource)
app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/auth') || req.path === '/health' || req.path.startsWith('/system') || req.path.startsWith('/sessions')) return next();
  authMiddleware(req, res, next);
});
app.use('/api/', (req, res, next) => {
  if (req.path.startsWith('/auth') || req.path === '/health' || req.path.startsWith('/system') || req.path.startsWith('/sessions') || req.path.startsWith('/tenants')) return next();
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

    // Vérifier si le device existe déjà sous CE tenant → retourner l'existant
    let existingQuery = supabase.from('devices').select('*');
    if (req.tenant.id) {
      existingQuery = existingQuery.eq('tenant_id', req.tenant.id);
    }
    const { data: existingInTenant } = await existingQuery.eq('device_id', device_id).single();
    if (existingInTenant) {
      // Mettre à jour et retourner
      const { data: updated } = await supabase.from('devices')
        .update({ device_name, os, os_version, hardware_id, user_id, updated_at: new Date().toISOString() })
        .eq('id', existingInTenant.id).select().single();
      res.json({ data: updated || existingInTenant, statusCode: 200 });
      return;
    }

    // Tenter l'insertion (peut échouer si device_id UNIQUE global encore en place)
    const { data: device, error } = await supabase.from('devices')
      .insert({ tenant_id: req.tenant.id, device_id, device_name, os, os_version, hardware_id, user_id,
                status: 'offline', created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .select().single();

    if (error) {
      // Violation de contrainte UNIQUE → le device existe sous un autre tenant
      // On le migre vers le tenant courant (cas MSP : changement de tenant)
      if (error.code === '23505') {
        logger.warn(`device_id ${device_id} existe sous un autre tenant — migration vers ${req.tenant.id}`);
        const { data: oldDevice } = await supabase.from('devices').select('*').eq('device_id', device_id).single();
        if (oldDevice) {
          const { data: migrated, error: migErr } = await supabase.from('devices')
            .update({ tenant_id: req.tenant.id, device_name, os, os_version, hardware_id, user_id,
                      updated_at: new Date().toISOString() })
            .eq('id', oldDevice.id).select().single();
          if (migErr) { logger.error('Migrate device:', migErr); res.status(500).json({ error: 'Failed to migrate device' }); return; }
          res.status(201).json({ data: migrated, statusCode: 201, migrated: true });
          return;
        }
      }
      logger.error('Register device:', error);
      res.status(500).json({ error: 'Failed to register device' }); return;
    }
    res.status(201).json({ data: device, statusCode: 201 });
  } catch (err) { logger.error('Register device error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

devicesRouter.get('/', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
    const limit  = parseInt(req.query.limit  as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;
    const supabase = getSupabase();
    let query = supabase.from('devices').select('*');

    // Super-admin sees all devices
    const isSuperAdmin = (req.tenant as unknown as Record<string, unknown>).isSuperAdmin as boolean | undefined;
    if (!isSuperAdmin && req.tenant.id) {
      query = query.eq('tenant_id', req.tenant.id);
    } else if (isSuperAdmin) {
      logger.info('Super-admin listing all devices');
    }

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);
    if (req.query.status) query = query.eq('status', req.query.status as string);
    const { data: devicesRaw, error } = await query;
    if (error) { logger.error('List devices:', error); res.status(500).json({ error: 'Failed to list devices' }); return; }

    // Auto-offline: mark devices as offline if last_seen > 5 minutes ago
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const devices = (devicesRaw || []).map((d: Record<string, unknown>) => {
      if (d.status === 'online' && d.last_seen && (d.last_seen as string) < fiveMinutesAgo) {
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
    let query = supabase.from('devices').select('*');

    // Super-admin can access any device; others only their tenant's devices
    if (req.tenant.id) {
      query = query.eq('tenant_id', req.tenant.id);
    }

    const { data: device, error } = await query.eq('id', req.params.id).single();
    if (error || !device) { res.status(404).json({ error: 'Device not found' }); return; }
    const { data: telemetry } = await supabase.from('device_telemetry').select('*').eq('device_id', req.params.id).order('timestamp', { ascending: false }).limit(1).single();
    // Apply same auto-offline logic as list endpoint
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const effectiveStatus = (device.status === 'online' && device.last_seen && device.last_seen < fiveMinutesAgo)
      ? 'offline' : device.status;
    res.json({ data: { ...device, status: effectiveStatus, latest_telemetry: telemetry || null }, statusCode: 200 });
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

    let updateQuery = supabase.from('devices').update(updatePayload);
    if (req.tenant.id) {
      updateQuery = updateQuery.eq('tenant_id', req.tenant.id);
    }

    const { data: device, error } = await updateQuery.eq('id', req.params.id).select().single();
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
    let deviceQuery = supabase.from('devices').select('id');
    if (req.tenant.id) {
      deviceQuery = deviceQuery.eq('tenant_id', req.tenant.id);
    }
    const { data: device } = await deviceQuery.eq('id', req.params.device_id).single();
    if (!device) { res.status(404).json({ error: 'Device not found' }); return; }
    const { data: telemetry, error } = await supabase.from('device_telemetry').insert({ device_id: req.params.device_id, cpu_percent, ram_percent, disk_percent, network_bytes_sec: network_bytes_sec || 0, timestamp: new Date().toISOString() }).select().single();
    if (error) { logger.error('Store telemetry:', error); res.status(500).json({ error: 'Failed to store telemetry' }); return; }
    // Update last_seen + ensure status=online on every telemetry
    let updateQuery = supabase.from('devices').update({ last_seen: new Date().toISOString(), status: 'online', updated_at: new Date().toISOString() }).eq('id', req.params.device_id);
    if (req.tenant.id) {
      updateQuery = updateQuery.eq('tenant_id', req.tenant.id);
    }
    await updateQuery;

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
    let deviceQuery = supabase.from('devices').select('id');
    if (req.tenant.id) {
      deviceQuery = deviceQuery.eq('tenant_id', req.tenant.id);
    }
    const { data: device } = await deviceQuery.eq('id', req.params.device_id).single();
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
    let deviceQuery = supabase.from('devices').select('id');
    if (req.tenant.id) {
      deviceQuery = deviceQuery.eq('tenant_id', req.tenant.id);
    }
    const { data: device } = await deviceQuery.eq('id', req.params.device_id).single();
    if (!device) { res.status(404).json({ error: 'Device not found' }); return; }
    let commandsQuery = supabase.from('commands').select('*');
    if (req.tenant.id) {
      commandsQuery = commandsQuery.eq('tenant_id', req.tenant.id);
    }
    const { data: commands, error } = await commandsQuery.eq('device_id', req.params.device_id).eq('status', 'pending').order('created_at', { ascending: true }).limit(limit);
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
    let deviceQuery = supabase.from('devices').select('id');
    if (req.tenant.id) {
      deviceQuery = deviceQuery.eq('tenant_id', req.tenant.id);
    }
    const { data: device } = await deviceQuery.eq('id', req.params.device_id).single();
    if (!device) { res.status(404).json({ error: 'Device not found' }); return; }

    // For super-admin, need to find the device's actual tenant_id to use in command
    let deviceTenantId = req.tenant.id;
    if (req.tenant.id === null) {
      const { data: actualDevice } = await supabase.from('devices').select('tenant_id').eq('id', req.params.device_id).single();
      deviceTenantId = actualDevice?.tenant_id;
    }

    const { data: command, error } = await supabase.from('commands').insert({ tenant_id: deviceTenantId, device_id: req.params.device_id, command_type, params: params || {}, status: 'pending', retry_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select().single();
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
    let updateQuery = supabase.from('commands').update({ status, exit_code, output, executed_at: status === 'executing' ? new Date().toISOString() : undefined, updated_at: new Date().toISOString() });
    if (req.tenant.id) {
      updateQuery = updateQuery.eq('tenant_id', req.tenant.id);
    }
    const { data: command, error } = await updateQuery.eq('id', req.params.id).select().single();
    if (error || !command) { res.status(404).json({ error: 'Command not found' }); return; }
    res.json({ data: command, statusCode: 200 });
  } catch (err) { logger.error('Update command error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

commandsRouter.get('/:device_id/history', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
    const limit = parseInt(req.query.limit as string) || 50;
    const supabase = getSupabase();
    let deviceQuery = supabase.from('devices').select('id');
    if (req.tenant.id) {
      deviceQuery = deviceQuery.eq('tenant_id', req.tenant.id);
    }
    const { data: device } = await deviceQuery.eq('id', req.params.device_id).single();
    if (!device) { res.status(404).json({ error: 'Device not found' }); return; }
    let commandsQuery = supabase.from('commands').select('*');
    if (req.tenant.id) {
      commandsQuery = commandsQuery.eq('tenant_id', req.tenant.id);
    }
    const { data: commands, error } = await commandsQuery.eq('device_id', req.params.device_id).neq('status', 'pending').order('executed_at', { ascending: false }).limit(limit);
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
    let query = getSupabase().from('device_configs').select('config');
    if (req.tenant.id) {
      query = query.eq('tenant_id', req.tenant.id);
    }
    const { data } = await query.eq('device_id', GLOBAL_CONFIG_KEY).single();
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
        { tenant_id: req.tenant.id || 'null', device_id: GLOBAL_CONFIG_KEY, config, updated_at: new Date().toISOString() },
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
    let globalQuery = supabase.from('device_configs').select('config');
    if (req.tenant.id) {
      globalQuery = globalQuery.eq('tenant_id', req.tenant.id);
    }
    let deviceQuery = supabase.from('device_configs').select('config');
    if (req.tenant.id) {
      deviceQuery = deviceQuery.eq('tenant_id', req.tenant.id);
    }
    const [{ data: globalRow }, { data: deviceRow }] = await Promise.all([
      globalQuery.eq('device_id', GLOBAL_CONFIG_KEY).single(),
      deviceQuery.eq('device_id', req.params.id).single(),
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
        { tenant_id: req.tenant.id || 'null', device_id: req.params.id, config, updated_at: new Date().toISOString() },
        { onConflict: 'tenant_id,device_id' }
      );
    if (error) {
      logger.error('Save device config:', error);
      res.status(503).json({ error: 'Settings table not ready — run supabase/add_device_configs.sql first', statusCode: 503 });
      return;
    }
    // Return merged view
    let globalQuery = getSupabase().from('device_configs').select('config');
    if (req.tenant.id) {
      globalQuery = globalQuery.eq('tenant_id', req.tenant.id);
    }
    const { data: globalRow } = await globalQuery.eq('device_id', GLOBAL_CONFIG_KEY).single();
    res.json({ data: mergeConfig(globalRow?.config || {}, config), deviceOverride: config, statusCode: 200 });
  } catch (err) { logger.error('PUT device config:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// DELETE /api/devices/:id/config — remove device overrides (reverts to global)
app.delete('/api/devices/:id/config', async (req: Request, res: Response) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  try {
    let deleteQuery = getSupabase().from('device_configs').delete();
    if (req.tenant.id) {
      deleteQuery = deleteQuery.eq('tenant_id', req.tenant.id);
    }
    await deleteQuery.eq('device_id', req.params.id);
    res.json({ data: null, statusCode: 200 });
  } catch (err) { logger.error('DELETE device config:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// ─── Alerts routes ────────────────────────────────────────────────────────────
app.get('/api/alerts', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
    const limit = parseInt(req.query.limit as string) || 50;
    const supabase = getSupabase();
    let query = supabase
      .from('alerts')
      .select('*');
    if (req.tenant.id) {
      query = query.eq('tenant_id', req.tenant.id);
    }
    const { data: alerts, error } = await query
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
    let updateQuery = supabase
      .from('alerts')
      .update({ acknowledged: true, updated_at: new Date().toISOString() });
    if (req.tenant.id) {
      updateQuery = updateQuery.eq('tenant_id', req.tenant.id);
    }
    const { data: alert, error } = await updateQuery
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
    let query = supabase
      .from('commands')
      .select('id, device_id, command_type, params, status, output, created_at, executed_at, updated_at');
    if (req.tenant.id) {
      query = query.eq('tenant_id', req.tenant.id);
    }
    const { data: commands, error } = await query
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

// ─── Tenants (MSP admin — no per-tenant isolation) ───────────────────────────
const tenantsRouter = express.Router();

// GET /api/tenants — list all tenants
tenantsRouter.get('/', async (_req, res) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.from('tenants').select('*').order('name');
    if (error) throw error;

    // Enrich with device count per tenant
    const tenantIds = (data || []).map((t: Record<string, unknown>) => t.id as string);
    let counts: Record<string, number> = {};
    if (tenantIds.length) {
      const { data: devCounts } = await supabase
        .from('devices')
        .select('tenant_id')
        .in('tenant_id', tenantIds);
      (devCounts || []).forEach((d: Record<string, unknown>) => {
        const tid = d.tenant_id as string;
        counts[tid] = (counts[tid] || 0) + 1;
      });
    }

    const enriched = (data || []).map((t: Record<string, unknown>) => ({
      ...t,
      device_count: counts[t.id as string] || 0,
    }));

    res.json({ data: enriched, count: enriched.length, statusCode: 200 });
  } catch (err) { logger.error('List tenants:', err); res.status(500).json({ error: 'Failed to list tenants' }); }
});

// POST /api/tenants — create new tenant
tenantsRouter.post('/', async (req, res) => {
  try {
    const { name, office365_tenant_id, subscription_tier } = req.body as Record<string, string>;
    if (!name) { res.status(400).json({ error: 'Missing required field: name' }); return; }
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('tenants')
      .insert({
        name,
        office365_tenant_id: office365_tenant_id || null,
        subscription_tier: subscription_tier || 'starter',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) { logger.error('Create tenant:', error); res.status(500).json({ error: 'Failed to create tenant' }); return; }
    res.status(201).json({ data, statusCode: 201 });
  } catch (err) { logger.error('Create tenant error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// PATCH /api/tenants/:id — update tenant
tenantsRouter.patch('/:id', async (req, res) => {
  try {
    const { name, office365_tenant_id, subscription_tier } = req.body as Record<string, string>;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('tenants')
      .update({ name, office365_tenant_id: office365_tenant_id || null, subscription_tier, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select('*')
      .single();
    if (error || !data) { res.status(404).json({ error: 'Tenant not found' }); return; }
    res.json({ data, statusCode: 200 });
  } catch (err) { logger.error('Update tenant error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// DELETE /api/tenants/:id — delete tenant (use with caution)
tenantsRouter.delete('/:id', async (req, res) => {
  try {
    const supabase = getSupabase();
    await supabase.from('tenants').delete().eq('id', req.params.id);
    res.json({ statusCode: 200 });
  } catch (err) { logger.error('Delete tenant error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

app.use('/api/tenants', tenantsRouter);

// ─── Organizations ────────────────────────────────────────────────────────────
const orgsRouter = express.Router();
orgsRouter.get('/', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  try {
    let query = getSupabase().from('organizations').select('*');
    if (req.tenant.id) {
      query = query.eq('tenant_id', req.tenant.id);
    }
    const { data, error } = await query.order('name');
    if (error) throw error;
    res.json({ data: data || [], statusCode: 200 });
  } catch { res.status(500).json({ error: 'Failed to fetch organizations' }); }
});
orgsRouter.post('/', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  const { name, type, description, address, city, country, phone, website } = req.body as Record<string, string>;
  if (!name) { res.status(400).json({ error: 'Missing required field: name' }); return; }
  try {
    const { data, error } = await getSupabase().from('organizations').insert({ tenant_id: req.tenant.id || 'null', name, type: type || 'company', description, address, city, country: country || 'France', phone, website, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select('*').single();
    if (error) throw error;
    res.status(201).json({ data, statusCode: 201 });
  } catch { res.status(500).json({ error: 'Failed to create organization' }); }
});
orgsRouter.patch('/:id', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  try {
    let updateQuery = getSupabase().from('organizations').update({ ...req.body as Record<string, unknown>, updated_at: new Date().toISOString() });
    if (req.tenant.id) {
      updateQuery = updateQuery.eq('tenant_id', req.tenant.id);
    }
    const { data, error } = await updateQuery.eq('id', req.params.id).select('*').single();
    if (error || !data) { res.status(404).json({ error: 'Organization not found' }); return; }
    res.json({ data, statusCode: 200 });
  } catch { res.status(500).json({ error: 'Failed to update organization' }); }
});
orgsRouter.delete('/:id', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  try {
    let deleteQuery = getSupabase().from('organizations').delete();
    if (req.tenant.id) {
      deleteQuery = deleteQuery.eq('tenant_id', req.tenant.id);
    }
    await deleteQuery.eq('id', req.params.id);
    res.json({ statusCode: 200 });
  }
  catch { res.status(500).json({ error: 'Failed to delete organization' }); }
});
app.use('/api/organizations', orgsRouter);

// ─── Sites ────────────────────────────────────────────────────────────────────
const sitesRouter = express.Router();
sitesRouter.get('/', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  try {
    let query = getSupabase().from('sites').select('*');
    if (req.tenant.id) {
      query = query.eq('tenant_id', req.tenant.id);
    }
    const { data, error } = await query.order('name');
    if (error) throw error;
    res.json({ data: data || [], statusCode: 200 });
  } catch { res.status(500).json({ error: 'Failed to fetch sites' }); }
});
sitesRouter.post('/', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  const { name, organization_id, address, city, postal_code, country } = req.body as Record<string, string>;
  if (!name) { res.status(400).json({ error: 'Missing required field: name' }); return; }
  try {
    const { data, error } = await getSupabase().from('sites').insert({ tenant_id: req.tenant.id || 'null', organization_id: organization_id || null, name, address, city, postal_code, country: country || 'France', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select('*').single();
    if (error) throw error;
    res.status(201).json({ data, statusCode: 201 });
  } catch { res.status(500).json({ error: 'Failed to create site' }); }
});
sitesRouter.patch('/:id', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  try {
    let updateQuery = getSupabase().from('sites').update({ ...req.body as Record<string, unknown>, updated_at: new Date().toISOString() });
    if (req.tenant.id) {
      updateQuery = updateQuery.eq('tenant_id', req.tenant.id);
    }
    const { data, error } = await updateQuery.eq('id', req.params.id).select('*').single();
    if (error || !data) { res.status(404).json({ error: 'Site not found' }); return; }
    res.json({ data, statusCode: 200 });
  } catch { res.status(500).json({ error: 'Failed to update site' }); }
});
sitesRouter.delete('/:id', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  try {
    let deleteQuery = getSupabase().from('sites').delete();
    if (req.tenant.id) {
      deleteQuery = deleteQuery.eq('tenant_id', req.tenant.id);
    }
    await deleteQuery.eq('id', req.params.id);
    res.json({ statusCode: 200 });
  }
  catch { res.status(500).json({ error: 'Failed to delete site' }); }
});
app.use('/api/sites', sitesRouter);

// ─── Departments ──────────────────────────────────────────────────────────────
const depsRouter = express.Router();
depsRouter.get('/', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  try {
    let query = getSupabase().from('departments').select('*');
    if (req.tenant.id) {
      query = query.eq('tenant_id', req.tenant.id);
    }
    const { data, error } = await query.order('name');
    if (error) throw error;
    res.json({ data: data || [], statusCode: 200 });
  } catch { res.status(500).json({ error: 'Failed to fetch departments' }); }
});
depsRouter.post('/', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  const { name, organization_id, site_id, description } = req.body as Record<string, string>;
  if (!name) { res.status(400).json({ error: 'Missing required field: name' }); return; }
  try {
    const { data, error } = await getSupabase().from('departments').insert({ tenant_id: req.tenant.id || 'null', organization_id: organization_id || null, site_id: site_id || null, name, description, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }).select('*').single();
    if (error) throw error;
    res.status(201).json({ data, statusCode: 201 });
  } catch { res.status(500).json({ error: 'Failed to create department' }); }
});
depsRouter.patch('/:id', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  try {
    let updateQuery = getSupabase().from('departments').update({ ...req.body as Record<string, unknown>, updated_at: new Date().toISOString() });
    if (req.tenant.id) {
      updateQuery = updateQuery.eq('tenant_id', req.tenant.id);
    }
    const { data, error } = await updateQuery.eq('id', req.params.id).select('*').single();
    if (error || !data) { res.status(404).json({ error: 'Department not found' }); return; }
    res.json({ data, statusCode: 200 });
  } catch { res.status(500).json({ error: 'Failed to update department' }); }
});
depsRouter.delete('/:id', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  try {
    let deleteQuery = getSupabase().from('departments').delete();
    if (req.tenant.id) {
      deleteQuery = deleteQuery.eq('tenant_id', req.tenant.id);
    }
    await deleteQuery.eq('id', req.params.id);
    res.json({ statusCode: 200 });
  }
  catch { res.status(500).json({ error: 'Failed to delete department' }); }
});
app.use('/api/departments', depsRouter);

// ─── Device assignment (org / site / dept / notes) ────────────────────────────
app.patch('/api/devices/:id/assignment', async (req: Request, res: Response) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  try {
    const { organization_id, site_id, department_id, notes } = req.body as Record<string, string | null>;
    let updateQuery = getSupabase().from('devices').update({ organization_id: organization_id || null, site_id: site_id || null, department_id: department_id || null, notes, updated_at: new Date().toISOString() });
    if (req.tenant.id) {
      updateQuery = updateQuery.eq('tenant_id', req.tenant.id);
    }
    const { data, error } = await updateQuery.eq('id', req.params.id).select('*').single();
    if (error || !data) { res.status(404).json({ error: 'Device not found' }); return; }
    res.json({ data, statusCode: 200 });
  } catch (err) { logger.error('Device assignment error:', err); res.status(500).json({ error: 'Internal server error' }); }
});

// ─── Microsoft 365 / Graph API proxy ─────────────────────────────────────────
let _graphTokenCache: { token: string; expiresAt: number } | null = null;

async function getGraphToken(): Promise<string | null> {
  if (_graphTokenCache && Date.now() < _graphTokenCache.expiresAt - 60_000) return _graphTokenCache.token;
  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;
  if (!tenantId || !clientId || !clientSecret) return null;
  try {
    const r = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'https://graph.microsoft.com/.default' }).toString(),
    });
    const d = await r.json() as { access_token?: string; expires_in?: number };
    if (d.access_token) { _graphTokenCache = { token: d.access_token, expiresAt: Date.now() + (d.expires_in || 3600) * 1000 }; return d.access_token; }
  } catch { /* ignore */ }
  return null;
}

async function graphGet(url: string, token: string): Promise<{ value?: unknown[]; error?: { message: string } }> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' } });
  return r.json() as Promise<{ value?: unknown[]; error?: { message: string } }>;
}

app.get('/api/microsoft365/status', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  const configured = !!(process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET);
  if (!configured) { res.json({ configured: false, statusCode: 200 }); return; }
  const token = await getGraphToken();
  res.json({ configured, connected: !!token, tenant_id: process.env.AZURE_TENANT_ID, statusCode: 200 });
});

app.get('/api/microsoft365/azure-devices', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  const token = await getGraphToken();
  if (!token) { res.status(503).json({ error: 'Microsoft 365 non configuré' }); return; }
  try {
    const top = Math.min(parseInt(req.query.top as string) || 200, 500);
    const d = await graphGet(`https://graph.microsoft.com/v1.0/devices?$top=${top}&$select=id,displayName,operatingSystem,operatingSystemVersion,trustType,compliant,isManaged,registrationDateTime,approximateLastSignInDateTime`, token);
    if (d.error) { res.status(400).json({ error: d.error.message }); return; }
    res.json({ data: d.value || [], statusCode: 200 });
  } catch { res.status(500).json({ error: 'Erreur Graph API' }); }
});

app.get('/api/microsoft365/intune-devices', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  const token = await getGraphToken();
  if (!token) { res.status(503).json({ error: 'Microsoft 365 non configuré' }); return; }
  try {
    const top = Math.min(parseInt(req.query.top as string) || 200, 500);
    const d = await graphGet(`https://graph.microsoft.com/v1.0/deviceManagement/managedDevices?$top=${top}&$select=id,deviceName,operatingSystem,osVersion,complianceState,enrolledDateTime,lastSyncDateTime,userPrincipalName,model,manufacturer,serialNumber,managementAgent,azureADDeviceId`, token);
    if (d.error) { res.status(400).json({ error: d.error.message }); return; }
    res.json({ data: d.value || [], statusCode: 200 });
  } catch { res.status(500).json({ error: 'Erreur Graph API' }); }
});

app.get('/api/microsoft365/autopilot', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  const token = await getGraphToken();
  if (!token) { res.status(503).json({ error: 'Microsoft 365 non configuré' }); return; }
  try {
    const d = await graphGet('https://graph.microsoft.com/v1.0/deviceManagement/windowsAutopilotDeviceIdentities?$select=id,serialNumber,manufacturer,model,groupTag,enrollmentState,azureActiveDirectoryDeviceId,managedDeviceId', token);
    if (d.error) { res.status(400).json({ error: d.error.message }); return; }
    res.json({ data: d.value || [], statusCode: 200 });
  } catch { res.status(500).json({ error: 'Erreur Graph API' }); }
});

app.get('/api/microsoft365/users', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  const token = await getGraphToken();
  if (!token) { res.status(503).json({ error: 'Microsoft 365 non configuré' }); return; }
  try {
    const top = Math.min(parseInt(req.query.top as string) || 200, 500);
    const d = await graphGet(`https://graph.microsoft.com/v1.0/users?$top=${top}&$select=id,displayName,userPrincipalName,accountEnabled,assignedLicenses,department,jobTitle,mail`, token);
    if (d.error) { res.status(400).json({ error: d.error.message }); return; }
    res.json({ data: d.value || [], statusCode: 200 });
  } catch { res.status(500).json({ error: 'Erreur Graph API' }); }
});

app.get('/api/microsoft365/subscriptions', async (req, res) => {
  if (!req.tenant) { res.status(401).json({ error: 'Missing tenant context' }); return; }
  const token = await getGraphToken();
  if (!token) { res.status(503).json({ error: 'Microsoft 365 non configuré' }); return; }
  try {
    const d = await graphGet('https://graph.microsoft.com/v1.0/subscribedSkus?$select=skuPartNumber,skuId,consumedUnits,prepaidUnits', token);
    if (d.error) { res.status(400).json({ error: d.error.message }); return; }
    res.json({ data: d.value || [], statusCode: 200 });
  } catch { res.status(500).json({ error: 'Erreur Graph API' }); }
});

// ─── Session tracking (no auth required — called client-side) ────────────────

function parseBrowser(ua: string): string {
  if (!ua) return 'Unknown';
  if (ua.includes('Edg/') || ua.includes('EdgA/')) return 'Edge';
  if (ua.includes('Chrome/') && !ua.includes('Chromium')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari';
  if (ua.includes('MSIE') || ua.includes('Trident/')) return 'IE';
  return 'Other';
}

function decodeTokenInfo(authHeader?: string): { user_id: string; user_name: string; user_email: string } {
  const defaults = { user_id: 'anonymous', user_name: 'Inconnu', user_email: '' };
  if (!authHeader?.startsWith('Bearer ')) return defaults;
  try {
    const parts = authHeader.split(' ')[1].split('.');
    if (parts.length !== 3) return defaults;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as Record<string, string>;
    return {
      user_id:    payload.sub   || 'demo-user-001',
      user_name:  payload.name  || 'Admin User',
      user_email: payload.email || 'admin@rmm-demo.local',
    };
  } catch { return defaults; }
}

// POST /api/sessions/start — start a new session
app.post('/api/sessions/start', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const { user_agent = '', screen_resolution = '' } = req.body as Record<string, string>;
    const ip_address = ((req.headers['x-forwarded-for'] as string) || req.ip || 'unknown').split(',')[0].trim();
    const { user_id, user_name, user_email } = decodeTokenInfo(req.headers.authorization);

    const { data, error } = await supabase
      .from('user_sessions')
      .insert({
        user_id, user_name, user_email,
        ip_address,
        user_agent,
        browser: parseBrowser(user_agent),
        screen_resolution,
        started_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
        page_count: 0,
        is_active: true,
      })
      .select('id')
      .single();

    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ session_id: (data as { id: string }).id });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'error' });
  }
});

// POST /api/sessions/event — log a page view, action or heartbeat
app.post('/api/sessions/event', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const { session_id, event_type, page, previous_page, time_on_previous_page, action_label, metadata } = req.body as Record<string, unknown>;
    if (!session_id) { res.status(400).json({ error: 'session_id required' }); return; }

    await supabase.from('session_events').insert({
      session_id,
      event_type,
      page: page || previous_page || null,
      previous_page: previous_page || null,
      action_label: action_label || null,
      metadata: metadata || {},
      time_on_previous_page: time_on_previous_page || null,
      created_at: new Date().toISOString(),
    });

    // Update last_active + increment page_count on page_view
    const updates: Record<string, unknown> = { last_active_at: new Date().toISOString() };
    await supabase.from('user_sessions').update(updates).eq('id', session_id);
    if (event_type === 'page_view') {
      const { data: sess } = await supabase.from('user_sessions').select('page_count').eq('id', session_id).single();
      if (sess) await supabase.from('user_sessions').update({ page_count: ((sess as { page_count: number }).page_count || 0) + 1 }).eq('id', session_id);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'error' });
  }
});

// POST /api/sessions/end — mark session as ended
app.post('/api/sessions/end', async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const { session_id, last_page, time_on_last_page } = req.body as Record<string, unknown>;
    if (!session_id) { res.status(400).json({ error: 'session_id required' }); return; }

    const { data: sess } = await supabase.from('user_sessions').select('started_at').eq('id', session_id).single();
    const duration = sess ? Math.round((Date.now() - new Date((sess as { started_at: string }).started_at).getTime()) / 1000) : 0;

    if (last_page) {
      await supabase.from('session_events').insert({
        session_id, event_type: 'logout',
        page: last_page, time_on_previous_page: time_on_last_page || 0,
        created_at: new Date().toISOString(),
      });
    }
    await supabase.from('user_sessions').update({
      ended_at: new Date().toISOString(),
      duration_seconds: duration,
      is_active: false,
    }).eq('id', session_id);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'error' });
  }
});

// ─── Admin routes (require auth) ──────────────────────────────────────────────

// GET /api/admin/sessions — list all sessions
app.get('/api/admin/sessions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const { limit = '100', offset = '0', user_name, date_from, date_to } = req.query as Record<string, string>;

    let query = supabase
      .from('user_sessions')
      .select('*', { count: 'exact' })
      .order('started_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (user_name) query = query.ilike('user_name', `%${user_name}%`);
    if (date_from) query = query.gte('started_at', date_from);
    if (date_to)   query = query.lte('started_at', date_to);

    const { data, error, count } = await query;
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ data: data || [], count, statusCode: 200 });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'error' });
  }
});

// GET /api/admin/sessions/:id/events — timeline for a session
app.get('/api/admin/sessions/:id/events', authMiddleware, async (req: Request, res: Response) => {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('session_events')
      .select('*')
      .eq('session_id', req.params.id)
      .order('created_at', { ascending: true });
    if (error) { res.status(500).json({ error: error.message }); return; }
    res.json({ data: data || [], statusCode: 200 });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'error' });
  }
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
