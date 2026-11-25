import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server.js';
import { openDatabase } from '../database/database.js';
import { createKeyStore } from '../services/keyStore.js';
import { createValidFullPaper, splitIntoParts } from './fixtures/paperFixtures.js';

const tempDirs = [];
const openDbs = [];

async function setupHarness({
  dbPath,
  codingVerifier = async () => ({ ok: true, failures: [], warnings: [] }),
} = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-prep-m4-'));
  tempDirs.push(dir);
  const encryptedPapersDir = path.join(dir, 'encrypted');
  const keyDir = path.join(dir, 'keys');
  const resolvedDbPath = dbPath || path.join(dir, 'test.db');

  const db = openDatabase({ dbPath: resolvedDbPath });
  openDbs.push(db);
  const keyStore = createKeyStore({ keyDir, keytar: null });
  const app = createApp({ db, keyStore, encryptedPapersDir, codingVerifier });

  return { dir, db, dbPath: resolvedDbPath, keyStore, encryptedPapersDir, app };
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

describe('M4 paper import, persistence, and instructions API', () => {
  it('imports a valid full .petdraft, encrypts to disk, and remains listed across server restart', async () => {
    const { dir, db, dbPath, keyStore, encryptedPapersDir, app } = await setupHarness();
    const paper = createValidFullPaper();

    const res = await request(app)
      .post('/api/papers/import')
      .attach('files', Buffer.from(JSON.stringify(paper), 'utf8'), 'mock.petdraft');

    expect(res.status).toBe(201);
    expect(res.body.summary).toMatchObject({
      title: paper.title,
      paperId: paper.paperId,
      counts: { section1: 40, section2: 25, section2a: 2, total: 67 },
      totalMarks: 100,
      treeOrGraphSatisfied: true,
    });

    const files = await fs.readdir(encryptedPapersDir);
    expect(files).toEqual([`${paper.paperId}.pet`]);

    // Simulate server restart: close DB and open a fresh app instance on the same DB file
    db.close();
    const db2 = openDatabase({ dbPath });
    openDbs.push(db2);
    const app2 = createApp({
      db: db2,
      keyStore: createKeyStore({ keyDir: path.join(dir, 'keys'), keytar: null }),
      encryptedPapersDir,
    });

    const listRes = await request(app2).get('/api/papers');
    expect(listRes.status).toBe(200);
    expect(listRes.body.papers).toHaveLength(1);
    expect(listRes.body.papers[0].paperId).toBe(paper.paperId);
    expect(listRes.body.papers[0]).not.toHaveProperty('file_path');
    expect(listRes.body.papers[0]).not.toHaveProperty('key_id');
    expect(keyStore).toBeDefined();
  });

  it('merges 3 valid parts (A, B, C) and tolerates UTF-8 BOM and single markdown code fence', async () => {
    const { app } = await setupHarness();
    const [partA, partB, partC] = splitIntoParts(createValidFullPaper());

    const bomJson = `\uFEFF${JSON.stringify(partA)}`;
    const fencedJson = `\`\`\`json\n${JSON.stringify(partB)}\n\`\`\``;

    const res = await request(app)
      .post('/api/papers/import')
      .attach('files', Buffer.from(bomJson, 'utf8'), 'partA.petdraft')
      .attach('files', Buffer.from(fencedJson, 'utf8'), 'partB.petdraft')
      .attach('files', Buffer.from(JSON.stringify(partC), 'utf8'), 'partC.petdraft');

    expect(res.status).toBe(201);
    expect(res.body.summary.counts.total).toBe(67);
  });

  it('rejects 10+ corrupt/invalid upload cases with right error codes and stores nothing on disk or DB', async () => {
    const valid = createValidFullPaper();
    const parts = splitIntoParts(valid);

    const invalidCases = [
      {
        name: 'non-JSON text',
        files: [{ buf: Buffer.from('not json at all'), name: 'bad.petdraft' }],
        status: 400,
        code: 'PAPER_INVALID',
      },
      {
        name: 'unsupported extension .txt',
        files: [{ buf: Buffer.from(JSON.stringify(valid)), name: 'bad.txt' }],
        status: 400,
        code: 'PAPER_INVALID',
      },
      {
        name: 'multiple markdown fences',
        files: [
          {
            buf: Buffer.from(`\`\`\`json\n{}\n\`\`\`\nextra\n\`\`\`json\n{}\n\`\`\``),
            name: 'fence.petdraft',
          },
        ],
        status: 400,
        code: 'PAPER_INVALID',
      },
      {
        name: 'corrupt .pet binary',
        files: [{ buf: Buffer.from('BADMAGIC1234567890'), name: 'corrupt.pet' }],
        status: 400,
        code: 'PAPER_CORRUPT',
      },
      {
        name: '0 files uploaded',
        files: [],
        status: 400,
        code: 'VALIDATION_FAILED',
      },
      {
        name: 'mixed paperIds across parts',
        files: [
          { buf: Buffer.from(JSON.stringify(parts[0])), name: 'a.petdraft' },
          {
            buf: Buffer.from(JSON.stringify({ ...parts[1], paperId: 'PET-OTHER' })),
            name: 'b.petdraft',
          },
          { buf: Buffer.from(JSON.stringify(parts[2])), name: 'c.petdraft' },
        ],
        status: 400,
        code: 'PAPER_INVALID',
      },
      {
        name: 'missing Part C',
        files: [
          { buf: Buffer.from(JSON.stringify(parts[0])), name: 'a.petdraft' },
          { buf: Buffer.from(JSON.stringify(parts[1])), name: 'b.petdraft' },
        ],
        status: 400,
        code: 'PAPER_INVALID',
      },
      {
        name: 'duplicate Part A',
        files: [
          { buf: Buffer.from(JSON.stringify(parts[0])), name: 'a1.petdraft' },
          { buf: Buffer.from(JSON.stringify(parts[0])), name: 'a2.petdraft' },
          { buf: Buffer.from(JSON.stringify(parts[2])), name: 'c.petdraft' },
        ],
        status: 400,
        code: 'PAPER_INVALID',
      },
      {
        name: 'invalid section1 count',
        files: [
          {
            buf: Buffer.from(
              JSON.stringify({
                ...valid,
                section1: { questions: valid.section1.questions.slice(0, 39) },
              })
            ),
            name: 'short.petdraft',
          },
        ],
        status: 400,
        code: 'PAPER_INVALID',
      },
      {
        name: 'coding test marks do not sum to 10',
        files: [
          {
            buf: Buffer.from(
              JSON.stringify({
                ...valid,
                section2a: {
                  questions: [
                    {
                      ...valid.section2a.questions[0],
                      tests: valid.section2a.questions[0].tests.map((t, i) =>
                        i === 0 ? { ...t, marks: 3 } : t
                      ),
                    },
                    valid.section2a.questions[1],
                  ],
                },
              })
            ),
            name: 'badmarks.petdraft',
          },
        ],
        status: 400,
        code: 'PAPER_INVALID',
      },
    ];

    for (const tc of invalidCases) {
      const { app, encryptedPapersDir } = await setupHarness();
      let req = request(app).post('/api/papers/import');
      for (const f of tc.files) {
        req = req.attach('files', f.buf, f.name);
      }
      const res = await req;
      expect(res.status, tc.name).toBe(tc.status);
      expect(res.body.error.code, tc.name).toBe(tc.code);

      const listRes = await request(app).get('/api/papers');
      expect(listRes.body.papers).toEqual([]);
      const diskFiles = await fs.readdir(encryptedPapersDir).catch(() => []);
      expect(diskFiles).toEqual([]);
    }
  });

  it('rejects import when codingVerifier reports failure and cleans up nothing on disk', async () => {
    const { app, encryptedPapersDir } = await setupHarness({
      codingVerifier: async () => ({
        ok: false,
        failures: [
          { path: 'section2a.questions[0].tests[0]', code: 'TEST_MISMATCH', message: 'Mismatch' },
        ],
      }),
    });

    const paper = createValidFullPaper();
    const res = await request(app)
      .post('/api/papers/import')
      .attach('files', Buffer.from(JSON.stringify(paper), 'utf8'), 'mock.petdraft');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PAPER_INVALID');
    const diskFiles = await fs.readdir(encryptedPapersDir).catch(() => []);
    expect(diskFiles).toEqual([]);
  });

  it('creates an attempt from instructions and deletes papers cleanly', async () => {
    const { app, encryptedPapersDir } = await setupHarness();
    const paper = createValidFullPaper();

    const importRes = await request(app)
      .post('/api/papers/import')
      .attach('files', Buffer.from(JSON.stringify(paper), 'utf8'), 'mock.petdraft');
    const paperDbId = importRes.body.paper.id;

    const attemptRes = await request(app)
      .post('/api/attempts')
      .send({ paperId: paperDbId, violationLimit: 5 });

    expect(attemptRes.status).toBe(201);
    expect(attemptRes.body.attempt.violationLimit).toBe(5);
    expect(attemptRes.body.attempt.status).toBe('not_started');

    const delRes = await request(app).delete(`/api/papers/${paperDbId}`);
    expect(delRes.status).toBe(200);
    expect(await fs.readdir(encryptedPapersDir)).toEqual([]);
  });
});
