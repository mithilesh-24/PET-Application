import fs from 'node:fs/promises';
import multer from 'multer';
import { Router } from 'express';
import { AppError } from '../middleware/errorHandler.js';
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
    const row = papersRepo.getById(req.params.id) || papersRepo.getByPaperId(req.params.id);
    if (!row) {
      return next(new AppError(404, 'NOT_FOUND', `Paper "${req.params.id}" not found.`));
    }
    return res.json({ paper: sanitizePaperMeta(row) });
  });

  router.delete('/papers/:id', async (req, res, next) => {
    try {
      const row = papersRepo.getById(req.params.id) || papersRepo.getByPaperId(req.params.id);
      if (!row) {
        return next(new AppError(404, 'NOT_FOUND', `Paper "${req.params.id}" not found.`));
      }
      papersRepo.deleteById(row.id);
      if (row.file_path) {
        await fs.unlink(row.file_path).catch(() => {});
      }
      return res.json({ deleted: true, id: row.id, paperId: row.paper_id });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
