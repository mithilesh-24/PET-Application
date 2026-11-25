import { Router } from 'express';

export function createResultRoutes({ resultService }) {
  const router = Router();

  router.get('/attempts/:id/result', async (req, res, next) => {
    try {
      const data = await resultService.getResult(req.params.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.get('/attempts/:id/review', async (req, res, next) => {
    try {
      const data = await resultService.getReview(req.params.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
