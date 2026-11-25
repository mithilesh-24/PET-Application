import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
import { loadExecutionConfig } from './compiler/executionConfig.js';
import { cleanupStaleWorkspaces, createExecutionEngine } from './compiler/executionEngine.js';
import { detectCompilers } from './compiler/compilerDetector.js';
import { createHealthRoutes } from './routes/healthRoutes.js';
import { createCompilerRoutes } from './routes/compilerRoutes.js';
import { createSettingsRoutes } from './routes/settingsRoutes.js';
import { createPaperRoutes } from './routes/paperRoutes.js';
import { createExamRoutes } from './routes/examRoutes.js';
import { createResultRoutes } from './routes/resultRoutes.js';
import { createHistoryRoutes } from './routes/historyRoutes.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultFrontendDistDir = path.resolve(__dirname, '..', 'frontend', 'dist');

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
  codeRateLimitMax = 60,
  codeRateLimitWindowMs = 60 * 1000,
  rebuildRunner,
  detectCompilersFn = detectCompilers,
  execConfig = loadExecutionConfig(),
  serveFrontend = config.nodeEnv !== 'test',
  frontendDistDir = defaultFrontendDistDir,
} = {}) {
  if (execConfig.allowInsecureExecution) {
    console.warn(
      '========================================================================\n' +
        '[WARNING] PET_ALLOW_INSECURE_EXECUTION=true AT STARTUP!\n' +
        'Student code runs WITHOUT OS sandbox isolation when sandbox is missing.\n' +
        'NEVER enable this flag during real exams.\n' +
        '========================================================================'
    );
  }

  const executionEngine = createExecutionEngine({ execConfig });
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
    runSubmissionFn: executionEngine.runSubmission,
    runSubmissionBatchFn: executionEngine.runSubmissionBatch,
    nowFn,
  });
  examEngine.setS2AExpiryHandler((attemptId) =>
    judgeService.autoSubmitUnsubmittedDrafts(attemptId)
  );

  const verifierFn =
    codingVerifier === verifyCodingTests
      ? (paper) =>
          verifyCodingTests(paper, {
            runSubmissionFn: executionEngine.runSubmission,
            runSubmissionBatchFn: executionEngine.runSubmissionBatch,
          })
      : codingVerifier;

  let cachedDiagnosticsPromise = detectCompilersFn(process.platform, execConfig);
  const getDiagnostics = () => cachedDiagnosticsPromise;

  const app = express();
  app.locals.db = database;
  app.locals.repos = repos;
  app.locals.examEngine = examEngine;
  app.locals.judgeService = judgeService;
  app.locals.executionEngine = executionEngine;
  app.locals.evaluationService = evaluationService;
  app.locals.resultService = resultService;
  app.locals.historyService = historyService;
  app.locals.getDiagnostics = getDiagnostics;

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'blob:'],
          workerSrc: ["'self'", 'blob:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          fontSrc: ["'self'", 'data:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'self'"],
        },
      },
    })
  );
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

  const codeRateLimiter = createRateLimiter({
    windowMs: codeRateLimitWindowMs,
    maxRequests: codeRateLimitMax,
    nowFn,
  });
  app.use('/api/attempts/:id/code', codeRateLimiter);

  app.use('/api', createHealthRoutes({ getDiagnostics }));
  app.use(
    '/api',
    createCompilerRoutes({
      getDiagnostics: () => detectCompilersFn(process.platform, execConfig),
    })
  );
  app.use(
    '/api',
    createSettingsRoutes({
      settingsRepo: repos.settingsRepo,
      db: database,
      rebuildRunner,
      detectCompilersFn: () => detectCompilersFn(process.platform, execConfig),
    })
  );
  app.use(
    '/api',
    createPaperRoutes({
      papersRepo: repos.papersRepo,
      keyStore,
      encryptedPapersDir,
      codingVerifier: verifierFn,
    })
  );
  app.use('/api', createExamRoutes({ examEngine, judgeService }));
  app.use('/api', createResultRoutes({ resultService }));
  app.use('/api', createHistoryRoutes({ historyService }));

  if (typeof registerExtraRoutes === 'function') {
    registerExtraRoutes(app);
  }

  app.use('/api', notFoundHandler);

  const distIndexPath = path.join(frontendDistDir, 'index.html');
  if (serveFrontend && existsSync(distIndexPath)) {
    app.use(express.static(frontendDistDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      return res.sendFile(distIndexPath);
    });
  }

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
    executionEngine.startWorkspaceSweeper();
  }

  return app;
}

export async function shutdownServer({
  server,
  app,
  db,
  cleanupFn = () => cleanupStaleWorkspaces(),
}) {
  if (app?.locals?.reconcileTimer) {
    clearInterval(app.locals.reconcileTimer);
  }
  if (app?.locals?.executionEngine) {
    app.locals.executionEngine.stopWorkspaceSweeper();
  }
  if (server && server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }
  await cleanupFn().catch(() => {});
  if (db) {
    try {
      db.close();
    } catch {
      // Ignore already-closed DB
    }
  }
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const execCfg = loadExecutionConfig();
  cleanupStaleWorkspaces(execCfg.workspaceBaseDir).catch(() => {});
  const db = openDatabase({ dataDir: config.dataDir });
  backupDatabase(db).catch((err) => {
    console.warn('[backup] Startup database backup skipped:', err.message);
  });
  const app = createApp({ db, execConfig: execCfg, enableReconcileInterval: true });
  app.locals
    .getDiagnostics()
    .then((diag) => {
      if (!diag.ready) {
        console.warn(
          `[startup] Execution sandbox readiness: ${diag.sandboxStatus} (${diag.sandboxDetails})`
        );
      }
    })
    .catch(() => {});

  const server = app.listen(config.port, () => {
    console.log(`PET Prep backend listening on http://localhost:${config.port}`);
  });

  let shuttingDown = false;
  const handleSignal = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nReceived ${signal}; cleaning up temp workspaces and closing database...`);
    await shutdownServer({ server, app, db });
    process.exit(0);
  };

  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));
}
