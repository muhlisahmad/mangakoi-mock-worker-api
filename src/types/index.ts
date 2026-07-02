export type JobStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMED_OUT';

export type OutputStatus = 'done' | 'failed';

export interface WorkerInput {
  inputObjectKey: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  readingDirection?: 'rtl' | 'ltr';
}

export interface RunRequestBody {
  input: WorkerInput;
  webhook?: string;
  policy?: {
    executionTimeout?: number;
    lowPriority?: boolean;
    ttl?: number;
  };
}

export interface JobOutput {
  status: OutputStatus;
  outputObjectKey?: string;
  error?: string;
  elapsedSeconds?: number;
}

export interface Job {
  id: string;
  endpointId: string;
  input: WorkerInput;
  webhook?: string;
  policy?: {
    executionTimeout?: number;
    lowPriority?: boolean;
    ttl?: number;
  };
  status: JobStatus;
  output: JobOutput | null;
  delayTime: number;
  executionTime: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  retryCount: number;
}

export interface RunResponse {
  id: string;
  status: Extract<JobStatus, 'IN_QUEUE'>;
}

export interface StatusResponse {
  delayTime: number;
  executionTime: number;
  id: string;
  output: JobOutput | null;
  status: JobStatus;
}

export interface CancelResponse {
  id: string;
  status: Extract<JobStatus, 'CANCELLED'>;
}

export interface RetryResponse {
  id: string;
  status: Extract<JobStatus, 'IN_QUEUE'>;
}

export interface PurgeQueueResponse {
  removed: number;
  status: 'completed';
}

export interface HealthResponse {
  jobs: {
    inQueue: number;
    inProgress: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
  workers: {
    idle: number;
    running: number;
  };
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  mockApiKey: string;
  simulatedDelayMinMs: number;
  simulatedDelayMaxMs: number;
  mockFailureRate: number;
  corsOrigin: string;
  rateLimits: {
    run: number;
    runsync: number;
    status: number;
    cancel: number;
    purgeQueue: number;
    health: number;
  };
}

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
