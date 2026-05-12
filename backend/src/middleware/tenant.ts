import { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../services/supabase';
import { logger } from '../utils/logger';

/**
 * Extract tenant context from request and validate it exists
 * Must run AFTER authMiddleware
 */
export async function tenantMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tenantId = (req as unknown as Record<string, unknown>)._tenantId as string;

    if (!tenantId) {
      logger.warn('Missing tenant_id in request context');
      res.status(401).json({
        error: 'Missing tenant context',
        statusCode: 401,
      });
      return;
    }

    // Fetch tenant from database
    const supabase = getSupabaseClient();
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (error || !tenant) {
      logger.warn(`Tenant not found: ${tenantId}`);
      // Return 401, not 404 (prevent information leakage)
      res.status(401).json({
        error: 'Invalid tenant',
        statusCode: 401,
      });
      return;
    }

    // Attach tenant context to request
    req.tenant = {
      id: tenant.id,
      office365_tenant_id: tenant.office365_tenant_id,
      name: tenant.name,
      subscription_tier: tenant.subscription_tier,
    };

    logger.debug(`Tenant context set: ${req.tenant.id}`);
    next();
  } catch (error) {
    logger.error('Tenant middleware error:', error);
    res.status(500).json({
      error: 'Internal server error',
      statusCode: 500,
    });
  }
}
