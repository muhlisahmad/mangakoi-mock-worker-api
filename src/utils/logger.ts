import winston from 'winston';
import { AsyncLocalStorage } from 'node:async_hooks';

export const requestIdStorage = new AsyncLocalStorage<string>();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'ISO' }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: 'mangakoi-mock-worker-api' },
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'development'
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, requestId, ...rest }) => {
              const rid = requestId ? ` [${requestId}]` : '';
              const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : '';
              return `${timestamp} ${level}${rid}: ${message}${extra}`;
            }),
          )
        : undefined,
    }),
  ],
});

function withRequestId(meta: Record<string, unknown> = {}): Record<string, unknown> {
  const requestId = requestIdStorage.getStore();
  if (requestId) {
    meta.requestId = requestId;
  }
  return meta;
}

export const log = {
  info: (message: string, meta?: Record<string, unknown>) => logger.info(message, withRequestId(meta)),
  warn: (message: string, meta?: Record<string, unknown>) => logger.warn(message, withRequestId(meta)),
  error: (message: string, meta?: Record<string, unknown>) => logger.error(message, withRequestId(meta)),
  debug: (message: string, meta?: Record<string, unknown>) => logger.debug(message, withRequestId(meta)),
};

export { logger };
