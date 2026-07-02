import app from './app.js';
import config, { validateConfig } from './config/index.js';
import { log } from './utils/logger.js';

try {
  validateConfig();
} catch (err) {
  log.error('Configuration validation failed', { error: (err as Error).message });
  process.exit(1);
}

const server = app.listen(config.port, () => {
  log.info('Mock RunPod Serverless API started', {
    port: config.port,
    environment: config.nodeEnv,
    simulatedDelayRange: `${config.simulatedDelayMinMs}-${config.simulatedDelayMaxMs}ms`,
    mockFailureRate: config.mockFailureRate,
  });
});

function shutdown(signal: string) {
  log.info(`${signal} received — shutting down gracefully...`);
  server.close(() => {
    log.info('Server closed');
    process.exit(0);
  });

  setTimeout(() => {
    log.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  log.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection', { reason: String(reason) });
  process.exit(1);
});
