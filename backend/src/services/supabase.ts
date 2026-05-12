import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';

let supabaseClient: SupabaseClient | null = null;

export function initializeSupabase(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase credentials');
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey);
  logger.info('Supabase client initialized');

  return supabaseClient;
}

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    return initializeSupabase();
  }
  return supabaseClient;
}

export async function testConnection(): Promise<boolean> {
  try {
    const client = getSupabaseClient();
    const { count, error } = await client
      .from('tenants')
      .select('*', { count: 'exact', head: true });

    if (error) {
      logger.error('Supabase connection test failed:', error);
      return false;
    }

    logger.info('Supabase connection successful');
    return true;
  } catch (error) {
    logger.error('Supabase connection error:', error);
    return false;
  }
}

// Helper functions for common queries with tenant isolation

export async function queryWithTenant(
  table: string,
  tenantId: string,
  options: { limit?: number; offset?: number } = {}
) {
  const client = getSupabaseClient();
  const limit = options.limit || 100;
  const offset = options.offset || 0;

  return client
    .from(table)
    .select('*')
    .eq('tenant_id', tenantId)
    .range(offset, offset + limit - 1);
}

export async function insertWithTenant(
  table: string,
  tenantId: string,
  data: Record<string, unknown>
) {
  const client = getSupabaseClient();

  return client
    .from(table)
    .insert({ ...data, tenant_id: tenantId })
    .select();
}

export async function updateWithTenant(
  table: string,
  tenantId: string,
  id: string,
  data: Record<string, unknown>
) {
  const client = getSupabaseClient();

  return client
    .from(table)
    .update(data)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select();
}

export async function deleteWithTenant(
  table: string,
  tenantId: string,
  id: string
) {
  const client = getSupabaseClient();

  return client
    .from(table)
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId);
}
