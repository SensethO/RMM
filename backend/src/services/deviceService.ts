import { getSupabaseClient } from './supabase';
import { Device, DeviceRegistrationInput, DeviceStatusUpdate } from '../types';
import { logger } from '../utils/logger';

/**
 * Device Service - Handle device management operations
 */

export async function registerDevice(
  tenantId: string,
  input: DeviceRegistrationInput
): Promise<Device | null> {
  try {
    const supabase = getSupabaseClient();

    // Validate device_id is unique per tenant
    const { data: existingDevice } = await supabase
      .from('devices')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('device_id', input.device_id)
      .single();

    if (existingDevice) {
      logger.warn(`Device already registered: ${input.device_id} for tenant ${tenantId}`);
      return null;
    }

    // Register new device
    const { data: device, error } = await supabase
      .from('devices')
      .insert({
        tenant_id: tenantId,
        device_id: input.device_id,
        device_name: input.device_name,
        os: input.os,
        os_version: input.os_version,
        hardware_id: input.hardware_id,
        user_id: input.user_id,
        status: 'offline',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      logger.error(`Failed to register device: ${error.message}`);
      return null;
    }

    logger.info(`Device registered: ${device.id} (${input.device_id}) for tenant ${tenantId}`);
    return device;
  } catch (error) {
    logger.error('registerDevice error:', error);
    return null;
  }
}

export async function listDevices(
  tenantId: string,
  filters: { status?: string; limit?: number; offset?: number } = {}
): Promise<Device[]> {
  try {
    const supabase = getSupabaseClient();
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;

    let query = supabase
      .from('devices')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    const { data: devices, error } = await query;

    if (error) {
      logger.error(`Failed to list devices: ${error.message}`);
      return [];
    }

    return devices || [];
  } catch (error) {
    logger.error('listDevices error:', error);
    return [];
  }
}

export async function getDevice(tenantId: string, deviceId: string): Promise<Device | null> {
  try {
    const supabase = getSupabaseClient();

    const { data: device, error } = await supabase
      .from('devices')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('id', deviceId)
      .single();

    if (error || !device) {
      logger.warn(`Device not found: ${deviceId} for tenant ${tenantId}`);
      return null;
    }

    return device;
  } catch (error) {
    logger.error('getDevice error:', error);
    return null;
  }
}

export async function getDeviceByDeviceId(
  tenantId: string,
  deviceId: string
): Promise<Device | null> {
  try {
    const supabase = getSupabaseClient();

    const { data: device, error } = await supabase
      .from('devices')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('device_id', deviceId)
      .single();

    if (error || !device) {
      logger.warn(`Device not found by device_id: ${deviceId} for tenant ${tenantId}`);
      return null;
    }

    return device;
  } catch (error) {
    logger.error('getDeviceByDeviceId error:', error);
    return null;
  }
}

export async function updateDeviceStatus(
  tenantId: string,
  deviceId: string,
  update: DeviceStatusUpdate
): Promise<Device | null> {
  try {
    const supabase = getSupabaseClient();

    const { data: device, error } = await supabase
      .from('devices')
      .update({
        ...update,
        last_seen: update.last_seen || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', deviceId)
      .select()
      .single();

    if (error || !device) {
      logger.warn(`Failed to update device status: ${deviceId}`);
      return null;
    }

    logger.info(`Device updated: ${deviceId} status=${update.status}`);
    return device;
  } catch (error) {
    logger.error('updateDeviceStatus error:', error);
    return null;
  }
}

export async function getLatestTelemetry(deviceId: string): Promise<Record<string, unknown> | null> {
  try {
    const supabase = getSupabaseClient();

    const { data: telemetry, error } = await supabase
      .from('device_telemetry')
      .select('*')
      .eq('device_id', deviceId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();

    if (error) {
      logger.debug(`No telemetry found for device: ${deviceId}`);
      return null;
    }

    return telemetry;
  } catch (error) {
    logger.error('getLatestTelemetry error:', error);
    return null;
  }
}
