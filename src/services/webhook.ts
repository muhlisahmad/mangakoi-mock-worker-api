import type { Job } from '../types/index.js';
import { log } from '../utils/logger.js';
import config from '../config/index.js';

export async function deliverWebhook(job: Job): Promise<void> {
  if (!job.webhook) return;

  const payload = {
    id: job.id,
    status: job.status,
    output: job.output,
    delayTime: job.delayTime,
    executionTime: job.executionTime,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.webhookTimeoutMs);

    const response = await fetch(job.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      log.info('Webhook delivered', { jobId: job.id, webhook: job.webhook, statusCode: response.status });
    } else {
      log.warn('Webhook returned non-200', { jobId: job.id, webhook: job.webhook, statusCode: response.status });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn('Webhook delivery failed', { jobId: job.id, webhook: job.webhook, error: message });
  }
}
