import path from 'node:path';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';

export const safeIdParamSchema = z
  .string()
  .trim()
  .min(1, 'Identifier must not be empty.')
  .max(120, 'Identifier is too long.')
  .refine(
    (val) => !val.includes('..') && !val.includes('/') && !val.includes('\\') && !val.includes('\0'),
    'Identifier contains forbidden path characters.'
  );

export function parseSafeIdParam(value) {
  const parsed = safeIdParamSchema.safeParse(value);
  if (!parsed.success) {
    throw new AppError(
      400,
      'VALIDATION_FAILED',
      parsed.error.issues[0]?.message || 'Invalid resource identifier.'
    );
  }
  return parsed.data;
}

export function assertPathInsideDir(baseDir, candidatePath) {
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(candidatePath);
  if (
    resolvedTarget !== resolvedBase &&
    !resolvedTarget.startsWith(`${resolvedBase}${path.sep}`)
  ) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Path escapes allowed storage directory.');
  }
  return resolvedTarget;
}
