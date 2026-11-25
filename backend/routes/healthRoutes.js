import { Router } from 'express';
import { config } from '../config.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    version: config.version,
  });
});

export default router;
