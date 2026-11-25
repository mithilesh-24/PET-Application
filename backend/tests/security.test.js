import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, shutdownServer } from '../server.js';
import { openDatabase } from '../database/database.js';
import { createKeyStore } from '../services/keyStore.js';
import { createValidFullPaper } from './fixtures/paperFixtures.js';
import { verifyFrontendBundle } from '../../scripts/check-bundle.mjs';

const tempDirs = [];
const openDbs = [];

async function setupSecurityHarness({ codeRateLimitMax = 60, rebuildRunner } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-prep-m12-'));
  tempDirs.push(dir);
  const encryptedPapersDir = path.join(dir, 'encrypted');
  const keyDir = path.join(dir, 'keys');
  const dbPath = path.join(dir, 'security.db');

  let fakeNow = 1_700_000_000_000;
  const db = openDatabase({ dbPath });
  openDbs.push(db);
  const keyStore = createKeyStore({ keyDir, keytar: null });

  const app = createApp({
    db,
    keyStore,
    encryptedPapersDir,
    codingVerifier: async (paper) => ({ ok: true, resolvedPaper: paper, failures: [], warnings: [] }),
    nowFn: () => fakeNow,
    codeRateLimitMax,
    rebuildRunner,
    detectCompilersFn: async () => ({
      platform: 'win32',
      ready: true,
      sandboxReady: true,
      tools: [],
    }),
  });

  return {
    dir,
    dbPath,
    db,
    keyDir,
    encryptedPapersDir,
    app,
    advanceTime: (ms) => {
      fakeNow += ms;
      return fakeNow;
    },
  };
}

afterEach(async () => {
  while (openDbs.length > 0) {
    const db = openDbs.pop();
    try {
      db.close();
    } catch {
      // Ignore
    }
  }
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe('M12 hardening, security, reliability, and settings', () => {
  it('sets helmet CSP allowing Monaco blob workers while blocking traversal and invalid params', async () => {
    const h = await setupSecurityHarness();

    const health = await request(h.app).get('/api/health');
    expect(health.status).toBe(200);
    const csp = health.headers['content-security-policy'];
    expect(csp).toContain("script-src 'self' blob:");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("object-src 'none'");

    // Path traversal checks across papers, attempts, results, history
    const badIds = ['..%2F..%2Fetc%2Fpasswd', 'foo..bar', 'abc/def', 'abc\\def'];
    for (const bad of badIds) {
      const pGet = await request(h.app).get(`/api/papers/${bad}`);
      expect([400, 404]).toContain(pGet.status);

      const pDel = await request(h.app).delete(`/api/papers/${bad}`);
      expect([400, 404]).toContain(pDel.status);

      const aState = await request(h.app).get(`/api/attempts/${bad}/state`);
      expect([400, 404]).toContain(aState.status);

      const rGet = await request(h.app).get(`/api/attempts/${bad}/result`);
      expect([400, 404]).toContain(rGet.status);

      const eGet = await request(h.app).get(`/api/attempts/${bad}/export?format=json`);
      expect([400, 404]).toContain(eGet.status);
    }

    // Explicit Zod check on param with '..' not containing slashes
    const dotDot = await request(h.app).get('/api/attempts/a..b/state');
    expect(dotDot.status).toBe(400);
    expect(dotDot.body.error.code).toBe('VALIDATION_FAILED');

    // PaperId containing path traversal must be rejected on import
    const badPaper = createValidFullPaper({ paperId: '../escape' });
    const badImport = await request(h.app)
      .post('/api/papers/import')
      .attach('files', Buffer.from(JSON.stringify(badPaper), 'utf8'), 'bad.petdraft');
    expect(badImport.status).toBe(400);
    expect(badImport.body.error.code).toBe('PAPER_INVALID');

    // Malformed / invalid Zod bodies rejected everywhere
    const badSettings = await request(h.app).post('/api/settings').send({ violationLimit: 99 });
    expect(badSettings.status).toBe(400);
    expect(badSettings.body.error.code).toBe('VALIDATION_FAILED');

    const badBackupBody = await request(h.app)
      .post('/api/settings/backup')
      .send({ extraField: true });
    expect(badBackupBody.status).toBe(400);
    expect(badBackupBody.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('enforces HTTP rate limits on /api/attempts/:id/code/* endpoints', async () => {
    const h = await setupSecurityHarness({ codeRateLimitMax: 2 });
    const paper = createValidFullPaper();
    const imp = await request(h.app)
      .post('/api/papers/import')
      .attach('files', Buffer.from(JSON.stringify(paper), 'utf8'), 'p.petdraft');
    const att = await request(h.app)
      .post('/api/attempts')
      .send({ paperId: imp.body.paper.id, violationLimit: 3 });
    const attemptId = att.body.attempt.id;

    await request(h.app).post(`/api/attempts/${attemptId}/start-section`).send({ section: 'S1' });
    await request(h.app).post(`/api/attempts/${attemptId}/submit-section`).send({});
    await request(h.app).post(`/api/attempts/${attemptId}/start-section`).send({ section: 'S2' });
    await request(h.app).post(`/api/attempts/${attemptId}/submit-section`).send({});
    await request(h.app).post(`/api/attempts/${attemptId}/start-section`).send({ section: 'S2A' });

    const r1 = await request(h.app).post(`/api/attempts/${attemptId}/code/draft`).send({
      questionId: 'S2A-01',
      language: 'python',
      source: 'print(1)\n',
    });
    expect(r1.status).toBe(200);

    const r2 = await request(h.app).post(`/api/attempts/${attemptId}/code/draft`).send({
      questionId: 'S2A-01',
      language: 'python',
      source: 'print(2)\n',
    });
    expect(r2.status).toBe(200);

    const r3 = await request(h.app).post(`/api/attempts/${attemptId}/code/draft`).send({
      questionId: 'S2A-01',
      language: 'python',
      source: 'print(3)\n',
    });
    expect(r3.status).toBe(429);
    expect(r3.body.error.code).toBe('RATE_LIMITED');
  });

  it('never leaks answer keys, hidden tests, reference solutions, explanations, or keys during a full attempt', async () => {
    const h = await setupSecurityHarness();
    const paper = createValidFullPaper();

    // Plant unique traceable sentinels in hidden tests, reference solution, and explanations
    const SENTINEL_HIDDEN_IN = 'SENTINEL_HIDDEN_INPUT_987654';
    const SENTINEL_HIDDEN_OUT = 'SENTINEL_HIDDEN_OUTPUT_123456';
    const SENTINEL_REF = 'SENTINEL_REFERENCE_SOL_SECRET_CODE';
    const SENTINEL_EXPLANATION = 'SENTINEL_PRIVATE_EXPLANATION_TOKEN';

    paper.section1.questions[0].explanation = SENTINEL_EXPLANATION;
    paper.section2.snippets[0].explanation = SENTINEL_EXPLANATION;
    paper.section2a.questions[0].tests[0].input = SENTINEL_HIDDEN_IN;
    paper.section2a.questions[0].tests[0].expectedOutput = SENTINEL_HIDDEN_OUT;
    paper.section2a.questions[0].referenceSolution.code = `# ${SENTINEL_REF}\nprint(0)`;
    paper.section2a.questions[0].explanation = SENTINEL_EXPLANATION;

    const capturedPayloads = [];
    const record = (res) => {
      capturedPayloads.push(JSON.stringify(res.body));
      return res;
    };

    const impRes = record(
      await request(h.app)
        .post('/api/papers/import')
        .attach('files', Buffer.from(JSON.stringify(paper), 'utf8'), 'secret-check.petdraft')
    );
    expect(impRes.status).toBe(201);
    const paperDbId = impRes.body.paper.id;

    record(await request(h.app).get('/api/papers'));
    record(await request(h.app).get(`/api/papers/${paperDbId}`));

    const attRes = record(
      await request(h.app)
        .post('/api/attempts')
        .send({ paperId: paperDbId, violationLimit: 3 })
    );
    const attemptId = attRes.body.attempt.id;

    // Step through S1 (40 Qs)
    record(
      await request(h.app).post(`/api/attempts/${attemptId}/start-section`).send({ section: 'S1' })
    );
    for (let i = 0; i < 40; i += 1) {
      const q = record(await request(h.app).get(`/api/attempts/${attemptId}/question`));
      record(
        await request(h.app)
          .post(`/api/attempts/${attemptId}/answer`)
          .send({ questionId: q.body.question.id, selectedIndex: 0, timeSpentMs: 100 })
      );
      if (i < 39) {
        record(await request(h.app).post(`/api/attempts/${attemptId}/next`).send({}));
      }
    }
    record(await request(h.app).post(`/api/attempts/${attemptId}/submit-section`).send({}));

    // Blocked while not ended
    record(await request(h.app).get(`/api/attempts/${attemptId}/result`));
    record(await request(h.app).get(`/api/attempts/${attemptId}/review`));
    record(await request(h.app).get(`/api/attempts/${attemptId}/export?format=json`));

    // Step through S2 (25 Qs)
    record(
      await request(h.app).post(`/api/attempts/${attemptId}/start-section`).send({ section: 'S2' })
    );
    for (let i = 0; i < 25; i += 1) {
      const q = record(await request(h.app).get(`/api/attempts/${attemptId}/question`));
      record(
        await request(h.app)
          .post(`/api/attempts/${attemptId}/answer`)
          .send({ questionId: q.body.question.id, selectedIndex: 1, timeSpentMs: 100 })
      );
      if (i < 24) {
        record(await request(h.app).post(`/api/attempts/${attemptId}/next`).send({}));
      }
    }
    record(await request(h.app).post(`/api/attempts/${attemptId}/submit-section`).send({}));

    // Step through S2A (2 Qs)
    record(
      await request(h.app).post(`/api/attempts/${attemptId}/start-section`).send({ section: 'S2A' })
    );
    record(await request(h.app).get(`/api/attempts/${attemptId}/question`));
    record(
      await request(h.app).post(`/api/attempts/${attemptId}/code/draft`).send({
        questionId: 'S2A-01',
        language: 'python',
        source: 'print(0)\n',
      })
    );
    record(await request(h.app).post(`/api/attempts/${attemptId}/next`).send({ unanswered: true }));
    record(await request(h.app).get(`/api/attempts/${attemptId}/question`));
    record(await request(h.app).get('/api/history'));

    // Also read active key hex to verify zero key leakage in any API response
    const keyFiles = await fs.readdir(h.keyDir);
    const keyHexes = [];
    for (const f of keyFiles) {
      if (f.endsWith('.key')) {
        keyHexes.push((await fs.readFile(path.join(h.keyDir, f), 'utf8')).trim());
      }
    }

    const joined = capturedPayloads.join('\n');
    expect(joined).not.toContain('answerIndex');
    expect(joined).not.toContain('referenceSolution');
    expect(joined).not.toContain('hiddenTests');
    expect(joined).not.toContain('inputGenerator');
    expect(joined).not.toContain(SENTINEL_HIDDEN_IN);
    expect(joined).not.toContain(SENTINEL_HIDDEN_OUT);
    expect(joined).not.toContain(SENTINEL_REF);
    expect(joined).not.toContain(SENTINEL_EXPLANATION);
    for (const keyHex of keyHexes) {
      expect(joined).not.toContain(keyHex);
    }
  });

  it('verifies backup creation, runner rebuild route, graceful shutdown cleanup, and <3s large-paper import', async () => {
    const rebuildStub = vi.fn().mockResolvedValue({ output: 'Successfully tagged pet-runner:1' });
    const h = await setupSecurityHarness({ rebuildRunner: rebuildStub });

    // Large paper import performance check (< 3 seconds excluding coding test verification)
    const paper = createValidFullPaper({ paperId: 'PET-PERF-BENCH-1' });
    const buf = Buffer.from(JSON.stringify(paper), 'utf8');
    const t0 = performance.now();
    const imp = await request(h.app)
      .post('/api/papers/import')
      .attach('files', buf, 'bench.petdraft');
    const elapsedMs = performance.now() - t0;
    expect(imp.status).toBe(201);
    expect(elapsedMs).toBeLessThan(3000);

    // Backup now endpoint + integrity check on created snapshot
    const backupRes = await request(h.app).post('/api/settings/backup').send({});
    expect(backupRes.status).toBe(200);
    expect(backupRes.body.backedUp).toBe(true);
    expect(backupRes.body.sizeBytes).toBeGreaterThan(0);

    const backupDb = new Database(backupRes.body.backupPath, { readonly: true });
    try {
      const integrity = backupDb.pragma('integrity_check', { simple: true });
      expect(integrity).toBe('ok');
      const paperCount = backupDb.prepare('SELECT COUNT(*) AS c FROM papers').get().c;
      expect(paperCount).toBe(1);
    } finally {
      backupDb.close();
    }

    // Rebuild runner endpoint
    const rebuildRes = await request(h.app).post('/api/settings/rebuild-runner').send({});
    expect(rebuildRes.status).toBe(200);
    expect(rebuildRes.body.rebuilt).toBe(true);
    expect(rebuildStub).toHaveBeenCalledTimes(1);

    // Graceful shutdown cleans containers and closes DB
    const cleanupStub = vi.fn().mockResolvedValue();
    await shutdownServer({ server: null, app: h.app, db: h.db, cleanupFn: cleanupStub });
    expect(cleanupStub).toHaveBeenCalledTimes(1);
  });

  it('scans built frontend assets for secrets and forbidden answerIndex/expectedOutput tokens outside review page', async () => {
    const assetsDir = path.resolve(process.cwd(), '..', 'frontend', 'dist', 'assets');
    let hasDist = false;
    try {
      await fs.access(assetsDir);
      hasDist = true;
    } catch {
      hasDist = false;
    }
    if (!hasDist) {
      return;
    }
    const result = await verifyFrontendBundle(assetsDir);
    expect(result.checkedFiles).toBeGreaterThan(0);
    expect(result.violations).toEqual([]);
  });
});
