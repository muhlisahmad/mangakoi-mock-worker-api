import type { Job } from '../types/index.js';
import { log } from '../utils/logger.js';
import config from '../config/index.js';

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 10_000;

async function attemptDelivery(job: Job, payload: Record<string, unknown>): Promise<boolean> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.webhookTimeoutMs);

  try {
    const response = await fetch(job.webhook!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      log.info('Webhook delivered', { jobId: job.id, webhook: job.webhook, statusCode: response.status });
      return true;
    }

    log.warn('Webhook returned non-200', { jobId: job.id, webhook: job.webhook, statusCode: response.status });
    return false;
  } catch (err) {
    clearTimeout(timeoutId);
    const message = err instanceof Error ? err.message : String(err);
    log.warn('Webhook delivery failed', { jobId: job.id, webhook: job.webhook, error: message });
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function deliverWebhook(job: Job): Promise<void> {
  if (!job.webhook) return;

  const payload = {
    id: job.id,
    status: job.status,
    output: job.output,
    delayTime: job.delayTime,
    executionTime: job.executionTime,
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const ok = await attemptDelivery(job, payload);
    if (ok) return;

    if (attempt < MAX_ATTEMPTS) {
      log.info('Webhook retry scheduled', { jobId: job.id, webhook: job.webhook, attempt, nextAttemptInMs: RETRY_DELAY_MS });
      await sleep(RETRY_DELAY_MS);
    } else {
      log.warn('Webhook all retries exhausted', { jobId: job.id, webhook: job.webhook, maxAttempts: MAX_ATTEMPTS });
    }
  }
}
