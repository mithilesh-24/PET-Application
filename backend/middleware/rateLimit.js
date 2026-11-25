import { AppError } from './errorHandler.js';

export function createRateLimiter({
  windowMs = 60 * 1000,
  maxRequests = 60,
  nowFn = () => Date.now(),
} = {}) {
  const hits = new Map();

  return function rateLimitMiddleware(req, _res, next) {
    const now = nowFn();
    const key = `${req.ip || 'local'}:${req.params?.id || 'global'}`;
    const cutoff = now - windowMs;
    const timestamps = (hits.get(key) || []).filter((ts) => ts > cutoff);

    if (timestamps.length >= maxRequests) {
      return next(
        new AppError(
          429,
          'RATE_LIMITED',
          'Too many code execution requests. Please wait a moment before trying again.'
        )
      );
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    return next();
  };
}
