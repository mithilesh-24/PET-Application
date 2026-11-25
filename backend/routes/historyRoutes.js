import { Router } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler.js';
import { parseSafeIdParam } from '../schemas/routeParams.js';

const compareQuerySchema = z.object({
  ids: z.string().min(1, 'ids query parameter is required.'),
});

const exportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
});

export function createHistoryRoutes({ historyService }) {
  const router = Router();

  router.get('/history', async (req, res, next) => {
    try {
      const data = await historyService.listHistory();
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get('/history/analytics', async (req, res, next) => {
    try {
      const data = await historyService.getAnalytics();
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get('/history/compare', async (req, res, next) => {
    try {
      const parsed = compareQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          parsed.error.issues[0]?.message || 'Provide 2 to 4 attempt IDs in ids query parameter.'
        );
      }
      const data = await historyService.compareAttempts(parsed.data.ids);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get('/attempts/:id/export', async (req, res, next) => {
    try {
      const attemptId = parseSafeIdParam(req.params.id);
      const parsed = exportQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new AppError(400, 'VALIDATION_ERROR', 'Export format must be json or csv.');
      }
      const exported = await historyService.exportAttempt(attemptId, parsed.data.format);
      res.setHeader('Content-Type', exported.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${exported.filename}"`);
      res.send(exported.body);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/attempts/:id', (req, res, next) => {
    try {
      const attemptId = parseSafeIdParam(req.params.id);
      const result = historyService.deleteAttempt(attemptId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
