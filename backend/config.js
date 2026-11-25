import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function readPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
    return pkg.version || '0.1.0';
  } catch {
    return '0.1.0';
  }
}

function parsePositiveInt(rawValue, fallback) {
  if (rawValue === undefined || rawValue === '') return fallback;
  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env = process.env) {
  const dataDir = env.DATA_DIR ? path.resolve(env.DATA_DIR) : repoRoot;

  return {
    version: readPackageVersion(),
    nodeEnv: env.NODE_ENV || 'development',
    port: parsePositiveInt(env.PORT, 4000),
    dataDir,
    violationLimit: parsePositiveInt(env.VIOLATION_LIMIT, 3),
    corsOrigin: env.CORS_ORIGIN || 'http://localhost:5173',
    jsonBodyLimit: '2mb',
    multipartLimitBytes: 25 * 1024 * 1024,
    paths: {
      databaseDir: path.join(dataDir, 'database'),
      encryptedPapersDir: path.join(dataDir, 'question-banks', 'encrypted'),
      resultsDir: path.join(dataDir, 'results'),
      tempExecDir: path.join(dataDir, 'execution', 'temporary'),
    },
  };
}

export const config = loadConfig();
