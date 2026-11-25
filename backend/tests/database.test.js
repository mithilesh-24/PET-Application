import Database from 'better-sqlite3';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { backupDatabase, openDatabase, runMigrations } from '../database/database.js';
import { createRepositories } from '../database/repositories.js';

const openDbs = [];
const tempDirs = [];

async function makeTempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-prep-m3-'));
  tempDirs.push(dir);
  return dir;
}

function trackDb(db) {
  openDbs.push(db);
  return db;
}

afterEach(async () => {
  while (openDbs.length > 0) {
    const db = openDbs.pop();
    try {
      db.close();
    } catch {
      // Ignore already closed
    }
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function runSharedRepoSuite(makeDb) {
  it('runs migrations idempotently with foreign_keys ON', async () => {
    const db = trackDb(await makeDb());
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);

    runMigrations(db);
    runMigrations(db);

    const migrations = db.prepare('SELECT * FROM migrations').all();
    expect(migrations).toHaveLength(1);
    expect(migrations[0].version).toBe(1);
  });

  it('supports all 8 repositories and cascades deletes from attempt to child tables', async () => {
    const db = trackDb(await makeDb());
    const repos = createRepositories(db);

    repos.settingsRepo.set('violation_limit', '5');
    expect(repos.settingsRepo.get('violation_limit')).toBe('5');
    expect(repos.settingsRepo.getAll()).toEqual({ violation_limit: '5' });

    const paper = repos.papersRepo.create({
      paper_id: 'PET-20261125-DB01',
      title: 'Sample DB Paper',
      file_path: 'question-banks/encrypted/PET-20261125-DB01.pet',
      key_id: 'k-1',
      sha256: 'abc123',
      question_count: 67,
      total_marks: 100,
    });
    expect(paper.paper_id).toBe('PET-20261125-DB01');

    const attempt = repos.attemptsRepo.create({
      paper_id: paper.id,
      status: 'running',
      started_at: 1000,
      violation_limit: 3,
      current_section: 'S1',
      current_index: 0,
    });
    expect(attempt.status).toBe('running');

    const sections = repos.sectionStateRepo.getByAttempt(attempt.id);
    expect(sections.map((s) => [s.section, s.status])).toEqual([
      ['S1', 'locked'],
      ['S2', 'locked'],
      ['S2A', 'locked'],
    ]);

    repos.sectionStateRepo.updateSection(attempt.id, 'S1', {
      status: 'open',
      started_at: 1000,
      deadline_at: 3001000,
    });
    expect(repos.sectionStateRepo.getSection(attempt.id, 'S1').status).toBe('open');

    repos.responsesRepo.upsert({
      attempt_id: attempt.id,
      question_id: 'S1-APT-01',
      section: 'S1',
      selected_index: 2,
      time_spent_ms: 15000,
      saved_at: 2000,
    });
    expect(repos.responsesRepo.getForQuestion(attempt.id, 'S1-APT-01').selected_index).toBe(2);

    const draft = repos.codingRepo.saveDraft({
      attempt_id: attempt.id,
      question_id: 'S2A-01',
      language: 'python',
      source: 'print(1)',
      saved_at: 3000,
    });
    expect(draft.is_final).toBe(0);

    const firstSub = repos.codingRepo.createSubmissionWithResults({
      submission: {
        attempt_id: attempt.id,
        question_id: 'S2A-01',
        language: 'python',
        source: 'print(2)',
        submitted_at: 4000,
      },
      testResults: [
        {
          test_id: 'T1',
          passed: true,
          status: 'pass',
          runtime_ms: 12,
          memory_kb: 1024,
          marks_awarded: 5,
        },
        {
          test_id: 'T2',
          passed: false,
          status: 'fail',
          runtime_ms: 14,
          memory_kb: 1024,
          marks_awarded: 0,
        },
      ],
    });
    expect(firstSub.submission.is_final).toBe(1);
    expect(firstSub.testResults).toHaveLength(2);

    const secondSub = repos.codingRepo.createSubmissionWithResults({
      submission: {
        attempt_id: attempt.id,
        question_id: 'S2A-01',
        language: 'python',
        source: 'print(42)',
        submitted_at: 5000,
      },
      testResults: [
        {
          test_id: 'T1',
          passed: true,
          status: 'pass',
          runtime_ms: 10,
          memory_kb: 1024,
          marks_awarded: 10,
        },
      ],
    });
    expect(repos.codingRepo.getFinalSubmissions(attempt.id)).toHaveLength(1);
    expect(repos.codingRepo.getFinalSubmissionForQuestion(attempt.id, 'S2A-01').id).toBe(
      secondSub.submission.id
    );

    repos.violationsRepo.record({
      attempt_id: attempt.id,
      type: 'tab_hidden',
      at: 6000,
      section: 'S1',
      question_id: 'S1-APT-01',
    });
    expect(repos.violationsRepo.countForAttempt(attempt.id)).toBe(1);

    repos.resultsRepo.upsert({
      attempt_id: attempt.id,
      total: 85,
      section1: 35,
      section2: 35,
      section2a: 15,
      breakdown_json: { aptitude: 14 },
      computed_at: 7000,
    });
    expect(repos.resultsRepo.getByAttemptId(attempt.id).total).toBe(85);

    expect(repos.attemptsRepo.deleteById(attempt.id)).toBe(true);
    expect(repos.sectionStateRepo.getByAttempt(attempt.id)).toHaveLength(0);
    expect(repos.responsesRepo.getForAttempt(attempt.id)).toHaveLength(0);
    expect(repos.codingRepo.getFinalSubmissions(attempt.id)).toHaveLength(0);
    expect(repos.codingRepo.getTestResults(secondSub.submission.id)).toHaveLength(0);
    expect(repos.violationsRepo.listForAttempt(attempt.id)).toHaveLength(0);
    expect(repos.resultsRepo.getByAttemptId(attempt.id)).toBeNull();
    expect(repos.papersRepo.getById(paper.id)).not.toBeNull();
  });

  it('rolls back multi-step transaction on failure (e.g. invalid test result status)', async () => {
    const db = trackDb(await makeDb());
    const repos = createRepositories(db);
    const paper = repos.papersRepo.create({
      paper_id: 'PET-TX-01',
      title: 'TX Paper',
      file_path: 'x.pet',
      key_id: 'k',
      sha256: 's',
      question_count: 67,
      total_marks: 100,
    });
    const attempt = repos.attemptsRepo.create({ paper_id: paper.id });

    expect(() =>
      repos.codingRepo.createSubmissionWithResults({
        submission: {
          attempt_id: attempt.id,
          question_id: 'S2A-01',
          language: 'python',
          source: 'print(1)',
        },
        testResults: [
          { test_id: 'T1', passed: true, status: 'pass', marks_awarded: 5 },
          { test_id: 'T2', passed: false, status: 'BOGUS_STATUS', marks_awarded: 0 },
        ],
      })
    ).toThrow();

    expect(repos.codingRepo.getFinalSubmissions(attempt.id)).toHaveLength(0);
    const count = db.prepare('SELECT COUNT(*) AS c FROM coding_test_results').get().c;
    expect(count).toBe(0);
  });
}

describe('M3 SQLite database (:memory:)', () => {
  runSharedRepoSuite(async () => openDatabase({ memory: true }));
});

describe('M3 SQLite database (temp file + WAL + backup)', () => {
  runSharedRepoSuite(async () => {
    const dir = await makeTempDir();
    return openDatabase({ dbPath: path.join(dir, 'pet-history.db') });
  });

  it('uses WAL mode on file DB and creates online backup with identical row counts (keeping latest 10)', async () => {
    const dir = await makeTempDir();
    const db = trackDb(openDatabase({ dbPath: path.join(dir, 'pet-history.db') }));
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');

    const repos = createRepositories(db);
    repos.settingsRepo.set('theme', 'academic');
    repos.papersRepo.create({
      paper_id: 'PET-BK-01',
      title: 'Backup Test Paper',
      file_path: 'bk.pet',
      key_id: 'k1',
      sha256: 'hash1',
      question_count: 67,
      total_marks: 100,
    });

    const backupDir = path.join(dir, 'backups');
    let latestBackup = null;
    for (let i = 0; i < 12; i += 1) {
      latestBackup = await backupDatabase(db, { backupDir, maxBackups: 10 });
    }

    const files = await fs.readdir(backupDir);
    expect(files.filter((f) => f.endsWith('.db'))).toHaveLength(10);

    const restored = trackDb(new Database(latestBackup, { readonly: true }));
    expect(restored.prepare('SELECT COUNT(*) AS c FROM settings').get().c).toBe(1);
    expect(restored.prepare('SELECT COUNT(*) AS c FROM papers').get().c).toBe(1);
    expect(restored.prepare('SELECT paper_id FROM papers').get().paper_id).toBe('PET-BK-01');
  });
});
