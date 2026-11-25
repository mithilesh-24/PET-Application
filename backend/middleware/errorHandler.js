export class AppError extends Error {
  constructor(statusCode, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(req, _res, next) {
  next(new AppError(404, 'NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`));
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof AppError) {
    const payload = {
      error: {
        code: err.code,
        message: err.message,
      },
    };
    if (err.details !== undefined) {
      payload.error.details = err.details;
    }
    return res.status(err.statusCode).json(payload);
  }

  if (err?.name === 'ZodError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: err.issues,
      },
    });
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Malformed JSON request body',
      },
    });
  }

  if (err?.type === 'entity.too.large' || err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request payload exceeds size limit',
      },
    });
  }

  if (err?.name === 'MulterError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: err.message || 'Invalid multipart upload',
      },
    });
  }

  if (process.env.NODE_ENV !== 'test') {
    console.error('[error]', err);
  }

  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected internal error occurred',
    },
  });
}
