import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../types/index.js';
import { log } from '../utils/logger.js';
import config from '../config/index.js';

function isPayloadTooLarge(err: Error): boolean {
  return 'type' in err && (err as Record<string, unknown>).type === 'entity.too.large';
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
    return;
  }

  if (isPayloadTooLarge(err)) {
    res.status(413).json({
      error: 'Request body exceeds maximum size limit (10 MB)',
      code: 'PAYLOAD_TOO_LARGE',
    });
    return;
  }

  log.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path,
    ip: req.ip,
  });

  res.status(500).json({
    error: config.nodeEnv === 'production'
      ? 'Internal server error'
      : err.message,
    code: 'INTERNAL_ERROR',
  });
}
