import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import { openDatabase, backupDatabase } from './database/database.js';
import { createRepositories } from './database/repositories.js';
import { defaultKeyStore } from './services/keyStore.js';
import { verifyCodingTests } from './services/codingVerifier.js';
import { createExamEngine } from './services/examEngine.js';
import { createJudgeService } from './services/judgeService.js';
import { createEvaluationService } from './services/evaluationService.js';
import { createResultService } from './services/resultService.js';
import { createHistoryService } from './services/historyService.js';
import healthRoutes from './routes/healthRoutes.js';
import compilerRoutes from './routes/compilerRoutes.js';
import { createSettingsRoutes } from './routes/settingsRoutes.js';
import { createPaperRoutes } from './routes/paperRoutes.js';
import { createExamRoutes } from './routes/examRoutes.js';
import { createResultRoutes } from './routes/resultRoutes.js';
import { createHistoryRoutes } from './routes/historyRoutes.js';
import { cleanupStaleSandbox } from './compiler/dockerRunner.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp({
  db,
  keyStore = defaultKeyStore,
  encryptedPapersDir = config.paths.encryptedPapersDir,
  codingVerifier = verifyCodingTests,
  nowFn = () => Date.now(),
  sectionDurationMs,
  transitionGraceMs,
  onAttemptCompleted,
  enableReconcileInterval = false,
  registerExtraRoutes,
} = {}) {
  const database = db || openDatabase({ dataDir: config.dataDir });
  const repos = createRepositories(database);

  let evaluationService;

  const examEngine = createExamEngine({
    db: database,
    repos,
    keyStore,
    nowFn,
    sectionDurationMs,
    transitionGraceMs,
    onAttemptCompleted: async (attemptId) => {
      if (evaluationService) {
        await evaluationService.evaluateAttempt(attemptId).catch(() => {});
      }
      if (typeof onAttemptCompleted === 'function') {
        await Promise.resolve(onAttemptCompleted(attemptId));
      } else if (config.nodeEnv !== 'test') {
        await backupDatabase(database).catch(() => {});
      }
    },
  });

  evaluationService = createEvaluationService({ repos, examEngine, nowFn });
  const resultService = createResultService({ repos, examEngine, evaluationService });
  const historyService = createHistoryService({ repos, resultService, nowFn });

  const judgeService = createJudgeService({
    repos,
    examEngine,
    nowFn,
  });
  examEngine.setS2AExpiryHandler((attemptId) =>
    judgeService.autoSubmitUnsubmittedDrafts(attemptId)
  );

  const app = express();
  app.locals.db = database;
  app.locals.repos = repos;
  app.locals.examEngine = examEngine;
  app.locals.judgeService = judgeService;
  app.locals.evaluationService = evaluationService;
  app.locals.resultService = resultService;
  app.locals.historyService = historyService;

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // Allow non-browser clients (no Origin header) and the configured Vite origin only.
        if (!origin || origin === config.corsOrigin) {
          return callback(null, true);
        }
        return callback(null, false);
      },
    })
  );

  if (config.nodeEnv !== 'test') {
    app.use(morgan('dev'));
  }

  app.use(express.json({ limit: config.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.jsonBodyLimit }));

  app.use('/api', healthRoutes);
  app.use('/api', compilerRoutes);
  app.use('/api', createSettingsRoutes({ settingsRepo: repos.settingsRepo }));
  app.use(
    '/api',
    createPaperRoutes({
      papersRepo: repos.papersRepo,
      keyStore,
      encryptedPapersDir,
      codingVerifier,
    })
  );
  app.use('/api', createExamRoutes({ examEngine, judgeService }));
  app.use('/api', createResultRoutes({ resultService }));
  app.use('/api', createHistoryRoutes({ historyService }));

  if (typeof registerExtraRoutes === 'function') {
    registerExtraRoutes(app);
  }

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  if (enableReconcileInterval) {
    const timer = setInterval(() => {
      try {
        examEngine.reconcileAllOpenAttempts();
      } catch (err) {
        console.error('[examEngine] reconcile interval error:', err);
      }
    }, 5000);
    timer.unref();
    app.locals.reconcileTimer = timer;
  }

  return app;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  cleanupStaleSandbox().catch(() => {});
  const db = openDatabase({ dataDir: config.dataDir });
  backupDatabase(db).catch((err) => {
    console.warn('[backup] Startup database backup skipped:', err.message);
  });
  const app = createApp({ db, enableReconcileInterval: true });
  app.listen(config.port, () => {
    console.log(`PET Prep backend listening on http://localhost:${config.port}`);
  });
}
