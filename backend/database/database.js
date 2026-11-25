import Database from 'better-sqlite3';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL_PATH = path.join(__dirname, 'schema.sql');

const MIGRATIONS = [
  {
    version: 1,
    name: 'initial_contract_c_schema',
    apply(db) {
      const schemaSql = fs.readFileSync(SCHEMA_SQL_PATH, 'utf8');
      db.exec(schemaSql);
    },
  },
];

export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  const appliedRows = db.prepare('SELECT version FROM migrations').all();
  const applied = new Set(appliedRows.map((row) => row.version));
  const insertMigration = db.prepare(
    'INSERT INTO migrations (version, name, applied_at) VALUES (?, ?, ?)'
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    const runOne = db.transaction(() => {
      migration.apply(db);
      insertMigration.run(migration.version, migration.name, Date.now());
    });
    runOne();
  }
}

export function openDatabase({
  dbPath,
  memory = false,
  dataDir = config.dataDir,
  runInitialMigrations = true,
} = {}) {
  const isMemory = memory || dbPath === ':memory:';
  const target = isMemory ? ':memory:' : dbPath || path.join(dataDir, 'database', 'pet-history.db');

  if (!isMemory) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
  }

  const db = new Database(target);
  if (!isMemory) {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');

  if (runInitialMigrations) {
    runMigrations(db);
  }

  return db;
}

export async function backupDatabase(
  db,
  { backupDir = path.join(config.paths.databaseDir, 'backups'), maxBackups = 10 } = {}
) {
  if (!db) return null;
  await fsp.mkdir(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const uniqueSuffix = Math.random().toString(36).slice(2, 6);
  const backupFile = path.join(backupDir, `pet-history-${stamp}-${uniqueSuffix}.db`);

  await db.backup(backupFile);

  const entries = (await fsp.readdir(backupDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.db'))
    .map((entry) => entry.name)
    .sort()
    .reverse();

  const stale = entries.slice(maxBackups);
  await Promise.all(stale.map((name) => fsp.unlink(path.join(backupDir, name)).catch(() => {})));

  return backupFile;
}
