import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { TokenClaims } from '../types';
import { logger } from '../utils/logger';

/**
 * Validate JWT token from Authorization header
 * Supports both Azure AD tokens and manual login tokens
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.warn('Missing or invalid Authorization header');
      res.status(401).json({
        error: 'Missing or invalid Authorization header',
        statusCode: 401,
      });
      return;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix
    let decoded: Record<string, unknown> | null = null;

    // Try to verify as manual JWT first (with signature validation)
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret) {
      try {
        decoded = jwt.verify(token, jwtSecret) as Record<string, unknown>;
        logger.debug('Token verified as manual JWT');
      } catch (err) {
        // Not a manual JWT, try Azure AD token
        logger.debug('Token is not a manual JWT, trying Azure AD');
        decoded = jwt.decode(token) as Record<string, unknown> | null;
      }
    } else {
      // No JWT secret, just decode (for development)
      decoded = jwt.decode(token) as Record<string, unknown> | null;
    }

    if (!decoded) {
      logger.warn('Invalid token format');
      res.status(401).json({
        error: 'Invalid token',
        statusCode: 401,
      });
      return;
    }

    // Extract tenant ID from token claims
    // Azure AD uses 'tid' for tenant ID
    // Manual tokens may not have it, use default 'demo-tenant'
    const tenantId = (decoded.tid || decoded.tenant_id || 'demo-tenant') as string;
    const userId = (decoded.oid || decoded.sub || 'unknown-user') as string;

    // Attach to request for later middleware/routes
    req.userId = userId;
    (req as unknown as Record<string, unknown>)._tenantId = tenantId;
    (req as unknown as Record<string, unknown>)._token = token;

    logger.debug(`Auth successful for user ${userId} (tenant: ${tenantId})`);
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({
      error: 'Internal server error',
      statusCode: 500,
    });
  }
}

/**
 * Verify Azure AD JWT token signature (production)
 * This is a placeholder for production implementation
 */
export async function verifyAzureAdToken(token: string): Promise<TokenClaims> {
  // TODO: Implement in production
  // 1. Fetch JWKS from: https://login.microsoftonline.com/common/discovery/v2.0/keys
  // 2. Verify signature
  // 3. Validate claims (iss, aud, exp)

  const decoded = jwt.decode(token) as TokenClaims;
  if (!decoded) {
    throw new Error('Invalid token');
  }

  return decoded;
}
