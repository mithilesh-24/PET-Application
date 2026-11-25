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
import healthRoutes from './routes/healthRoutes.js';
import compilerRoutes from './routes/compilerRoutes.js';
import { createPaperRoutes } from './routes/paperRoutes.js';
import { createAttemptRoutes } from './routes/attemptRoutes.js';
import { cleanupStaleSandbox } from './compiler/dockerRunner.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp({
  db,
  keyStore = defaultKeyStore,
  encryptedPapersDir = config.paths.encryptedPapersDir,
  codingVerifier = verifyCodingTests,
  registerExtraRoutes,
} = {}) {
  const database = db || openDatabase({ dataDir: config.dataDir });
  const repos = createRepositories(database);

  const app = express();
  app.locals.db = database;
  app.locals.repos = repos;

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
  app.use(
    '/api',
    createPaperRoutes({
      papersRepo: repos.papersRepo,
      keyStore,
      encryptedPapersDir,
      codingVerifier,
    })
  );
  app.use(
    '/api',
    createAttemptRoutes({
      papersRepo: repos.papersRepo,
      attemptsRepo: repos.attemptsRepo,
    })
  );

  if (typeof registerExtraRoutes === 'function') {
    registerExtraRoutes(app);
  }

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  cleanupStaleSandbox().catch(() => {});
  const db = openDatabase({ dataDir: config.dataDir });
  backupDatabase(db).catch((err) => {
    console.warn('[backup] Startup database backup skipped:', err.message);
  });
  const app = createApp({ db });
  app.listen(config.port, () => {
    console.log(`PET Prep backend listening on http://localhost:${config.port}`);
  });
}
