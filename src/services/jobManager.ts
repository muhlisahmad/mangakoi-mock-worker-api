import type { Job, WorkerInput } from '../types/index.js';
import { generateJobId } from '../utils/idGenerator.js';
import { log } from '../utils/logger.js';
import config from '../config/index.js';

class JobManager {
  private jobs: Map<string, Job> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private readonly DEFAULT_TTL_MS = 30 * 60 * 1000;

  createJob(
    endpointId: string,
    input: WorkerInput,
    webhook?: string,
    policy?: { executionTimeout?: number; lowPriority?: boolean; ttl?: number },
    idPrefix?: string,
  ): Job {
    const id = generateJobId(idPrefix);
    const now = Date.now();

    const job: Job = {
      id,
      endpointId,
      input,
      webhook,
      policy,
      status: 'IN_QUEUE',
      output: null,
      delayTime: 0,
      executionTime: 0,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      retryCount: 0,
    };

    this.jobs.set(id, job);
    log.info('Job created', { jobId: id, endpointId, status: job.status });

    const ttl = policy?.ttl ?? this.DEFAULT_TTL_MS;
    this.scheduleExpiry(id, ttl);

    return job;
  }

  startProcessing(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'IN_QUEUE') return;

    job.status = 'IN_PROGRESS';
    job.startedAt = Date.now();
    job.delayTime = job.startedAt - job.createdAt;
    log.info('Job processing started', { jobId, delayTime: job.delayTime });

    const delay = this.randomDelay();
    const shouldFail = Math.random() < config.mockFailureRate;

    this.timers.set(
      jobId,
      setTimeout(() => {
        if (shouldFail) {
          this.failJob(jobId);
        } else {
          this.completeJob(jobId);
        }
      }, delay),
    );
  }

  private completeJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'IN_PROGRESS') return;

    job.status = 'COMPLETED';
    job.completedAt = Date.now();
    job.executionTime = job.completedAt - (job.startedAt ?? job.createdAt);
    job.output = {
      status: 'done',
      outputObjectKey: `outputs/${jobId}/translated.png`,
      elapsedSeconds: Math.round((job.executionTime / 1000) * 10) / 10,
    };

    log.info('Job completed', { jobId, executionTime: job.executionTime });
    this.cleanupTimer(jobId);
  }

  private failJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== 'IN_PROGRESS') return;

    job.status = 'FAILED';
    job.completedAt = Date.now();
    job.executionTime = job.completedAt - (job.startedAt ?? job.createdAt);
    job.output = {
      status: 'failed',
      error: 'SimulatedError: Mock pipeline failure (controlled by MOCK_FAILURE_RATE)',
    };

    log.warn('Job failed (simulated)', { jobId, executionTime: job.executionTime });
    this.cleanupTimer(jobId);
  }

  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (job.status !== 'IN_QUEUE' && job.status !== 'IN_PROGRESS') return false;

    this.cleanupTimer(jobId);
    job.status = 'CANCELLED';
    job.completedAt = Date.now();

    if (job.startedAt) {
      job.executionTime = job.completedAt - job.startedAt;
    }

    log.info('Job cancelled', { jobId });
    return true;
  }

  retryJob(jobId: string): Job | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    if (job.status !== 'FAILED' && job.status !== 'TIMED_OUT') return null;

    this.cleanupTimer(jobId);

    job.status = 'IN_QUEUE';
    job.output = null;
    job.delayTime = 0;
    job.executionTime = 0;
    job.startedAt = null;
    job.completedAt = null;
    job.retryCount += 1;

    const ttl = job.policy?.ttl ?? this.DEFAULT_TTL_MS;
    this.scheduleExpiry(jobId, ttl);

    log.info('Job retried', { jobId, retryCount: job.retryCount });
    return job;
  }

  purgeQueue(): number {
    let removed = 0;
    for (const [id, job] of this.jobs.entries()) {
      if (job.status === 'IN_QUEUE') {
        this.cleanupTimer(id);
        this.jobs.delete(id);
        removed++;
      }
    }
    log.info('Queue purged', { removed });
    return removed;
  }

  getHealth() {
    const counts = { inQueue: 0, inProgress: 0, completed: 0, failed: 0, cancelled: 0 };

    for (const job of this.jobs.values()) {
      switch (job.status) {
        case 'IN_QUEUE': counts.inQueue++; break;
        case 'IN_PROGRESS': counts.inProgress++; break;
        case 'COMPLETED': counts.completed++; break;
        case 'FAILED': counts.failed++; break;
        case 'CANCELLED': counts.cancelled++; break;
      }
    }

    return {
      jobs: counts,
      workers: {
        idle: 0,
        running: counts.inProgress > 0 ? 1 : 0,
      },
    };
  }

  private randomDelay(): number {
    const min = config.simulatedDelayMinMs;
    const max = config.simulatedDelayMaxMs;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private scheduleExpiry(jobId: string, ttlMs: number): void {
    const existing = this.timers.get(`expiry-${jobId}`);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const job = this.jobs.get(jobId);
      if (job && (job.status === 'IN_QUEUE' || job.status === 'IN_PROGRESS')) {
        job.status = 'TIMED_OUT';
        job.completedAt = Date.now();
        log.warn('Job expired', { jobId, ttlMs });
      }
      this.jobs.delete(jobId);
      this.cleanupTimer(jobId);
    }, ttlMs);

    this.timers.set(`expiry-${jobId}`, timer);
  }

  private cleanupTimer(jobId: string): void {
    const timer = this.timers.get(jobId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(jobId);
    }
    const expiryTimer = this.timers.get(`expiry-${jobId}`);
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      this.timers.delete(`expiry-${jobId}`);
    }
  }
}

export const jobManager = new JobManager();
