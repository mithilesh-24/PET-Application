import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server.js';
import { openDatabase } from '../database/database.js';
import { createKeyStore } from '../services/keyStore.js';
import { createValidFullPaper } from './fixtures/paperFixtures.js';

const tempDirs = [];
const openDbs = [];

async function setupExamHarness({
  initialNow = 1_700_000_000_000,
  sectionDurationMs = 50 * 60 * 1000,
  transitionGraceMs = 60 * 1000,
} = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-prep-m5-'));
  tempDirs.push(dir);
  const encryptedPapersDir = path.join(dir, 'encrypted');
  const keyDir = path.join(dir, 'keys');
  const dbPath = path.join(dir, 'exam.db');

  let fakeNow = initialNow;
  const completedAttempts = [];

  const db = openDatabase({ dbPath });
  openDbs.push(db);
  const keyStore = createKeyStore({ keyDir, keytar: null });
  const app = createApp({
    db,
    keyStore,
    encryptedPapersDir,
    codingVerifier: async () => ({ ok: true, failures: [], warnings: [] }),
    nowFn: () => fakeNow,
    sectionDurationMs,
    transitionGraceMs,
    onAttemptCompleted: (id) => {
      completedAttempts.push(id);
    },
  });

  const paper = createValidFullPaper();
  const importRes = await request(app)
    .post('/api/papers/import')
    .attach('files', Buffer.from(JSON.stringify(paper), 'utf8'), 'mock.petdraft');
  expect(importRes.status).toBe(201);

  const attemptRes = await request(app)
    .post('/api/attempts')
    .send({ paperId: importRes.body.paper.id, violationLimit: 3 });
  expect(attemptRes.status).toBe(201);

  return {
    dir,
    dbPath,
    db,
    keyDir,
    encryptedPapersDir,
    app,
    paper,
    attemptId: attemptRes.body.attempt.id,
    completedAttempts,
    getNow: () => fakeNow,
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

describe('M5 server-authoritative exam engine', () => {
  it('blocks starting S2 before S1 is submitted and strips answer keys from GET /question', async () => {
    const { app, attemptId } = await setupExamHarness();

    const badStart = await request(app)
      .post(`/api/attempts/${attemptId}/start-section`)
      .send({ section: 'S2' });
    expect(badStart.status).toBe(403);
    expect(badStart.body.error.code).toBe('SECTION_LOCKED');

    const startS1 = await request(app)
      .post(`/api/attempts/${attemptId}/start-section`)
      .send({ section: 'S1' });
    expect(startS1.status).toBe(200);
    expect(startS1.body.currentSection).toBe('S1');
    expect(startS1.body.secondsRemaining).toBe(3000);

    const qRes = await request(app).get(`/api/attempts/${attemptId}/question`);
    expect(qRes.status).toBe(200);
    expect(qRes.body.question.id).toBe('S1-APT-01');
    expect(qRes.body.question).not.toHaveProperty('answerIndex');
    expect(qRes.body.question).not.toHaveProperty('explanation');
    expect(qRes.body.totalInSection).toBe(40);
  });

  it('rejects answering non-current questions or going backwards', async () => {
    const { app, attemptId } = await setupExamHarness();
    await request(app).post(`/api/attempts/${attemptId}/start-section`).send({ section: 'S1' });

    const wrongQ = await request(app)
      .post(`/api/attempts/${attemptId}/answer`)
      .send({ questionId: 'S1-APT-02', selectedIndex: 1 });
    expect(wrongQ.status).toBe(403);
    expect(wrongQ.body.error.code).toBe('BACKWARD_NAVIGATION_FORBIDDEN');

    await request(app)
      .post(`/api/attempts/${attemptId}/answer`)
      .send({ questionId: 'S1-APT-01', selectedIndex: 1 });

    const nextRes = await request(app).post(`/api/attempts/${attemptId}/next`).send({});
    expect(nextRes.status).toBe(200);
    expect(nextRes.body.question.id).toBe('S1-APT-02');

    const backAttempt = await request(app)
      .post(`/api/attempts/${attemptId}/answer`)
      .send({ questionId: 'S1-APT-01', selectedIndex: 2 });
    expect(backAttempt.status).toBe(403);
    expect(backAttempt.body.error.code).toBe('BACKWARD_NAVIGATION_FORBIDDEN');
  });

  it('requires explicit unanswered:true to skip and advances only once on concurrent /next calls', async () => {
    const { app, attemptId } = await setupExamHarness();
    await request(app).post(`/api/attempts/${attemptId}/start-section`).send({ section: 'S1' });

    const blockedNext = await request(app).post(`/api/attempts/${attemptId}/next`).send({});
    expect(blockedNext.status).toBe(400);

    // Confirm unanswered:true skips Q1 and records unanswered response
    const skipRes = await request(app)
      .post(`/api/attempts/${attemptId}/next`)
      .send({ unanswered: true });
    expect(skipRes.status).toBe(200);
    expect(skipRes.body.index).toBe(1);
    expect(skipRes.body.question.id).toBe('S1-APT-02');

    // Answer Q2, then fire two concurrent /next requests without unanswered:true
    await request(app)
      .post(`/api/attempts/${attemptId}/answer`)
      .send({ questionId: 'S1-APT-02', selectedIndex: 0 });

    const [n1, n2] = await Promise.all([
      request(app).post(`/api/attempts/${attemptId}/next`).send({}),
      request(app).post(`/api/attempts/${attemptId}/next`).send({}),
    ]);

    const statuses = [n1.status, n2.status].sort();
    expect(statuses).toEqual([200, 400]);

    const stateRes = await request(app).get(`/api/attempts/${attemptId}/state`);
    expect(stateRes.body.currentIndex).toBe(2);
  });

  it('auto-expires open sections at deadline (0 and partial responses) and auto-starts next section after 60s', async () => {
    const h = await setupExamHarness({
      sectionDurationMs: 50 * 60 * 1000,
      transitionGraceMs: 60 * 1000,
    });

    await request(h.app).post(`/api/attempts/${h.attemptId}/start-section`).send({ section: 'S1' });

    // Advance past S1 50-minute deadline with 0 responses
    h.advanceTime(50 * 60 * 1000 + 1000);

    // Answering after deadline must be rejected
    const lateAnswer = await request(h.app)
      .post(`/api/attempts/${h.attemptId}/answer`)
      .send({ questionId: 'S1-APT-01', selectedIndex: 0 });
    expect(lateAnswer.status).toBe(400);
    expect(['SECTION_EXPIRED', 'SECTION_LOCKED']).toContain(lateAnswer.body.error.code);

    // State should be in transition from S1 (expired) to S2
    const transState = await request(h.app).get(`/api/attempts/${h.attemptId}/state`);
    expect(transState.body.phase).toBe('transition');
    expect(transState.body.nextSection).toBe('S2');
    expect(transState.body.lastSubmittedSection.status).toBe('expired');
    expect(transState.body.lastSubmittedSection.answeredCount).toBe(0);

    // Advance 60 seconds: server auto-starts S2
    h.advanceTime(60 * 1000);
    const s2AutoState = await request(h.app).get(`/api/attempts/${h.attemptId}/state`);
    expect(s2AutoState.body.phase).toBe('in_section');
    expect(s2AutoState.body.currentSection).toBe('S2');

    // Submit 1 partial response in S2, then expire S2 via background sweep
    await request(h.app)
      .post(`/api/attempts/${h.attemptId}/answer`)
      .send({ questionId: 'S2-CC01-01', selectedIndex: 2 });

    h.advanceTime(50 * 60 * 1000 + 5000);
    h.app.locals.examEngine.reconcileAllOpenAttempts();

    const s2Trans = await request(h.app).get(`/api/attempts/${h.attemptId}/state`);
    expect(s2Trans.body.phase).toBe('transition');
    expect(s2Trans.body.nextSection).toBe('S2A');
    expect(s2Trans.body.lastSubmittedSection.answeredCount).toBe(1);
    expect(s2Trans.body.lastSubmittedSection.status).toBe('expired');
  });

  it('recovers exact question and remaining time after simulated server restart (time down still counts)', async () => {
    const h = await setupExamHarness();
    await request(h.app).post(`/api/attempts/${h.attemptId}/start-section`).send({ section: 'S1' });
    await request(h.app)
      .post(`/api/attempts/${h.attemptId}/answer`)
      .send({ questionId: 'S1-APT-01', selectedIndex: 3 });
    await request(h.app).post(`/api/attempts/${h.attemptId}/next`).send({});

    // Simulate server restart and 10 minutes elapsed while down
    h.db.close();
    h.advanceTime(10 * 60 * 1000);

    const db2 = openDatabase({ dbPath: h.dbPath });
    openDbs.push(db2);
    const app2 = createApp({
      db: db2,
      keyStore: createKeyStore({ keyDir: h.keyDir, keytar: null }),
      encryptedPapersDir: h.encryptedPapersDir,
      nowFn: h.getNow,
    });

    const stateRes = await request(app2).get(`/api/attempts/${h.attemptId}/state`);
    expect(stateRes.status).toBe(200);
    expect(stateRes.body.currentSection).toBe('S1');
    expect(stateRes.body.currentIndex).toBe(1);
    expect(stateRes.body.secondsRemaining).toBe(40 * 60);

    const qRes = await request(app2).get(`/api/attempts/${h.attemptId}/question`);
    expect(qRes.body.question.id).toBe('S1-APT-02');
    expect(qRes.body.secondsRemaining).toBe(40 * 60);
  });

  it('supports terminateAttempt hook and rejects further actions with ATTEMPT_TERMINATED', async () => {
    const h = await setupExamHarness();
    await request(h.app).post(`/api/attempts/${h.attemptId}/start-section`).send({ section: 'S1' });

    const terminated = h.app.locals.examEngine.terminateAttempt(
      h.attemptId,
      'Exceeded violation limit'
    );
    expect(terminated.status).toBe('terminated');
    expect(h.completedAttempts).toContain(h.attemptId);

    const ans = await request(h.app)
      .post(`/api/attempts/${h.attemptId}/answer`)
      .send({ questionId: 'S1-APT-01', selectedIndex: 0 });
    expect(ans.status).toBe(403);
    expect(ans.body.error.code).toBe('ATTEMPT_TERMINATED');
  });

  it('completes a full scripted run through all 67 questions (S1 -> S2 -> S2A -> completed)', async () => {
    const h = await setupExamHarness();

    // Section 1: 40 questions
    await request(h.app).post(`/api/attempts/${h.attemptId}/start-section`).send({ section: 'S1' });
    for (let i = 0; i < 40; i += 1) {
      const q = await request(h.app).get(`/api/attempts/${h.attemptId}/question`);
      expect(q.status).toBe(200);
      expect(q.body.index).toBe(i);
      const ans = await request(h.app)
        .post(`/api/attempts/${h.attemptId}/answer`)
        .send({ questionId: q.body.question.id, selectedIndex: i % 4 });
      expect(ans.status).toBe(200);
      if (i < 39) {
        const nxt = await request(h.app).post(`/api/attempts/${h.attemptId}/next`).send({});
        expect(nxt.status).toBe(200);
      }
    }
    const sub1 = await request(h.app).post(`/api/attempts/${h.attemptId}/submit-section`).send({});
    expect(sub1.status).toBe(200);
    expect(sub1.body.submittedSection).toBe('S1');
    expect(sub1.body.answeredCount).toBe(40);
    expect(sub1.body.nextSection).toBe('S2');

    // Section 2: 25 questions (20 dept MCQs then 5 snippets)
    await request(h.app).post(`/api/attempts/${h.attemptId}/start-section`).send({ section: 'S2' });
    for (let i = 0; i < 25; i += 1) {
      const q = await request(h.app).get(`/api/attempts/${h.attemptId}/question`);
      expect(q.status).toBe(200);
      expect(q.body.totalInSection).toBe(25);
      if (i < 20) expect(q.body.question.type).toBe('mcq');
      else expect(q.body.question.type).toBe('snippet');

      await request(h.app)
        .post(`/api/attempts/${h.attemptId}/answer`)
        .send({ questionId: q.body.question.id, selectedIndex: i % 4 });
      if (i < 24) {
        await request(h.app).post(`/api/attempts/${h.attemptId}/next`).send({});
      }
    }
    const sub2 = await request(h.app).post(`/api/attempts/${h.attemptId}/submit-section`).send({});
    expect(sub2.status).toBe(200);
    expect(sub2.body.submittedSection).toBe('S2');
    expect(sub2.body.nextSection).toBe('S2A');

    // Section 2a: 2 coding questions (medium then hard, hidden tests stripped)
    await request(h.app)
      .post(`/api/attempts/${h.attemptId}/start-section`)
      .send({ section: 'S2A' });
    const c1 = await request(h.app).get(`/api/attempts/${h.attemptId}/question`);
    expect(c1.status).toBe(200);
    expect(c1.body.question.difficulty).toBe('medium');
    expect(c1.body.question).not.toHaveProperty('tests');
    expect(c1.body.question).not.toHaveProperty('referenceSolution');
    expect(c1.body.question).not.toHaveProperty('explanation');

    const c2 = await request(h.app)
      .post(`/api/attempts/${h.attemptId}/next`)
      .send({ unanswered: true });
    expect(c2.status).toBe(200);
    expect(c2.body.question.difficulty).toBe('hard');

    const sub2a = await request(h.app).post(`/api/attempts/${h.attemptId}/submit-section`).send({});
    expect(sub2a.status).toBe(200);
    expect(sub2a.body.completed).toBe(true);
    expect(sub2a.body.state.status).toBe('completed');
    expect(h.completedAttempts).toContain(h.attemptId);
  });
});
