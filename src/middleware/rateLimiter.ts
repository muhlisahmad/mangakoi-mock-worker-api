import rateLimit from 'express-rate-limit';
import type { AppConfig } from '../types/index.js';

export function createRunLimiter(limits: AppConfig['rateLimits']) {
  return rateLimit({
    windowMs: 10 * 1000,
    max: limits.run,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Rate limit exceeded for /run.' },
  });
}

export function createRunsyncLimiter(limits: AppConfig['rateLimits']) {
  return rateLimit({
    windowMs: 10 * 1000,
    max: limits.runsync,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Rate limit exceeded for /runsync.' },
  });
}

export function createStatusLimiter(limits: AppConfig['rateLimits']) {
  return rateLimit({
    windowMs: 10 * 1000,
    max: limits.status,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Rate limit exceeded for /status.' },
  });
}

export function createCancelLimiter(limits: AppConfig['rateLimits']) {
  return rateLimit({
    windowMs: 10 * 1000,
    max: limits.cancel,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Rate limit exceeded for /cancel.' },
  });
}

export function createPurgeQueueLimiter(limits: AppConfig['rateLimits']) {
  return rateLimit({
    windowMs: 10 * 1000,
    max: limits.purgeQueue,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Rate limit exceeded for /purge-queue.' },
  });
}

export function createHealthLimiter(limits: AppConfig['rateLimits']) {
  return rateLimit({
    windowMs: 10 * 1000,
    max: limits.health,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Rate limit exceeded for /health.' },
  });
}
