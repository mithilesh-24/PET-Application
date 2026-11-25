import fs from 'node:fs/promises';
import multer from 'multer';
import { Router } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import { assertPathInsideDir, parseSafeIdParam } from '../schemas/routeParams.js';
import { importPaperFiles, sanitizePaperMeta } from '../services/paperImportService.js';

const paperUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 3,
  },
});

export function createPaperRoutes({ papersRepo, keyStore, encryptedPapersDir, codingVerifier }) {
  const router = Router();

  router.post('/papers/import', paperUpload.array('files', 3), async (req, res, next) => {
    try {
      const files = req.files || [];
      const result = await importPaperFiles({
        files,
        papersRepo,
        keyStore,
        encryptedPapersDir,
        codingVerifier,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/papers', (_req, res) => {
    const rows = papersRepo.listAll();
    res.json({
      papers: rows.map(sanitizePaperMeta),
    });
  });

  router.get('/papers/:id', (req, res, next) => {
    try {
      const safeId = parseSafeIdParam(req.params.id);
      const row = papersRepo.getById(safeId) || papersRepo.getByPaperId(safeId);
      if (!row) {
        return next(new AppError(404, 'NOT_FOUND', `Paper "${safeId}" not found.`));
      }
      return res.json({ paper: sanitizePaperMeta(row) });
    } catch (err) {
      return next(err);
    }
  });

  router.delete('/papers/:id', async (req, res, next) => {
    try {
      const safeId = parseSafeIdParam(req.params.id);
      const row = papersRepo.getById(safeId) || papersRepo.getByPaperId(safeId);
      if (!row) {
        return next(new AppError(404, 'NOT_FOUND', `Paper "${safeId}" not found.`));
      }
      if (row.file_path) {
        const safePath = assertPathInsideDir(encryptedPapersDir, row.file_path);
        await fs.unlink(safePath).catch(() => {});
      }
      papersRepo.deleteById(row.id);
      return res.json({ deleted: true, id: row.id, paperId: row.paper_id });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
