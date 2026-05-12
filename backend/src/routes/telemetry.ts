import { Router, Request, Response } from 'express';
import { getSupabaseClient } from '../services/supabase';
import * as deviceService from '../services/deviceService';
import { TelemetryInput } from '../types';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /api/devices/:device_id/telemetry
 * Report device telemetry (CPU, RAM, Disk metrics)
 */
router.post('/:device_id/telemetry', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      res.status(401).json({ error: 'Missing tenant context', statusCode: 401 });
      return;
    }

    const { cpu_percent, ram_percent, disk_percent, network_bytes_sec } = req.body as TelemetryInput;

    // Validate required fields
    if (cpu_percent === undefined || ram_percent === undefined || disk_percent === undefined) {
      res.status(400).json({
        error: 'Missing required fields: cpu_percent, ram_percent, disk_percent',
        statusCode: 400,
      });
      return;
    }

    // Verify device exists in tenant
    const device = await deviceService.getDevice(req.tenant.id, req.params.device_id);
    if (!device) {
      res.status(404).json({ error: 'Device not found', statusCode: 404 });
      return;
    }

    // Validate percentage values
    if (cpu_percent < 0 || cpu_percent > 100 || ram_percent < 0 || ram_percent > 100 || disk_percent < 0 || disk_percent > 100) {
      res.status(400).json({
        error: 'Percentage values must be between 0 and 100',
        statusCode: 400,
      });
      return;
    }

    // Store telemetry
    const supabase = getSupabaseClient();
    const { data: telemetry, error } = await supabase
      .from('device_telemetry')
      .insert({
        device_id: req.params.device_id,
        cpu_percent,
        ram_percent,
        disk_percent,
        network_bytes_sec: network_bytes_sec || 0,
        timestamp: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error(`Failed to store telemetry: ${error.message}`);
      res.status(500).json({
        error: 'Failed to store telemetry',
        statusCode: 500,
      });
      return;
    }

    logger.debug(`Telemetry stored for device ${req.params.device_id}`);
    res.status(201).json({
      data: telemetry,
      statusCode: 201,
    });
  } catch (error) {
    logger.error('Store telemetry error:', error);
    res.status(500).json({ error: 'Internal server error', statusCode: 500 });
  }
});

/**
 * GET /api/devices/:device_id/telemetry
 * Get telemetry history for a device
 */
router.get('/:device_id/telemetry', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      res.status(401).json({ error: 'Missing tenant context', statusCode: 401 });
      return;
    }

    // Verify device exists in tenant
    const device = await deviceService.getDevice(req.tenant.id, req.params.device_id);
    if (!device) {
      res.status(404).json({ error: 'Device not found', statusCode: 404 });
      return;
    }

    const limit = parseInt(req.query.limit as string) || 100;
    const supabase = getSupabaseClient();

    const { data: telemetry, error } = await supabase
      .from('device_telemetry')
      .select('*')
      .eq('device_id', req.params.device_id)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error(`Failed to fetch telemetry: ${error.message}`);
      res.status(500).json({
        error: 'Failed to fetch telemetry',
        statusCode: 500,
      });
      return;
    }

    res.json({
      data: telemetry || [],
      count: (telemetry || []).length,
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Get telemetry error:', error);
    res.status(500).json({ error: 'Internal server error', statusCode: 500 });
  }
});

export default router;
