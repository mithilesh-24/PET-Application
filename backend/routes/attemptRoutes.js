import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { AppError } from '../middleware/errorHandler.js';

const createAttemptSchema = z.object({
  paperId: z.string().min(1),
  violationLimit: z.union([z.literal(3), z.literal(5)]).optional(),
});

export function createAttemptRoutes({ papersRepo, attemptsRepo }) {
  const router = Router();

  router.post('/attempts', (req, res, next) => {
    try {
      const parsed = createAttemptSchema.parse(req.body);
      const paper = papersRepo.getById(parsed.paperId) || papersRepo.getByPaperId(parsed.paperId);
      if (!paper) {
        return next(new AppError(404, 'NOT_FOUND', `Paper "${parsed.paperId}" not found.`));
      }

      const attempt = attemptsRepo.create({
        paper_id: paper.id,
        status: 'not_started',
        violation_limit: parsed.violationLimit ?? config.violationLimit,
        current_section: null,
        current_index: 0,
      });

      return res.status(201).json({
        attempt: {
          id: attempt.id,
          paperId: paper.paper_id,
          paperDbId: paper.id,
          paperTitle: paper.title,
          status: attempt.status,
          violationLimit: attempt.violation_limit,
        },
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
