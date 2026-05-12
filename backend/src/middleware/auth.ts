import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { TokenClaims } from '../types';
import { logger } from '../utils/logger';

/**
 * Validate Azure AD JWT token from Authorization header
 * TODO: In production, validate signature against Azure AD JWKS endpoint
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

    // TODO: Verify JWT signature in production
    // For MVP, just decode without verification
    const decoded = jwt.decode(token) as TokenClaims | null;

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
    const tenantId = decoded.tid || (decoded as Record<string, unknown>).tenant_id;
    const userId = decoded.oid || (decoded as Record<string, unknown>).sub;

    if (!tenantId) {
      logger.warn('Token missing tenant_id claim');
      res.status(401).json({
        error: 'Token missing tenant_id claim',
        statusCode: 401,
      });
      return;
    }

    // Attach to request for later middleware/routes
    req.userId = userId as string;
    (req as unknown as Record<string, unknown>)._tenantId = tenantId;
    (req as unknown as Record<string, unknown>)._token = token;

    logger.debug(`Auth successful for user ${userId}`);
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
