import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.js';
import { validateRunRequest } from '../middleware/validate.js';
import {
  createRunLimiter,
  createRunsyncLimiter,
  createStatusLimiter,
  createCancelLimiter,
  createPurgeQueueLimiter,
  createHealthLimiter,
} from '../middleware/rateLimiter.js';
import { jobManager } from '../services/jobManager.js';
import { AppError } from '../types/index.js';
import type {
  WorkerInput,
  RunResponse,
  StatusResponse,
  CancelResponse,
  RetryResponse,
  PurgeQueueResponse,
  HealthResponse,
} from '../types/index.js';
import { log } from '../utils/logger.js';
import config from '../config/index.js';

type Params = Record<string, string>;
type V2Handler = (req: Request<Params>, res: Response, next: NextFunction) => Promise<void>;

const router = Router();

router.use(authenticate);

function asyncHandler(fn: V2Handler) {
  return (req: Request<Params>, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

router.post(
  '/:endpointId/run',
  createRunLimiter(config.rateLimits),
  validateRunRequest,
  asyncHandler(async (req, res) => {
    const { endpointId } = req.params;
    const { input, webhook, policy } = req.body as {
      input: WorkerInput;
      webhook?: string;
      policy?: { executionTimeout?: number; lowPriority?: boolean; ttl?: number };
    };

    const job = jobManager.createJob(endpointId, input, webhook ?? undefined, policy);
    jobManager.startProcessing(job.id);

    log.info('/run submitted', { jobId: job.id, endpointId });

    const body: RunResponse = { id: job.id, status: 'IN_QUEUE' };
    res.status(200).json(body);
  }),
);

router.post(
  '/:endpointId/runsync',
  createRunsyncLimiter(config.rateLimits),
  validateRunRequest,
  asyncHandler(async (req, res) => {
    const { endpointId } = req.params;
    const { input, webhook, policy } = req.body as {
      input: WorkerInput;
      webhook?: string;
      policy?: { executionTimeout?: number; lowPriority?: boolean; ttl?: number };
    };

    const job = jobManager.createJob(endpointId, input, webhook ?? undefined, policy, 'sync-');
    jobManager.startProcessing(job.id);
    log.info('/runsync submitted', { jobId: job.id, endpointId });

    await new Promise<void>((resolve, reject) => {
      const checkInterval = 100;
      const maxWait = policy?.executionTimeout ?? 90_000;
      let elapsed = 0;

      const intervalId = setInterval(() => {
        elapsed += checkInterval;
        const current = jobManager.getJob(job.id);

        if (!current) {
          clearInterval(intervalId);
          reject(new AppError(404, 'Job not found or expired', 'JOB_NOT_FOUND'));
          return;
        }

        if (current.status === 'COMPLETED' || current.status === 'FAILED') {
          clearInterval(intervalId);
          resolve();
          return;
        }

        if (elapsed >= maxWait) {
          clearInterval(intervalId);
          reject(new AppError(408, 'Job timed out waiting for completion', 'TIMEOUT'));
        }
      }, checkInterval);
    });

    const completed = jobManager.getJob(job.id);
    if (!completed) {
      throw new AppError(404, 'Job not found', 'JOB_NOT_FOUND');
    }

    const body: StatusResponse = {
      delayTime: completed.delayTime,
      executionTime: completed.executionTime,
      id: completed.id,
      output: completed.output,
      status: completed.status,
    };

    res.status(200).json(body);
  }),
);

router.get(
  '/:endpointId/status/:jobId',
  createStatusLimiter(config.rateLimits),
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const job = jobManager.getJob(jobId);

    if (!job) {
      throw new AppError(404, 'Job not found or has expired', 'JOB_NOT_FOUND');
    }

    const body: StatusResponse = {
      delayTime: job.delayTime,
      executionTime: job.executionTime,
      id: job.id,
      output: job.output,
      status: job.status,
    };

    res.status(200).json(body);
  }),
);

router.post(
  '/:endpointId/cancel/:jobId',
  createCancelLimiter(config.rateLimits),
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const cancelled = jobManager.cancelJob(jobId);

    if (!cancelled) {
      const job = jobManager.getJob(jobId);
      if (!job) {
        throw new AppError(404, 'Job not found', 'JOB_NOT_FOUND');
      }
      throw new AppError(409, `Job cannot be cancelled in its current state: ${job.status}`, 'INVALID_STATE');
    }

    const body: CancelResponse = { id: jobId, status: 'CANCELLED' };
    res.status(200).json(body);
  }),
);

router.post(
  '/:endpointId/retry/:jobId',
  createCancelLimiter(config.rateLimits),
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const job = jobManager.retryJob(jobId);

    if (!job) {
      const existing = jobManager.getJob(jobId);
      if (!existing) {
        throw new AppError(404, 'Job not found', 'JOB_NOT_FOUND');
      }
      throw new AppError(409, `Job cannot be retried in its current state: ${existing.status}`, 'INVALID_STATE');
    }

    jobManager.startProcessing(job.id);

    const body: RetryResponse = { id: job.id, status: 'IN_QUEUE' };
    res.status(200).json(body);
  }),
);

router.post(
  '/:endpointId/purge-queue',
  createPurgeQueueLimiter(config.rateLimits),
  asyncHandler(async (_req, res) => {
    const removed = jobManager.purgeQueue();

    const body: PurgeQueueResponse = { removed, status: 'completed' };
    res.status(200).json(body);
  }),
);

router.get(
  '/:endpointId/health',
  createHealthLimiter(config.rateLimits),
  asyncHandler(async (_req, res) => {
    const health = jobManager.getHealth();

    const body: HealthResponse = health;
    res.status(200).json(body);
  }),
);

export { router as v2Router };
