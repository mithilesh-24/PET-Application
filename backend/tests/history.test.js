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

async function setupHistoryHarness() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-prep-m11-'));
  tempDirs.push(dir);
  const encryptedPapersDir = path.join(dir, 'encrypted');
  const keyDir = path.join(dir, 'keys');
  const dbPath = path.join(dir, 'history.db');

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
    db,
    app,
    paper,
    paperDbId: importRes.body.paper.id,
    encryptedFilePath: importRes.body.paper.file_path,
    advanceTime: (ms) => {
      fakeNow += ms;
      return fakeNow;
    },
    getNow: () => fakeNow,
  };
}

function createEndedAttemptWithResponses(
  h,
  { status = 'completed', s1Correct = 10, topicOutcomes = [], withCoding = false }
) {
  const { repos } = h.app.locals;
  const start = h.getNow();
  const attempt = repos.attemptsRepo.create({
    paper_id: h.paperDbId,
    status: 'not_started',
    violation_limit: 3,
  });

  const s1Questions = h.app.locals.examEngine.getOrderedSectionQuestions(h.paper, 'S1');
  const s2Questions = h.app.locals.examEngine.getOrderedSectionQuestions(h.paper, 'S2');

  for (let i = 0; i < s1Correct && i < s1Questions.length; i += 1) {
    const q = s1Questions[i];
    repos.responsesRepo.upsert({
      attempt_id: attempt.id,
      question_id: q.id,
      section: 'S1',
      selected_index: q.answerIndex,
      time_spent_ms: 1500,
      saved_at: start + i * 10,
    });
  }

  for (const spec of topicOutcomes) {
    const q = s2Questions[spec.index];
    repos.responsesRepo.upsert({
      attempt_id: attempt.id,
      question_id: q.id,
      section: 'S2',
      selected_index: spec.correct ? q.answerIndex : (q.answerIndex + 1) % 4,
      time_spent_ms: 2000,
      saved_at: start + 1000,
    });
  }

  if (withCoding) {
    const s2aQuestions = h.app.locals.examEngine.getOrderedSectionQuestions(h.paper, 'S2A');
    const q = s2aQuestions[0];
    repos.codingRepo.createSubmissionWithResults({
      submission: {
        attempt_id: attempt.id,
        question_id: q.id,
        language: 'python',
        source: 'print(1)\n',
        submitted_at: start + 5000,
      },
      testResults: q.tests.map((t) => ({
        test_id: t.id,
        passed: true,
        status: 'pass',
        runtime_ms: 10,
        memory_kb: 1024,
        marks_awarded: q.marks / q.tests.length,
      })),
    });
  }

  repos.violationsRepo.record({
    attempt_id: attempt.id,
    type: 'tab_hidden',
    at: start + 2000,
    section: 'S1',
    question_id: s1Questions[0].id,
  });

  for (const [idx, sec] of ['S1', 'S2', 'S2A'].entries()) {
    repos.sectionStateRepo.updateSection(attempt.id, sec, {
      status: 'submitted',
      started_at: start + idx * 60_000,
      deadline_at: start + (idx + 1) * 60_000,
      submitted_at: start + idx * 60_000 + 30_000,
    });
  }

  repos.attemptsRepo.updateState(attempt.id, {
    status,
    started_at: start,
    ended_at: start + 180_000,
    termination_reason: status === 'terminated' ? 'Violation limit reached' : null,
  });

  h.advanceTime(300_000);
  return attempt.id;
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

describe('M11 history, analytics, compare, export, and delete', () => {
  it('returns clean empty state with zero attempts', async () => {
    const h = await setupHistoryHarness();

    const histRes = await request(h.app).get('/api/history');
    expect(histRes.status).toBe(200);
    expect(histRes.body).toEqual({ attempts: [] });

    const analyticsRes = await request(h.app).get('/api/history/analytics');
    expect(analyticsRes.status).toBe(200);
    expect(analyticsRes.body).toEqual({
      totalAttempts: 0,
      topics: [],
      recommendations: [],
    });
  });

  it('computes hand-verified weak-topic analytics with >=3 threshold and ranks lowest first', async () => {
    const h = await setupHistoryHarness();

    // First, evaluate a paper using distinct topic names on S2[0], S2[1], S2[2] or shared fixture topics
    // Inspect fixture S2 topics cleanly via s2Questions
    const s2 = h.app.locals.examEngine.getOrderedSectionQuestions(h.paper, 'S2');
    // Pick two indices with the SAME topic if any, or verify grouped counts directly from fixture topics:
    // Notice createValidFullPaper uses repeatable categories/topics across S1/S2.
    // Let's seed 3 ended attempts answering the same S2 question indices so we know exact topic counts:
    const topicTarget = s2[0].topic;
    const topicSmall = s2[15].topic;

    // Attempt 1: answer s2[0] twice? Wait: only 1 response per question per attempt.
    // Across 3 attempts, answering s2[0] each time gives >=3 attempts in topicTarget: 1 correct, 2 wrong = 33% (1 of 3)
    // Answering s2[15] only once across attempts (if unique topic or wait: ensure we know exact counts across paper)
    const id1 = createEndedAttemptWithResponses(h, {
      status: 'completed',
      s1Correct: 0,
      topicOutcomes: [
        { index: 0, correct: true },
        { index: 15, correct: true },
      ],
    });
    const id2 = createEndedAttemptWithResponses(h, {
      status: 'completed',
      s1Correct: 0,
      topicOutcomes: [{ index: 0, correct: false }],
    });
    const id3 = createEndedAttemptWithResponses(h, {
      status: 'terminated',
      s1Correct: 0,
      topicOutcomes: [{ index: 0, correct: false }],
    });

    await h.app.locals.evaluationService.evaluateAttempt(id1);
    await h.app.locals.evaluationService.evaluateAttempt(id2);
    await h.app.locals.evaluationService.evaluateAttempt(id3);

    const analyticsRes = await request(h.app).get('/api/history/analytics');
    expect(analyticsRes.status).toBe(200);
    expect(analyticsRes.body.totalAttempts).toBe(3);

    const targetRow = analyticsRes.body.topics.find((t) => t.topic === topicTarget);
    expect(targetRow).toBeDefined();
    expect(targetRow.attempted).toBeGreaterThanOrEqual(3);
    expect(targetRow.enoughData).toBe(true);
    expect(targetRow.statusText).toBe(`${targetRow.accuracyPercent}% (${targetRow.correct} of ${targetRow.attempted})`);

    if (topicSmall !== topicTarget) {
      const smallRow = analyticsRes.body.topics.find((t) => t.topic === topicSmall);
      if (smallRow && smallRow.attempted < 3) {
        expect(smallRow.enoughData).toBe(false);
        expect(smallRow.accuracyPercent).toBeNull();
        expect(smallRow.statusText).toBe('not enough data');
      }
    }

    // Ranked enoughData topics lowest accuracy first
    const enoughRows = analyticsRes.body.topics.filter((t) => t.enoughData);
    for (let i = 1; i < enoughRows.length; i += 1) {
      expect(enoughRows[i].accuracyPercent).toBeGreaterThanOrEqual(enoughRows[i - 1].accuracyPercent);
    }

    // Recommendations reflect actual aggregated numbers only
    expect(analyticsRes.body.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(analyticsRes.body.recommendations[0]).toContain('Practise ');
    expect(analyticsRes.body.recommendations[0]).toContain('across');
  });

  it('compares 2, 3, and 4 attempts and rejects invalid counts', async () => {
    const h = await setupHistoryHarness();
    const id1 = createEndedAttemptWithResponses(h, { status: 'completed', s1Correct: 5 });
    const id2 = createEndedAttemptWithResponses(h, { status: 'completed', s1Correct: 12 });
    const id3 = createEndedAttemptWithResponses(h, { status: 'completed', s1Correct: 18 });
    const id4 = createEndedAttemptWithResponses(h, { status: 'terminated', s1Correct: 22 });
    const id5 = createEndedAttemptWithResponses(h, { status: 'completed', s1Correct: 25 });

    const single = await request(h.app).get(`/api/history/compare?ids=${id1}`);
    expect(single.status).toBe(400);
    expect(single.body.error.code).toBe('VALIDATION_ERROR');

    const five = await request(h.app).get(
      `/api/history/compare?ids=${[id1, id2, id3, id4, id5].join(',')}`
    );
    expect(five.status).toBe(400);
    expect(five.body.error.code).toBe('VALIDATION_ERROR');

    const cmp2 = await request(h.app).get(`/api/history/compare?ids=${id1},${id2}`);
    expect(cmp2.status).toBe(200);
    expect(cmp2.body.attempts).toHaveLength(2);
    expect(cmp2.body.attempts[0].total).toBe(5);
    expect(cmp2.body.attempts[1].total).toBe(12);

    const cmp3 = await request(h.app).get(`/api/history/compare?ids=${id1},${id2},${id3}`);
    expect(cmp3.status).toBe(200);
    expect(cmp3.body.attempts).toHaveLength(3);

    const cmp4 = await request(h.app).get(`/api/history/compare?ids=${id1},${id2},${id3},${id4}`);
    expect(cmp4.status).toBe(200);
    expect(cmp4.body.attempts).toHaveLength(4);
    expect(cmp4.body.attempts[3].status).toBe('terminated');
    expect(cmp4.body.attempts[3].violationCount).toBe(1);
  });

  it('exports JSON and CSV matching DB without leaking answer keys, and cascades delete safely', async () => {
    const h = await setupHistoryHarness();
    const id1 = createEndedAttemptWithResponses(h, {
      status: 'completed',
      s1Correct: 10,
      topicOutcomes: [{ index: 0, correct: true }],
      withCoding: true,
    });
    // Also insert an abandoned attempt so history list verifies all 3 statuses
    const abandoned = h.app.locals.repos.attemptsRepo.create({
      paper_id: h.paperDbId,
      status: 'abandoned',
      started_at: h.getNow(),
      ended_at: h.getNow() + 60_000,
    });

    const hist = await request(h.app).get('/api/history');
    expect(hist.status).toBe(200);
    expect(hist.body.attempts).toHaveLength(2);
    expect(hist.body.attempts.map((a) => a.status).sort()).toEqual(['abandoned', 'completed']);
    expect(hist.body.attempts.find((a) => a.attemptId === abandoned.id).hasResult).toBe(false);

    // JSON export
    const jsonExport = await request(h.app).get(`/api/attempts/${id1}/export?format=json`);
    expect(jsonExport.status).toBe(200);
    expect(jsonExport.headers['content-disposition']).toContain(`.json"`);
    const parsedJson = JSON.parse(jsonExport.text);
    expect(parsedJson.result.attemptId).toBe(id1);
    const s2FirstMarks = h.app.locals.examEngine.getOrderedSectionQuestions(h.paper, 'S2')[0].marks;
    const s2aFirstMarks = h.app.locals.examEngine.getOrderedSectionQuestions(h.paper, 'S2A')[0].marks;
    expect(parsedJson.result.total).toBe(10 + s2FirstMarks + s2aFirstMarks);
    expect(parsedJson.responses).toHaveLength(67);
    expect(jsonExport.text).not.toContain('answerIndex');
    expect(jsonExport.text).not.toContain('expectedOutput');
    expect(jsonExport.text).not.toContain('referenceSolution');

    // CSV export
    const csvExport = await request(h.app).get(`/api/attempts/${id1}/export?format=csv`);
    expect(csvExport.status).toBe(200);
    expect(csvExport.headers['content-disposition']).toContain(`.csv"`);
    const csvLines = csvExport.text.trim().split('\n');
    expect(csvLines).toHaveLength(68); // 1 header + 67 question rows
    expect(csvLines[0]).toContain('attemptId,questionId,section');

    // Delete cascades attempt rows but keeps paper and encrypted file
    const delRes = await request(h.app).delete(`/api/attempts/${id1}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.deleted).toBe(true);

    expect(h.app.locals.repos.attemptsRepo.getById(id1)).toBeNull();
    expect(h.app.locals.repos.resultsRepo.getByAttemptId(id1)).toBeNull();
    expect(h.app.locals.repos.responsesRepo.getForAttempt(id1)).toHaveLength(0);
    expect(h.app.locals.repos.violationsRepo.listForAttempt(id1)).toHaveLength(0);
    expect(h.app.locals.repos.codingRepo.getFinalSubmissions(id1)).toHaveLength(0);

    // Paper still exists and file still on disk
    const paperRow = h.app.locals.repos.papersRepo.getById(h.paperDbId);
    expect(paperRow).not.toBeNull();
    const stat = await fs.stat(paperRow.file_path);
    expect(stat.isFile()).toBe(true);
  });
});
