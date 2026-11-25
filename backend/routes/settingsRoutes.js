import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';

const updateSettingsSchema = z.object({
  violationLimit: z.union([z.literal(3), z.literal(5)]),
});

export function createSettingsRoutes({ settingsRepo }) {
  const router = Router();

  router.get('/settings', (_req, res) => {
    const raw = Number.parseInt(settingsRepo.get('violation_limit') || '', 10);
    const violationLimit = raw === 3 || raw === 5 ? raw : config.violationLimit;
    res.json({
      violationLimit,
      dataDir: config.dataDir,
    });
  });

  router.post('/settings', (req, res, next) => {
    try {
      const parsed = updateSettingsSchema.parse(req.body);
      settingsRepo.set('violation_limit', String(parsed.violationLimit));
      res.json({
        saved: true,
        violationLimit: parsed.violationLimit,
        dataDir: config.dataDir,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
