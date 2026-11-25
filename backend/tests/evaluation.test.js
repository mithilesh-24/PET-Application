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

async function setupEvaluationHarness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-prep-m10-'));
  tempDirs.push(dir);
  const encryptedPapersDir = path.join(dir, 'encrypted');
  const keyDir = path.join(dir, 'keys');
  const dbPath = path.join(dir, 'eval.db');

  let fakeNow = 1_700_000_000_000;
  const db = openDatabase({ dbPath });
  openDbs.push(db);
  const app = createApp({
    db,
    keyStore: createKeyStore({ keyDir, keytar: null }),
    encryptedPapersDir,
    codingVerifier: async () => ({ ok: true, failures: [], warnings: [] }),
    nowFn: () => fakeNow,
  });

  const paper = createValidFullPaper();
  const importRes = await request(app)
    .post('/api/papers/import')
    .attach('files', Buffer.from(JSON.stringify(paper), 'utf8'), 'mock.petdraft');
  expect(importRes.status).toBe(201);

  return {
    dir,
    dbPath,
    db,
    keyDir,
    encryptedPapersDir,
    app,
    paper,
    paperDbId: importRes.body.paper.id,
    advanceTime: (ms) => {
      fakeNow += ms;
      return fakeNow;
    },
    getNow: () => fakeNow,
  };
}

function seedSectionTiming(
  repos,
  attemptId,
  section,
  startedAt,
  submittedAt,
  status = 'submitted'
) {
  repos.sectionStateRepo.updateSection(attemptId, section, {
    status,
    started_at: startedAt,
    deadline_at: startedAt + 50 * 60 * 1000,
    submitted_at: submittedAt,
  });
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

describe('M10 golden-file scoring, idempotence, and review access control', () => {
  it('blocks /result and /review with 403 NOT_FOUND while attempt is still running', async () => {
    const h = await setupEvaluationHarness();
    const attemptRes = await request(h.app)
      .post('/api/attempts')
      .send({ paperId: h.paperDbId, violationLimit: 3 });
    const attemptId = attemptRes.body.attempt.id;

    await request(h.app).post(`/api/attempts/${attemptId}/start-section`).send({ section: 'S1' });

    const resAttempt = await request(h.app).get(`/api/attempts/${attemptId}/result`);
    expect(resAttempt.status).toBe(403);
    expect(resAttempt.body.error.code).toBe('NOT_FOUND');

    const revAttempt = await request(h.app).get(`/api/attempts/${attemptId}/review`);
    expect(revAttempt.status).toBe(403);
    expect(revAttempt.body.error.code).toBe('NOT_FOUND');
  });

  it('scores golden-file Attempt 1 (perfect 100/100) and survives server restart', async () => {
    const h = await setupEvaluationHarness();
    const repos = h.app.locals.repos;
    const attempt = repos.attemptsRepo.create({
      paper_id: h.paperDbId,
      status: 'completed',
      started_at: 1000,
      ended_at: 1000 + 90 * 60 * 1000,
    });

    seedSectionTiming(repos, attempt.id, 'S1', 1000, 1000 + 1_800_000);
    seedSectionTiming(repos, attempt.id, 'S2', 2_000_000, 2_000_000 + 1_500_000);
    seedSectionTiming(repos, attempt.id, 'S2A', 4_000_000, 4_000_000 + 2_100_000);

    for (const q of h.paper.section1.questions) {
      repos.responsesRepo.upsert({
        attempt_id: attempt.id,
        question_id: q.id,
        section: 'S1',
        selected_index: q.answerIndex,
        time_spent_ms: 10000,
        saved_at: 5000,
      });
    }
    for (const q of [...h.paper.section2.departmentMcqs, ...h.paper.section2.snippets]) {
      repos.responsesRepo.upsert({
        attempt_id: attempt.id,
        question_id: q.id,
        section: 'S2',
        selected_index: q.answerIndex,
        time_spent_ms: 12000,
        saved_at: 6000,
      });
    }
    for (const q of h.paper.section2a.questions) {
      repos.codingRepo.createSubmissionWithResults({
        submission: {
          attempt_id: attempt.id,
          question_id: q.id,
          language: 'python',
          source: q.referenceSolution.code,
          submitted_at: 7000,
        },
        testResults: q.tests.map((t) => ({
          test_id: t.id,
          passed: true,
          status: 'pass',
          runtime_ms: 20,
          memory_kb: 1024,
          marks_awarded: t.marks,
        })),
      });
    }

    const res = await request(h.app).get(`/api/attempts/${attempt.id}/result`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(100);
    expect(res.body.section1).toBe(40);
    expect(res.body.section2).toBe(40);
    expect(res.body.section2a).toBe(20);
    expect(res.body.breakdown.counts).toEqual({
      totalQuestions: 67,
      correct: 67,
      incorrect: 0,
      unanswered: 0,
    });
    expect(res.body.breakdown.coding.testsPassed).toBe(20);
    expect(res.body.breakdown.coding.testsTotal).toBe(20);
    expect(res.body.breakdown.time.totalMs).toBe(5_400_000);

    // Recompute idempotence
    const recomputed = await h.app.locals.evaluationService.evaluateAttempt(attempt.id);
    expect(recomputed.result.total).toBe(100);
    expect(recomputed.breakdown.counts.correct).toBe(67);

    // Server restart recovery
    h.db.close();
    const db2 = openDatabase({ dbPath: h.dbPath });
    openDbs.push(db2);
    const app2 = createApp({
      db: db2,
      keyStore: createKeyStore({ keyDir: h.keyDir, keytar: null }),
      encryptedPapersDir: h.encryptedPapersDir,
    });

    const afterRestart = await request(app2).get(`/api/attempts/${attempt.id}/result`);
    expect(afterRestart.status).toBe(200);
    expect(afterRestart.body.total).toBe(100);

    const reviewRes = await request(app2).get(`/api/attempts/${attempt.id}/review`);
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.items).toHaveLength(67);
    expect(reviewRes.body.items[66].referenceSolution).toBeDefined();
  });

  it('scores golden-file Attempt 2 (all wrong 0/100, zero negative marking)', async () => {
    const h = await setupEvaluationHarness();
    const repos = h.app.locals.repos;
    const attempt = repos.attemptsRepo.create({
      paper_id: h.paperDbId,
      status: 'completed',
      started_at: 1000,
      ended_at: 2000,
    });

    for (const q of h.paper.section1.questions) {
      repos.responsesRepo.upsert({
        attempt_id: attempt.id,
        question_id: q.id,
        section: 'S1',
        selected_index: (q.answerIndex + 1) % 4,
        saved_at: 1500,
      });
    }
    for (const q of [...h.paper.section2.departmentMcqs, ...h.paper.section2.snippets]) {
      repos.responsesRepo.upsert({
        attempt_id: attempt.id,
        question_id: q.id,
        section: 'S2',
        selected_index: (q.answerIndex + 1) % 4,
        saved_at: 1600,
      });
    }
    for (const q of h.paper.section2a.questions) {
      repos.codingRepo.createSubmissionWithResults({
        submission: {
          attempt_id: attempt.id,
          question_id: q.id,
          language: 'python',
          source: 'print(-999)',
          submitted_at: 1700,
        },
        testResults: q.tests.map((t) => ({
          test_id: t.id,
          passed: false,
          status: 'fail',
          runtime_ms: 15,
          memory_kb: 1024,
          marks_awarded: 0,
        })),
      });
    }

    const res = await request(h.app).get(`/api/attempts/${attempt.id}/result`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.breakdown.counts).toEqual({
      totalQuestions: 67,
      correct: 0,
      incorrect: 67,
      unanswered: 0,
    });
  });

  it('scores golden-file Attempt 3 (mixed + partial coding + terminated flag)', async () => {
    const h = await setupEvaluationHarness();
    const repos = h.app.locals.repos;
    const attempt = repos.attemptsRepo.create({
      paper_id: h.paperDbId,
      status: 'terminated',
      termination_reason: 'Exceeded violation limit (4 of 3)',
      started_at: 1000,
      ended_at: 500_000,
    });

    // S1: 10 aptitude correct (10), 5 reasoning wrong (0), rest unanswered (25)
    for (let i = 0; i < 10; i += 1) {
      const q = h.paper.section1.questions[i];
      repos.responsesRepo.upsert({
        attempt_id: attempt.id,
        question_id: q.id,
        section: 'S1',
        selected_index: q.answerIndex,
        saved_at: 2000,
      });
    }
    for (let i = 15; i < 20; i += 1) {
      const q = h.paper.section1.questions[i];
      repos.responsesRepo.upsert({
        attempt_id: attempt.id,
        question_id: q.id,
        section: 'S1',
        selected_index: (q.answerIndex + 1) % 4,
        saved_at: 3000,
      });
    }

    // S2: CC01 all 4 correct (1+1+2+2 = 6), 2 snippets correct (4) => 10 marks
    for (let i = 0; i < 4; i += 1) {
      const q = h.paper.section2.departmentMcqs[i];
      repos.responsesRepo.upsert({
        attempt_id: attempt.id,
        question_id: q.id,
        section: 'S2',
        selected_index: q.answerIndex,
        saved_at: 4000,
      });
    }
    for (let i = 0; i < 2; i += 1) {
      const q = h.paper.section2.snippets[i];
      repos.responsesRepo.upsert({
        attempt_id: attempt.id,
        question_id: q.id,
        section: 'S2',
        selected_index: q.answerIndex,
        saved_at: 5000,
      });
    }

    // S2A: Q1 passes first 4 tests (0.5 + 1.0 + 1.0 + 1.0 = 3.5 marks), Q2 not submitted
    const q1 = h.paper.section2a.questions[0];
    repos.codingRepo.createSubmissionWithResults({
      submission: {
        attempt_id: attempt.id,
        question_id: q1.id,
        language: 'python',
        source: 'partial()',
        submitted_at: 6000,
      },
      testResults: q1.tests.map((t, idx) => ({
        test_id: t.id,
        passed: idx < 4,
        status: idx < 4 ? 'pass' : 'fail',
        runtime_ms: 10,
        memory_kb: 1024,
        marks_awarded: idx < 4 ? t.marks : 0,
      })),
    });

    const res = await request(h.app).get(`/api/attempts/${attempt.id}/result`);
    expect(res.status).toBe(200);
    expect(res.body.terminated).toBe(true);
    expect(res.body.section1).toBe(10);
    expect(res.body.section2).toBe(10);
    expect(res.body.section2a).toBe(3.5);
    expect(res.body.total).toBe(23.5);
    expect(res.body.breakdown.categories.aptitude.obtained).toBe(10);
    expect(res.body.breakdown.subjects.CC01.obtained).toBe(6);
    expect(res.body.breakdown.snippets.obtained).toBe(4);
    expect(res.body.breakdown.coding.testsPassed).toBe(4);
    expect(res.body.breakdown.counts).toEqual({
      totalQuestions: 67,
      correct: 16,
      incorrect: 6,
      unanswered: 45,
    });
  });
});
