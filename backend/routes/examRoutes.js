import { Router } from 'express';
import { z } from 'zod';

const createAttemptSchema = z.object({
  paperId: z.string().min(1),
  violationLimit: z.union([z.literal(3), z.literal(5)]).optional(),
});

const startSectionSchema = z
  .object({
    section: z.enum(['S1', 'S2', 'S2A']).optional(),
  })
  .optional();

const saveAnswerSchema = z.object({
  questionId: z.string().min(1),
  selectedIndex: z.union([z.number().int().min(0).max(3), z.null()]),
  timeSpentMs: z.number().int().min(0).optional(),
});

const nextQuestionSchema = z
  .object({
    unanswered: z.boolean().optional(),
    questionId: z.string().min(1).optional(),
  })
  .optional();

const violationSchema = z.object({
  type: z.enum(['tab_hidden', 'fullscreen_exit', 'window_blur', 'devtools', 'copy_paste']),
  section: z.enum(['S1', 'S2', 'S2A']).nullable().optional(),
  questionId: z.string().nullable().optional(),
});

const terminateSchema = z
  .object({
    reason: z.string().min(1).max(300).optional(),
  })
  .optional();

export function createExamRoutes({ examEngine }) {
  const router = Router();

  router.post('/attempts', (req, res, next) => {
    try {
      const parsed = createAttemptSchema.parse(req.body);
      const attempt = examEngine.createAttempt(parsed);
      res.status(201).json({ attempt });
    } catch (err) {
      next(err);
    }
  });

  router.get('/attempts/:id/state', async (req, res, next) => {
    try {
      const state = await examEngine.getState(req.params.id);
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  router.post('/attempts/:id/start-section', async (req, res, next) => {
    try {
      const parsed = startSectionSchema.parse(req.body);
      const state = await examEngine.startSection(req.params.id, parsed?.section);
      res.json(state);
    } catch (err) {
      next(err);
    }
  });

  router.get('/attempts/:id/question', async (req, res, next) => {
    try {
      const data = await examEngine.getCurrentQuestion(req.params.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  router.post('/attempts/:id/answer', async (req, res, next) => {
    try {
      const parsed = saveAnswerSchema.parse(req.body);
      const result = await examEngine.saveAnswer(req.params.id, parsed);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/attempts/:id/next', async (req, res, next) => {
    try {
      const parsed = nextQuestionSchema.parse(req.body);
      const result = await examEngine.nextQuestion(req.params.id, parsed || {});
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/attempts/:id/submit-section', async (req, res, next) => {
    try {
      const result = await examEngine.submitSection(req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/attempts/:id/violation', (req, res, next) => {
    try {
      const parsed = violationSchema.parse(req.body);
      const outcome = examEngine.recordViolation(req.params.id, parsed);
      res.json(outcome);
    } catch (err) {
      next(err);
    }
  });

  router.post('/attempts/:id/terminate', async (req, res, next) => {
    try {
      const parsed = terminateSchema.parse(req.body);
      examEngine.terminateAttempt(req.params.id, parsed?.reason || 'Terminated by client');
      const state = await examEngine.getState(req.params.id);
      res.json({ terminated: true, state });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
