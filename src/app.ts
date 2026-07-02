import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { v2Router } from './routes/v2.js';
import { errorHandler } from './middleware/errorHandler.js';
import { AppError } from './types/index.js';
import config from './config/index.js';
import { requestIdStorage } from './utils/logger.js';
import { generateJobId } from './utils/idGenerator.js';

const app = express();

app.use(helmet());

app.use(cors({
  origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(','),
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

app.use(express.json({ limit: '10mb' }));

app.use((_req: Request, res: Response, next: NextFunction) => {
  const requestId = generateJobId();
  requestIdStorage.run(requestId, () => {
    res.setHeader('X-Request-Id', requestId);
    next();
  });
});

const morganFormat = config.nodeEnv === 'production'
  ? ':remote-addr :method :url :status :res[content-length] - :response-time ms'
  : 'dev';

app.use(morgan(morganFormat, {
  stream: {
    write: (message: string) => {
      process.stdout.write(message);
    },
  },
}));

app.use('/v2', v2Router);

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'mangakoi-mock-worker-api', version: '1.0.0' });
});

app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(new AppError(404, 'Route not found', 'NOT_FOUND'));
});

app.use(errorHandler);

export default app;
