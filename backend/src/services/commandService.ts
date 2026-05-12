import { getSupabaseClient } from './supabase';
import { Command, CommandQueueInput, CommandStatusUpdate } from '../types';
import { logger } from '../utils/logger';

/**
 * Command Service - Handle command queue operations
 */

export async function queueCommand(
  tenantId: string,
  deviceId: string,
  input: CommandQueueInput
): Promise<Command | null> {
  try {
    const supabase = getSupabaseClient();

    const { data: command, error } = await supabase
      .from('commands')
      .insert({
        tenant_id: tenantId,
        device_id: deviceId,
        command_type: input.command_type,
        params: input.params || {},
        status: 'pending',
        retry_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error(`Failed to queue command: ${error.message}`);
      return null;
    }

    logger.info(
      `Command queued: ${command.id} (${input.command_type}) for device ${deviceId} in tenant ${tenantId}`
    );
    return command;
  } catch (error) {
    logger.error('queueCommand error:', error);
    return null;
  }
}

export async function getPendingCommands(
  tenantId: string,
  deviceId: string,
  limit = 10
): Promise<Command[]> {
  try {
    const supabase = getSupabaseClient();

    const { data: commands, error } = await supabase
      .from('commands')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('device_id', deviceId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      logger.error(`Failed to fetch pending commands: ${error.message}`);
      return [];
    }

    return commands || [];
  } catch (error) {
    logger.error('getPendingCommands error:', error);
    return [];
  }
}

export async function getCommand(tenantId: string, commandId: string): Promise<Command | null> {
  try {
    const supabase = getSupabaseClient();

    const { data: command, error } = await supabase
      .from('commands')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', commandId)
      .single();

    if (error || !command) {
      logger.warn(`Command not found: ${commandId}`);
      return null;
    }

    return command;
  } catch (error) {
    logger.error('getCommand error:', error);
    return null;
  }
}

export async function updateCommandStatus(
  tenantId: string,
  commandId: string,
  update: CommandStatusUpdate
): Promise<Command | null> {
  try {
    const supabase = getSupabaseClient();

    const { data: command, error } = await supabase
      .from('commands')
      .update({
        ...update,
        executed_at: update.status === 'executing' ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', commandId)
      .select()
      .single();

    if (error || !command) {
      logger.warn(`Failed to update command status: ${commandId}`);
      return null;
    }

    logger.info(`Command ${commandId} status updated to ${update.status}`);
    return command;
  } catch (error) {
    logger.error('updateCommandStatus error:', error);
    return null;
  }
}

export async function getCommandHistory(
  tenantId: string,
  deviceId: string,
  limit = 50
): Promise<Command[]> {
  try {
    const supabase = getSupabaseClient();

    const { data: commands, error } = await supabase
      .from('commands')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('device_id', deviceId)
      .neq('status', 'pending') // Get completed commands
      .order('executed_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error(`Failed to fetch command history: ${error.message}`);
      return [];
    }

    return commands || [];
  } catch (error) {
    logger.error('getCommandHistory error:', error);
    return [];
  }
}
