# AGENTS.md — Mock RunPod Serverless API

## Quick Reference

**Project Type**: Express.js mock of RunPod Serverless API for local development  
**Target**: [mangakoi-ai](https://github.com/akira/mangakoi-ai) manga translation worker  
**Port**: `3000` (configurable via `PORT`)  
**Auth**: Bearer token (`MOCK_API_KEY` env var)  
**Runtime**: Node.js 20+ (TypeScript, compiled to `dist/`)

---

## Endpoints

All endpoints are under `/v2/{endpointId}` and require `Authorization: Bearer <MOCK_API_KEY>`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v2/:endpointId/run` | Submit async job → returns `{ id, status: "IN_QUEUE" }` |
| `POST` | `/v2/:endpointId/runsync` | Submit sync job → waits for completion → returns full result |
| `GET` | `/v2/:endpointId/status/:jobId` | Poll job status and result |
| `POST` | `/v2/:endpointId/cancel/:jobId` | Cancel a queued or in-progress job |
| `POST` | `/v2/:endpointId/retry/:jobId` | Requeue a failed/timed-out job |
| `POST` | `/v2/:endpointId/purge-queue` | Remove all queued jobs |
| `GET` | `/v2/:endpointId/health` | Return worker and queue statistics |

### Unauthenticated

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Liveness check (no auth required) |

---

## Request Format

```json
{
  "input": {
    "inputObjectKey": "uploads/page_001.png",
    "sourceLanguage": "ja",
    "targetLanguage": "en",
    "readingDirection": "rtl"
  }
}
```

### Optional Fields

```json
{
  "input": { ... },
  "webhook": "https://your-webhook-url.com",
  "policy": {
    "executionTimeout": 900000,
    "lowPriority": false,
    "ttl": 3600000
  }
}
```

---

## Response Formats

### POST /run (async)

```json
{
  "id": "60902e6c-08a1-426e-9cb9-9eaec90f5e3b",
  "status": "IN_QUEUE"
}
```

### POST /runsync (sync)

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

### GET /status (in_queue)

```json
{
  "id": "60902e6c-08a1-426e-9cb9-9eaec90f5e3b",
  "status": "IN_QUEUE"
}
```

### GET /status (in_progress)

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

### GET /status (completed)

```json
{
  "delayTime": 824,
  "executionTime": 3391,
  "id": "60902e6c-08a1-426e-9cb9-9eaec90f5e3b",
  "output": {
    "status": "done",
    "outputObjectKey": "outputs/60902e6c-08a1-426e-9cb9-9eaec90f5e3b/translated.png",
    "elapsedSeconds": 45.2
  },
  "status": "COMPLETED"
}
```

### GET /status (failed)

```json
{
  "id": "a1b2c3d4-...",
  "error": "SimulatedError: Mock pipeline failure",
  "status": "FAILED"
}
```

### GET /status (timed_out)

```json
{
  "id": "60902e6c-08a1-426e-9cb9-9eaec90f5e3b",
  "status": "TIMED_OUT"
}
```

### GET /health

```json
{
  "jobs": {
    "inQueue": 2,
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

## Job State Machine

```
IN_QUEUE → IN_PROGRESS → COMPLETED  (happy path, ~MOCK_FAILURE_RATE chance of failure)
IN_QUEUE → IN_PROGRESS → FAILED     (simulated failure)
IN_QUEUE → CANCELLED                (cancel while queued)
IN_PROGRESS → CANCELLED             (cancel while running)
IN_QUEUE → TIMED_OUT                (TTL expiry while queued)
IN_PROGRESS → TIMED_OUT             (TTL expiry or executionTimeout exceeded)
```

Jobs automatically expire after their `ttl` (default 24 hours) and are removed from memory. Jobs that exceed `executionTimeout` while in `IN_PROGRESS` are also marked as `TIMED_OUT`.

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Environment mode |
| `MOCK_API_KEY` | `dev-mock-api-key-change-in-production` | Bearer token for auth |
| `SIMULATED_DELAY_MIN_MS` | `1000` | Min simulated pipeline delay (ms) |
| `SIMULATED_DELAY_MAX_MS` | `5000` | Max simulated pipeline delay (ms) |
| `MOCK_FAILURE_RATE` | `0` | Probability of job failure (0.0–1.0) |
| `DEFAULT_EXECUTION_TIMEOUT_MS` | `600000` | Max execution time (ms) enforced during IN_PROGRESS |
| `DEFAULT_TTL_MS` | `86400000` | Total job lifespan (ms) from creation — covers queue + execution |
| `WEBHOOK_TIMEOUT_MS` | `10000` | Timeout per attempt for webhook POST delivery (ms); retries up to 2 more times with 10s delay on non-200 |
| `CORS_ORIGIN` | `*` | Allowed CORS origin |
| `RATE_LIMIT_RUN` | `1000` | Max `/run` requests per 10s |
| `RATE_LIMIT_RUNSYNC` | `2000` | Max `/runsync` requests per 10s |
| `RATE_LIMIT_STATUS` | `2000` | Max `/status` requests per 10s |
| `RATE_LIMIT_CANCEL` | `100` | Max `/cancel` requests per 10s |
| `RATE_LIMIT_PURGE_QUEUE` | `2` | Max `/purge-queue` requests per 10s |
| `RATE_LIMIT_HEALTH` | `2000` | Max `/health` requests per 10s |

---

## Usage

```bash
# Install
npm install

# Development (hot reload with tsx)
npm run dev

# Production build
npm run build && npm start

# Type-check only
npm run typecheck
```

### Example curl

```bash
# Set your key
KEY="dev-mock-api-key-change-in-production"
ENDPOINT="my-worker"

# Submit async job
curl -s -X POST "http://localhost:3000/v2/$ENDPOINT/run" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"inputObjectKey":"uploads/page_001.png"}}'

# Poll status
curl -s "http://localhost:3000/v2/$ENDPOINT/status/JOB_ID" \
  -H "Authorization: Bearer $KEY"

# Submit sync job
curl -s -X POST "http://localhost:3000/v2/$ENDPOINT/runsync" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"input":{"inputObjectKey":"sync-test.png"}}'
```

---

## Architecture

```
src/
├── index.ts              # Entry point — starts server, graceful shutdown
├── app.ts                # Express app assembly (helmet, cors, morgan, routes)
├── config/
│   └── index.ts          # Env-driven typed config with validation
├── middleware/
│   ├── auth.ts           # Bearer token → 401 if missing/mismatch
│   ├── errorHandler.ts   # Global error handler (no stack in prod)
│   ├── rateLimiter.ts    # Per-endpoint rate limiters
│   └── validate.ts       # Zod schema for input validation
├── routes/
│   └── v2.ts             # All 7 endpoints under /v2/:endpointId/*
├── services/
│   └── jobManager.ts     # In-memory job state machine
├── types/
│   └── index.ts          # All TypeScript interfaces and types
└── utils/
    ├── logger.ts         # Winston JSON logger with AsyncLocalStorage request IDs
    └── idGenerator.ts    # UUID v4 wrapper
```
