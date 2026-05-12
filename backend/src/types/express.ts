import { TenantContext } from './index';
import 'express';

declare global {
  namespace Express {
    interface Request {
      tenant?: TenantContext;
      userId?: string;
    }
  }
}

export {};
