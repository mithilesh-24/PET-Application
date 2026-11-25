import { Router } from 'express';
import { config } from '../config.js';
import { detectCompilers } from '../compiler/compilerDetector.js';

export function createHealthRoutes({ getDiagnostics } = {}) {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      ok: true,
      version: config.version,
    });
  });

  router.get('/health/diagnostics', async (_req, res, next) => {
    try {
      const diagnostics =
        (typeof getDiagnostics === 'function' ? await getDiagnostics() : null) ||
        (await detectCompilers());
      res.json({
        ok: diagnostics.ready,
        version: config.version,
        ...diagnostics,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export default createHealthRoutes();
