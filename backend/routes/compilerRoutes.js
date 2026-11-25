import { Router } from 'express';
import { detectCompilers } from '../compiler/compilerDetector.js';

export function createCompilerRoutes({ getDiagnostics } = {}) {
  const router = Router();

  router.get('/settings/compilers', async (_req, res, next) => {
    try {
      const status =
        (typeof getDiagnostics === 'function' ? await getDiagnostics() : null) ||
        (await detectCompilers());
      res.json(status);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export default createCompilerRoutes();
