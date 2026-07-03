import dotenv from 'dotenv';
import type { AppConfig } from '../types/index.js';

dotenv.config();

function envInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be an integer, got: ${raw}`);
  }
  return parsed;
}

function envFloat(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = Number.parseFloat(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${raw}`);
  }
  return parsed;
}

function envString(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

const config: AppConfig = {
  port: envInt('PORT', 3000),
  nodeEnv: envString('NODE_ENV', 'development'),
  mockApiKey: envString('MOCK_API_KEY', 'dev-mock-api-key-change-in-production'),
  simulatedDelayMinMs: envInt('SIMULATED_DELAY_MIN_MS', 1000),
  simulatedDelayMaxMs: envInt('SIMULATED_DELAY_MAX_MS', 5000),
  mockFailureRate: envFloat('MOCK_FAILURE_RATE', 0),
  webhookTimeoutMs: envInt('WEBHOOK_TIMEOUT_MS', 10000),
  defaultExecutionTimeoutMs: envInt('DEFAULT_EXECUTION_TIMEOUT_MS', 600000),
  defaultTtlMs: envInt('DEFAULT_TTL_MS', 86400000),
  corsOrigin: envString('CORS_ORIGIN', '*'),
  rateLimits: {
    run: envInt('RATE_LIMIT_RUN', 1000),
    runsync: envInt('RATE_LIMIT_RUNSYNC', 2000),
    status: envInt('RATE_LIMIT_STATUS', 2000),
    cancel: envInt('RATE_LIMIT_CANCEL', 100),
    purgeQueue: envInt('RATE_LIMIT_PURGE_QUEUE', 2),
    health: envInt('RATE_LIMIT_HEALTH', 2000),
  },
};

export default config;

export function validateConfig(): void {
  if (config.simulatedDelayMinMs < 0) {
    throw new Error('SIMULATED_DELAY_MIN_MS must be >= 0');
  }
  if (config.simulatedDelayMaxMs < config.simulatedDelayMinMs) {
    throw new Error('SIMULATED_DELAY_MAX_MS must be >= SIMULATED_DELAY_MIN_MS');
  }
  if (config.mockFailureRate < 0 || config.mockFailureRate > 1) {
    throw new Error('MOCK_FAILURE_RATE must be between 0 and 1');
  }
}
