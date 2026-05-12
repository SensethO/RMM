import { Router, Request, Response } from 'express';
import * as commandService from '../services/commandService';
import * as deviceService from '../services/deviceService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/commands/:device_id/pending
 * Get pending commands for a device (agent polls this)
 */
router.get('/:device_id/pending', async (req: Request, res: Response) => {
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

    const limit = parseInt(req.query.limit as string) || 10;
    const commands = await commandService.getPendingCommands(req.tenant.id, req.params.device_id, limit);

    res.json({
      data: commands,
      count: commands.length,
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Get pending commands error:', error);
    res.status(500).json({ error: 'Internal server error', statusCode: 500 });
  }
});

/**
 * POST /api/commands/:device_id
 * Queue a command for a device
 */
router.post('/:device_id', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      res.status(401).json({ error: 'Missing tenant context', statusCode: 401 });
      return;
    }

    const { command_type, params } = req.body;

    if (!command_type) {
      res.status(400).json({
        error: 'Missing required field: command_type',
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

    const command = await commandService.queueCommand(req.tenant.id, req.params.device_id, {
      command_type,
      params,
    });

    if (!command) {
      res.status(500).json({
        error: 'Failed to queue command',
        statusCode: 500,
      });
      return;
    }

    logger.info(`Command queued: ${command.id}`);
    res.status(201).json({
      data: command,
      statusCode: 201,
    });
  } catch (error) {
    logger.error('Queue command error:', error);
    res.status(500).json({ error: 'Internal server error', statusCode: 500 });
  }
});

/**
 * PATCH /api/commands/:id
 * Update command status (agent reports execution result)
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    if (!req.tenant) {
      res.status(401).json({ error: 'Missing tenant context', statusCode: 401 });
      return;
    }

    const { status, exit_code, output } = req.body;

    if (!status) {
      res.status(400).json({
        error: 'Missing required field: status',
        statusCode: 400,
      });
      return;
    }

    // Validate status
    if (!['executing', 'success', 'failed', 'timeout'].includes(status)) {
      res.status(400).json({
        error: 'Invalid status value',
        statusCode: 400,
      });
      return;
    }

    const command = await commandService.updateCommandStatus(req.tenant.id, req.params.id, {
      status,
      exit_code,
      output,
    });

    if (!command) {
      res.status(404).json({
        error: 'Command not found',
        statusCode: 404,
      });
      return;
    }

    res.json({
      data: command,
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Update command status error:', error);
    res.status(500).json({ error: 'Internal server error', statusCode: 500 });
  }
});

/**
 * GET /api/commands/:device_id/history
 * Get command history for a device
 */
router.get('/:device_id/history', async (req: Request, res: Response) => {
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

    const limit = parseInt(req.query.limit as string) || 50;
    const commands = await commandService.getCommandHistory(req.tenant.id, req.params.device_id, limit);

    res.json({
      data: commands,
      count: commands.length,
      statusCode: 200,
    });
  } catch (error) {
    logger.error('Get command history error:', error);
    res.status(500).json({ error: 'Internal server error', statusCode: 500 });
  }
});

export default router;
