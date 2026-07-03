# mangakoi-mock-worker-api

A **self-contained mock** of RunPod's Serverless API for local development of the [mangakoi-ai](https://github.com/akira/mangakoi-ai) manga translation worker.

Run it on your machine instead of deploying to RunPod's paid infrastructure during development. Simulates the full job lifecycle — submit, poll, cancel, retry — with configurable latency and failure rates.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Why This Exists](#why-this-exists)
- [Endpoints](#endpoints)
  - [Operations Reference](#operations-reference)
  - [Response Formats](#response-formats)
- [Usage Examples](#usage-examples)
  - [Async Flow (Post → Poll)](#async-flow-post--poll)
  - [Sync Flow (Runsync)](#sync-flow-runsync)
  - [Error Handling](#error-handling)
- [Job Lifecycle](#job-lifecycle)
- [Configuration](#configuration)
- [Architecture](#architecture)
- [Development](#development)
- [Differences from Real RunPod API](#differences-from-real-runpod-api)

---

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env

# Start development server (hot reload)
npm run dev

# Or for production
npm run build && npm start
```

```bash
# In another terminal — submit an async job
curl -s -X POST http://localhost:3000/v2/my-worker/run \
  -H "Authorization: Bearer dev-mock-api-key-change-in-production" \
  -H "Content-Type: application/json" \
  -d '{"input":{"inputObjectKey":"uploads/page_001.png"}}'

# Returns: {"id":"<uuid>","status":"IN_QUEUE"}
```

---

## Why This Exists

The mangakoi-ai worker is a 5-stage ML pipeline (detection → OCR → translation → inpainting → typesetting) deployed as a RunPod Serverless worker. Before spending money on GPU instances, you need to:

- **Iterate on the client integration**: Does your polling logic handle edge cases? Timeouts? Cancellations?
- **Test the full request/response contract**: Are you parsing the RunPod response format correctly?
- **Develop the frontend/API layer**: Wire up the button before the worker is live.

This mock gives you a **drop-in replacement** for `https://api.runpod.ai/v2/{ENDPOINT_ID}/*` that runs on your laptop.

---

## Endpoints

All endpoints live under `/v2/{endpointId}` and require `Authorization: Bearer <MOCK_API_KEY>`.

### Operations Reference

| Method | Path                            | Description                                                                                                    |
| ------ | ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `POST` | `/v2/:endpointId/run`           | Submit an asynchronous job. Returns immediately with a job ID. Results available via `/status` for 30 minutes. |
| `POST` | `/v2/:endpointId/runsync`       | Submit a synchronous job. Blocks the HTTP response until the job completes (or times out).                     |
| `GET`  | `/v2/:endpointId/status/:jobId` | Retrieve the current state and output of a submitted job.                                                      |
| `POST` | `/v2/:endpointId/cancel/:jobId` | Cancel a job that is queued or in progress. Returns 409 if the job has already terminated.                     |
| `POST` | `/v2/:endpointId/retry/:jobId`  | Requeue a `FAILED` or `TIMED_OUT` job with the same ID and input.                                              |
| `POST` | `/v2/:endpointId/purge-queue`   | Remove all queued (`IN_QUEUE`) jobs. Returns the count removed.                                                |
| `GET`  | `/v2/:endpointId/health`        | Return operational statistics — job counts by state, worker status.                                            |
| `GET`  | `/health`                       | Simple liveness check. No authentication required.                                                             |

### Response Formats

#### POST /run (async submission)

```json
{
  "id": "60902e6c-08a1-426e-9cb9-9eaec90f5e3b",
  "status": "IN_QUEUE"
}
```

#### POST /runsync (sync completion)

> Sync job IDs are prefixed with `sync-` to match the real RunPod API.

```json
{
  "delayTime": 824,
  "executionTime": 3391,
  "id": "sync-79164ff4-d212-44bc-9fe3-389e199a5c15",
  "output": {
    "status": "done",
    "outputObjectKey": "outputs/sync-79164ff4-d212-44bc-9fe3-389e199a5c15/translated.png",
    "elapsedSeconds": 45.2
  },
  "status": "COMPLETED"
}
```

#### GET /status (in_queue)

```json
{
  "id": "60902e6c-08a1-426e-9cb9-9eaec90f5e3b",
  "status": "IN_QUEUE"
}
```

#### GET /status (in_progress)

```json
{
  "delayTime": 1200,
  "id": "60902e6c-08a1-426e-9cb9-9eaec90f5e3b",
  "input": {
    "inputObjectKey": "uploads/page_001.png",
    "sourceLanguage": "ja",
    "targetLanguage": "en",
    "readingDirection": "rtl"
  },
  "status": "IN_PROGRESS"
}
```

#### GET /status (completed)

```json
{
  "delayTime": 31618,
  "executionTime": 1437,
  "id": "60902e6c-08a1-426e-9cb9-9eaec90f5e3b",
  "output": {
    "status": "done",
    "outputObjectKey": "outputs/60902e6c-08a1-426e-9cb9-9eaec90f5e3b/translated.png",
    "elapsedSeconds": 45.2
  },
  "status": "COMPLETED"
}
```

#### GET /status (failed)

```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "error": "SimulatedError: Mock pipeline failure (controlled by MOCK_FAILURE_RATE)",
  "status": "FAILED"
}
```

#### GET /status (timed_out)

```json
{
  "id": "60902e6c-08a1-426e-9cb9-9eaec90f5e3b",
  "status": "TIMED_OUT"
}
```

#### POST /cancel

```json
{
  "id": "724907fe-7bcc-4e42-998d-52cb93e1421f-u1",
  "status": "CANCELLED"
}
```

#### POST /retry

```json
{
  "id": "60902e6c-08a1-426e-9cb9-9eaec90f5e2b-u1",
  "status": "IN_QUEUE"
}
```

#### POST /purge-queue

```json
{
  "removed": 2,
  "status": "completed"
}
```

#### GET /health

```json
{
  "jobs": {
    "inQueue": 0,
    "inProgress": 1,
    "completed": 5,
    "failed": 0,
    "cancelled": 1
  },
  "workers": {
    "idle": 0,
    "running": 1
  }
}
```

---

## Usage Examples

### Async Flow (Post → Poll)

Submit a job, then poll `/status` until it completes.

```bash
KEY="dev-mock-api-key-change-in-production"
ENDPOINT="manga-translator"

# Step 1: Submit
RESP=$(curl -s -X POST "http://localhost:3000/v2/$ENDPOINT/run" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"inputObjectKey":"uploads/page_001.png"}}')

JOB_ID=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Job: $JOB_ID"

# Step 2: Poll until done
while true; do
  STATUS=$(curl -s "http://localhost:3000/v2/$ENDPOINT/status/$JOB_ID" \
    -H "Authorization: Bearer $KEY")
  STATE=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
  echo "State: $STATE"

  if [ "$STATE" = "COMPLETED" ] || [ "$STATE" = "FAILED" ]; then
    echo "$STATUS" | python3 -m json.tool
    break
  fi
  sleep 1
done
```

### Sync Flow (Runsync)

Submit a synchronous job. The request blocks until the simulated pipeline finishes.

```bash
KEY="dev-mock-api-key-change-in-production"
ENDPOINT="manga-translator"

curl -s -X POST "http://localhost:3000/v2/$ENDPOINT/runsync" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"inputObjectKey":"sync-test.png"}}' \
  | python3 -m json.tool
```

Use the `--max-time` flag to control how long your client waits:

```bash
curl -s --max-time 10 ...
```

### Webhook Delivery

When a job includes a `webhook` URL, the mock POSTs the job result to that URL once the job reaches `COMPLETED` or `FAILED`. Delivery is fire-and-forget (non-blocking) with a configurable timeout (`WEBHOOK_TIMEOUT_MS`, default 10s). Retry behavior matches RunPod: up to 3 total attempts with a 10-second delay between retries, stopping only on HTTP 200.

```bash
curl -s -X POST "http://localhost:3000/v2/$ENDPOINT/run" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {"inputObjectKey": "page.png"},
    "webhook": "https://your-server.com/callback"
  }'
```

The webhook payload matches the `/status` response shape:

```json
{
  "id": "sync-79164ff4-d212-44bc-9fe3-389e199a5c15",
  "status": "COMPLETED",
  "output": {
    "status": "done",
    "outputObjectKey": "outputs/.../translated.png",
    "elapsedSeconds": 0.8
  },
  "delayTime": 120,
  "executionTime": 800
}
```

### Error Handling

```bash
# 401 — bad API key
curl -s http://localhost:3000/v2/test/status/job-123 \
  -H "Authorization: Bearer wrong-key"
# => {"error":"Invalid API key","code":"UNAUTHORIZED"}

# 400 — missing required field
curl -s -X POST http://localhost:3000/v2/test/run \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{}}'
# => {"error":"Validation failed: input.inputObjectKey: inputObjectKey is required","code":"VALIDATION_ERROR"}

# 404 — unknown job
curl -s http://localhost:3000/v2/test/status/nonexistent \
  -H "Authorization: Bearer $KEY"
# => {"error":"Job not found or has expired","code":"JOB_NOT_FOUND"}

# 409 — invalid state transition
curl -s -X POST http://localhost:3000/v2/test/cancel/$COMPLETED_JOB \
  -H "Authorization: Bearer $KEY"
# => {"error":"Job cannot be cancelled in its current state: COMPLETED","code":"INVALID_STATE"}

# 429 — rate limited
# Send many requests quickly...
# => {"error":"Too many requests. Rate limit exceeded for /run."}
```

---

## Job Lifecycle

```
                        ┌──────────────┐
                        │  IN_QUEUE    │
                        └──────┬───────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
               worker picks up        cancel request
                    │                     │
                    ▼                     ▼
             ┌──────────────┐    ┌──────────────┐
             │ IN_PROGRESS  │    │  CANCELLED   │
             └──────┬───────┘    └──────────────┘
                    │                     │
          ┌─────────┴─────────┐           │
          │                   │           │
     pipeline success    pipeline failure │
          │                   │           │
          ▼                   ▼           │
   ┌──────────────┐   ┌──────────────┐    │
   │  COMPLETED   │   │   FAILED     │    │
   └──────────────┘   └──────┬───────┘    │
                             │            │
                        retry request     │
                             │            │
                             ▼            │
                         ┌──────────────┐ │
                         │  IN_QUEUE    │ │  (same job ID)
                         └──────────────┘ │
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │  TIMED_OUT   │
                                   └──────────────┘
```

Any job in `IN_QUEUE` or `IN_PROGRESS` that exceeds its `ttl` moves to `TIMED_OUT` and is removed from memory. Jobs in `IN_PROGRESS` also time out if execution exceeds `executionTimeout`.

---

## Configuration

All configuration is through environment variables. Copy `.env.example` to `.env` and modify.

| Variable                       | Default                                 | Description                                                                                                                                                             |
| ------------------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                         | `3000`                                  | HTTP port the server listens on.                                                                                                                                        |
| `NODE_ENV`                     | `development`                           | Set to `production` to suppress stack traces in error responses.                                                                                                        |
| `MOCK_API_KEY`                 | `dev-mock-api-key-change-in-production` | Bearer token clients must send in the `Authorization` header. **Change this for anything beyond local testing.**                                                        |
| `SIMULATED_DELAY_MIN_MS`       | `1000`                                  | Minimum simulated pipeline duration in milliseconds.                                                                                                                    |
| `SIMULATED_DELAY_MAX_MS`       | `5000`                                  | Maximum simulated pipeline duration in milliseconds. The actual delay is uniformly random between min and max.                                                          |
| `MOCK_FAILURE_RATE`            | `0`                                     | Probability (0.0 to 1.0) that a job will simulate a pipeline failure. `0` means all jobs succeed; `0.1` means ~10% fail.                                                |
| `DEFAULT_EXECUTION_TIMEOUT_MS` | `600000`                                | Maximum time (ms) a job can actively run once a worker picks it up. Enforced during `IN_PROGRESS` — if the simulated delay exceeds this, the job is marked `TIMED_OUT`. |
| `DEFAULT_TTL_MS`               | `86400000`                              | Total lifespan (ms) of a job from creation. Covers queue time + execution + idle. After expiry, the job is deleted regardless of state.                                 |
| `CORS_ORIGIN`                  | `*`                                     | Allowed CORS origin. Set to a specific origin in production.                                                                                                            |
| `WEBHOOK_TIMEOUT_MS`           | `10000`                                 | Timeout per attempt (ms) for POST delivery to the `webhook` URL. On non-200, retries up to 2 more times with a 10s delay.                                               |
| `RATE_LIMIT_RUN`               | `1000`                                  | Max `/run` requests per 10-second window. Matches RunPod's documented rate limit.                                                                                       |
| `RATE_LIMIT_RUNSYNC`           | `2000`                                  | Max `/runsync` requests per 10-second window.                                                                                                                           |
| `RATE_LIMIT_STATUS`            | `2000`                                  | Max `/status` requests per 10-second window.                                                                                                                            |
| `RATE_LIMIT_CANCEL`            | `100`                                   | Max `/cancel` requests per 10-second window.                                                                                                                            |
| `RATE_LIMIT_PURGE_QUEUE`       | `2`                                     | Max `/purge-queue` requests per 10-second window.                                                                                                                       |
| `RATE_LIMIT_HEALTH`            | `2000`                                  | Max `/health` requests per 10-second window.                                                                                                                            |

### Tuning Simulated Behavior

| Scenario                      | `SIMULATED_DELAY_MIN_MS` | `SIMULATED_DELAY_MAX_MS` | `MOCK_FAILURE_RATE` |
| ----------------------------- | ------------------------ | ------------------------ | ------------------- |
| Everything succeeds instantly | `0`                      | `0`                      | `0`                 |
| Realistic pipeline timing     | `1000`                   | `5000`                   | `0`                 |
| Test failure handling         | `500`                    | `2000`                   | `0.2`               |
| Stress test timeouts          | `30000`                  | `60000`                  | `0`                 |

---

## Architecture

```
src/
├── index.ts                # Entry point — starts Express, graceful shutdown handlers
├── app.ts                  # Express app assembly — middleware pipeline (helmet → cors → json → morgan → routes → error handler)
├── config/
│   └── index.ts            # Reads env vars, validates constraints, exports typed AppConfig
├── middleware/
│   ├── auth.ts             # Bearer token comparison against MOCK_API_KEY
│   ├── errorHandler.ts     # Catches AppError (status code), payload-too-large, and unhandled errors
│   ├── rateLimiter.ts      # Factory functions creating express-rate-limit instances per endpoint
│   └── validate.ts         # Zod schema matching mangakoi-ai's INPUT_SCHEMA
├── routes/
│   └── v2.ts               # All 7 endpoints under /v2/:endpointId/*, plus asyncHandler wrapper
├── services/
│   └── jobManager.ts       # Singleton in-memory job store (Map<string, Job>), state transitions, expiry
├── types/
│   └── index.ts            # TypeScript interfaces for Job, JobStatus, all response shapes, AppError
└── utils/
    ├── logger.ts           # Winston logger with JSON format, AsyncLocalStorage for request ID tracking
    └── idGenerator.ts      # Thin wrapper around uuid v4
```

### Layer Responsibilities

- **Routes** — destructure params, delegate to services, format responses, never touch storage directly.
- **Services** — business logic: job state machine, timer management, state transitions.
- **Middleware** — cross-cutting concerns: auth, validation, rate limiting, error handling.
- **Config** — single source of truth for all tunable parameters, validated at startup.
- **Types** — shared contracts between layers, no circular dependencies.

### Request Flow

```
Request → helmet → cors → json() → requestId (AsyncLocalStorage) → morgan → auth → rateLimiter → validate → route handler → service → response
                                                      ↓
                                              errorHandler (if thrown)
```

---

## Development

```bash
# Install
npm install

# Start with hot reload (using tsx watch)
npm run dev

# Type-check without emitting
npm run typecheck

# Build to dist/
npm run build

# Run compiled output
npm start

# Clean build artifacts
npm run clean
```

### Project Commands

| Command             | Description                                                      |
| ------------------- | ---------------------------------------------------------------- |
| `npm run dev`       | Start with `tsx watch` — automatically restarts on file changes. |
| `npm run build`     | Compile TypeScript to `dist/` with source maps and declarations. |
| `npm start`         | Run the compiled JavaScript from `dist/index.js`.                |
| `npm run typecheck` | Run `tsc --noEmit` to check types without compiling.             |
| `npm run clean`     | Remove the `dist/` directory.                                    |

---

## Differences from Real RunPod API

This mock is designed for **local development and integration testing**. It is not a perfect replica. Key differences:

| Aspect                | Real RunPod                                    | This Mock                                                                                                                                 |
| --------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Storage**           | S3-compatible object storage with `s3Config`   | No storage — returns a synthetic `outputObjectKey` path.                                                                                  |
| **Webhooks**          | Sends HTTP POST to `webhook` URL on completion | Delivered asynchronously via POST with configurable timeout. Retries up to 3 times with 10s delay, matching RunPod's documented behavior. |
| **Results retention** | 30 min (async), 1 min (sync)                   | Configurable via `policy.ttl`, defaults to 30 min.                                                                                        |
| **Worker scaling**    | Auto-scales workers based on queue depth       | Single simulated worker.                                                                                                                  |
| **Streaming**         | `/stream` endpoint for incremental output      | Not implemented.                                                                                                                          |
| **Persistence**       | Jobs survive worker restarts                   | In-memory only — all jobs lost on restart.                                                                                                |
| **Rate limits**       | Dynamic based on worker count                  | Static per-endpoint limits, configurable via env.                                                                                         |

### When to Use vs Deploy to RunPod

| Use the mock when...              | Deploy to RunPod when...     |
| --------------------------------- | ---------------------------- |
| Developing the client integration | Running the full ML pipeline |
| Writing tests for polling logic   | Testing GPU inference        |
| Iterating on error handling       | Validating S3 I/O            |
| CI/CD pipeline testing            | Performance and load testing |
| Frontend development              | Production deployment        |
