import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { pathToFileURL } from 'node:url';
import { config } from './config.js';
import healthRoutes from './routes/healthRoutes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

export function createApp({ registerExtraRoutes } = {}) {
  const app = express();

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

  if (typeof registerExtraRoutes === 'function') {
    registerExtraRoutes(app);
  }

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}

const isMainModule = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`PET Prep backend listening on http://localhost:${config.port}`);
  });
}
