import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../types/index.js';

const workerInputSchema = z.object({
  inputObjectKey: z.string({
    required_error: 'inputObjectKey is required',
    invalid_type_error: 'inputObjectKey must be a string',
  }).min(1, 'inputObjectKey must not be empty'),
  sourceLanguage: z.string().optional().default('ja'),
  targetLanguage: z.string().optional().default('en'),
  readingDirection: z.enum(['rtl', 'ltr']).optional().default('rtl'),
});

const policySchema = z.object({
  executionTimeout: z.number().int().positive().optional(),
  lowPriority: z.boolean().optional(),
  ttl: z.number().int().positive().optional(),
});

const runRequestBodySchema = z.object({
  input: workerInputSchema,
  webhook: z.string().url().optional(),
  policy: policySchema.optional(),
});

export type ValidatedRunRequest = z.infer<typeof runRequestBodySchema>;

export function validateRunRequest(req: Request, _res: Response, next: NextFunction): void {
  const result = runRequestBodySchema.safeParse(req.body);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new AppError(400, `Validation failed: ${errors.map((e) => `${e.path}: ${e.message}`).join('; ')}`, 'VALIDATION_ERROR');
  }

  req.body = result.data;
  next();
}
