import { Router, Request, Response } from 'express';
import * as deviceService from '../services/deviceService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/devices/register
 * Register a new device
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      res.status(401).json({ error: 'Missing tenant context', statusCode: 401 });
      return;
    }

    const { device_id, device_name, os, os_version, hardware_id, user_id } = req.body;

    // Validation
    if (!device_id || !device_name || !os) {
      res.status(400).json({
        error: 'Missing required fields: device_id, device_name, os',
        statusCode: 400,
      });
      return;
    }

    const device = await deviceService.registerDevice(req.tenant.id, {
      device_id,
      device_name,
      os,
      os_version,
      hardware_id,
      user_id,
    });

    if (!device) {
      res.status(400).json({
        error: 'Failed to register device (already exists?)',
        statusCode: 400,
      });
      return;
    }

    logger.info(`Device registered: ${device.id}`);
    res.status(201).json({
      data: device,
      statusCode: 201,
    });
  } catch (error) {
    logger.error('Register device error:', error);
    res.status(500).json({ error: 'Internal server error', statusCode: 500 });
  }
});

/**
 * GET /api/devices
 * List devices for the tenant
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      res.status(401).json({ error: 'Missing tenant context', statusCode: 401 });
      return;
    }

    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 100;
    const offset = parseInt(req.query.offset as string) || 0;

    const devices = await deviceService.listDevices(req.tenant.id, {
      status,
      limit,
      offset,
    });

    res.json({
      data: devices,
      count: devices.length,
      limit,
      offset,
      statusCode: 200,
    });
  } catch (error) {
    logger.error('List devices error:', error);
    res.status(500).json({ error: 'Internal server error', statusCode: 500 });
  }
});

/**
 * GET /api/devices/:id
 * Get device detail
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      res.status(401).json({ error: 'Missing tenant context', statusCode: 401 });
      return;
    }

    const device = await deviceService.getDevice(req.tenant.id, req.params.id);

    if (!device) {
      res.status(404).json({
        error: 'Device not found',
        statusCode: 404,
      });
      return;
    }

    // Get latest telemetry
    const telemetry = await deviceService.getLatestTelemetry(req.params.id);

    res.json({
      data: {
        ...device,
        latest_telemetry: telemetry,
      },
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Get device error:', error);
    res.status(500).json({ error: 'Internal server error', statusCode: 500 });
  }
});

/**
 * PATCH /api/devices/:id
 * Update device status
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      res.status(401).json({ error: 'Missing tenant context', statusCode: 401 });
      return;
    }

    const { status, ip_address, last_seen } = req.body;

    if (!status) {
      res.status(400).json({
        error: 'Missing required field: status',
        statusCode: 400,
      });
      return;
    }

    // Validate status
    if (!['online', 'offline', 'error', 'maintenance'].includes(status)) {
      res.status(400).json({
        error: 'Invalid status value',
        statusCode: 400,
      });
      return;
    }

    const device = await deviceService.updateDeviceStatus(req.tenant.id, req.params.id, {
      status,
      ip_address,
      last_seen,
    });

    if (!device) {
      res.status(404).json({
        error: 'Device not found',
        statusCode: 404,
      });
      return;
    }

    res.json({
      data: device,
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Update device error:', error);
    res.status(500).json({ error: 'Internal server error', statusCode: 500 });
  }
});

export default router;
