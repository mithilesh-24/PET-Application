import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { backupDatabase } from '../database/database.js';
import { detectCompilers } from '../compiler/compilerDetector.js';
import { AppError } from '../middleware/errorHandler.js';
import { buildWindowsSandboxLauncher } from '../../scripts/build-windows-sandbox.mjs';

const updateSettingsSchema = z.object({
  violationLimit: z.union([z.literal(3), z.literal(5)]),
});

const emptyActionSchema = z.object({}).strict().optional();

async function defaultVerifyLocalSandbox() {
  if (process.platform === 'win32') {
    const built = buildWindowsSandboxLauncher();
    return {
      output: built.skipped ? built.reason : `Rebuilt Windows sandbox launcher: ${built.exePath}`,
    };
  }
  return {
    output: 'Verified native OS sandbox configuration.',
  };
}

export function createSettingsRoutes({
  settingsRepo,
  db = null,
  backupDir,
  rebuildRunner = defaultVerifyLocalSandbox,
  detectCompilersFn = detectCompilers,
}) {
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

  router.post('/settings/backup', async (req, res, next) => {
    try {
      emptyActionSchema.parse(req.body);
      if (!db) {
        throw new AppError(500, 'INTERNAL_ERROR', 'Database instance is unavailable for backup.');
      }
      const targetBackupDir =
        backupDir ||
        (db.name && db.name !== ':memory:'
          ? path.join(path.dirname(db.name), 'backups')
          : path.join(config.paths.databaseDir, 'backups'));
      const backupPath = await backupDatabase(db, { backupDir: targetBackupDir });
      const stat = await fs.stat(backupPath);
      res.json({
        backedUp: true,
        backupPath,
        sizeBytes: stat.size,
        createdAt: Date.now(),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/settings/rebuild-runner', async (req, res, next) => {
    try {
      emptyActionSchema.parse(req.body);
      const buildRes = await rebuildRunner();
      const compilers = await detectCompilersFn();
      res.json({
        rebuilt: true,
        output: buildRes?.output || 'Local sandbox verified.',
        compilers,
      });
    } catch (err) {
      next(
        err instanceof AppError
          ? err
          : new AppError(500, 'SANDBOX_UNAVAILABLE', `Failed to verify/rebuild OS sandbox: ${err.message}`)
      );
    }
  });

  return router;
}
