import { Router } from 'express';
import { detectCompilers } from '../compiler/compilerDetector.js';

const router = Router();

router.get('/settings/compilers', async (_req, res, next) => {
  try {
    const status = await detectCompilers();
    res.json(status);
  } catch (err) {
    next(err);
  }
});

export default router;
