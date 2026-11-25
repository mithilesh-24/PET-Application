import { Router } from 'express';
import { parseSafeIdParam } from '../schemas/routeParams.js';

export function createResultRoutes({ resultService }) {
  const router = Router();

  router.get('/attempts/:id/result', async (req, res, next) => {
    try {
      const attemptId = parseSafeIdParam(req.params.id);
      const data = await resultService.getResult(attemptId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get('/attempts/:id/review', async (req, res, next) => {
    try {
      const attemptId = parseSafeIdParam(req.params.id);
      const data = await resultService.getReview(attemptId);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
