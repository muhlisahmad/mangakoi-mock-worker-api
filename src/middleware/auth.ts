import type { Request, Response, NextFunction } from 'express';
import config from '../config/index.js';
import { AppError } from '../types/index.js';
import { log } from '../utils/logger.js';

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header) {
    throw new AppError(401, 'Missing Authorization header. Expected: Bearer <API_KEY>', 'UNAUTHORIZED');
  }

  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError(401, 'Invalid Authorization header format. Expected: Bearer <API_KEY>', 'UNAUTHORIZED');
  }

  if (token !== config.mockApiKey) {
    log.warn('Authentication failed', { ip: req.ip });
    throw new AppError(401, 'Invalid API key', 'UNAUTHORIZED');
  }

  next();
}
