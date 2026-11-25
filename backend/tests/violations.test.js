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

async function setupHarness({ initialNow = 1_700_000_000_000 } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-prep-m7-'));
  tempDirs.push(dir);
  const encryptedPapersDir = path.join(dir, 'encrypted');
  const keyDir = path.join(dir, 'keys');
  const dbPath = path.join(dir, 'violations.db');

  let fakeNow = initialNow;
  const db = openDatabase({ dbPath });
  openDbs.push(db);
  const app = createApp({
    db,
    keyStore: createKeyStore({ keyDir, keytar: null }),
    encryptedPapersDir,
    nowFn: () => fakeNow,
  });

  const paper = createValidFullPaper();
  const importRes = await request(app)
    .post('/api/papers/import')
    .attach('files', Buffer.from(JSON.stringify(paper), 'utf8'), 'mock.petdraft');
  expect(importRes.status).toBe(201);

  return {
    app,
    paperDbId: importRes.body.paper.id,
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

describe('M7 violation tracking and attempt termination', () => {
  it('terminates on the 4th violation when limit is 3 and rejects further /answer calls', async () => {
    const h = await setupHarness();
    const attemptRes = await request(h.app)
      .post('/api/attempts')
      .send({ paperId: h.paperDbId, violationLimit: 3 });
    const attemptId = attemptRes.body.attempt.id;

    await request(h.app).post(`/api/attempts/${attemptId}/start-section`).send({ section: 'S1' });

    for (let i = 1; i <= 3; i += 1) {
      h.advanceTime(2000);
      const res = await request(h.app)
        .post(`/api/attempts/${attemptId}/violation`)
        .send({ type: 'tab_hidden', section: 'S1', questionId: 'S1-APT-01' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        count: i,
        limit: 3,
        remaining: 3 - i,
        terminated: false,
      });
    }

    h.advanceTime(2000);
    const fourth = await request(h.app)
      .post(`/api/attempts/${attemptId}/violation`)
      .send({ type: 'fullscreen_exit', section: 'S1', questionId: 'S1-APT-01' });
    expect(fourth.status).toBe(200);
    expect(fourth.body.count).toBe(4);
    expect(fourth.body.terminated).toBe(true);

    const ansAfter = await request(h.app)
      .post(`/api/attempts/${attemptId}/answer`)
      .send({ questionId: 'S1-APT-01', selectedIndex: 0 });
    expect(ansAfter.status).toBe(403);
    expect(ansAfter.body.error.code).toBe('ATTEMPT_TERMINATED');

    const rows = h.app.locals.repos.violationsRepo.listForAttempt(attemptId);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      type: 'tab_hidden',
      section: 'S1',
      question_id: 'S1-APT-01',
    });
    expect(typeof rows[0].at).toBe('number');
  });

  it('terminates on the 6th violation when limit is 5', async () => {
    const h = await setupHarness();
    const attemptRes = await request(h.app)
      .post('/api/attempts')
      .send({ paperId: h.paperDbId, violationLimit: 5 });
    const attemptId = attemptRes.body.attempt.id;

    await request(h.app).post(`/api/attempts/${attemptId}/start-section`).send({ section: 'S1' });

    for (let i = 1; i <= 5; i += 1) {
      h.advanceTime(2000);
      const res = await request(h.app)
        .post(`/api/attempts/${attemptId}/violation`)
        .send({ type: 'window_blur', section: 'S1', questionId: 'S1-APT-01' });
      expect(res.body.terminated).toBe(false);
      expect(res.body.count).toBe(i);
    }

    h.advanceTime(2000);
    const sixth = await request(h.app)
      .post(`/api/attempts/${attemptId}/violation`)
      .send({ type: 'window_blur', section: 'S1', questionId: 'S1-APT-01' });
    expect(sixth.body.terminated).toBe(true);
    expect(sixth.body.count).toBe(6);
  });

  it('deduplicates duplicate violation events of the same type within 1 second', async () => {
    const h = await setupHarness();
    const attemptRes = await request(h.app)
      .post('/api/attempts')
      .send({ paperId: h.paperDbId, violationLimit: 3 });
    const attemptId = attemptRes.body.attempt.id;
    await request(h.app).post(`/api/attempts/${attemptId}/start-section`).send({ section: 'S1' });

    const v1 = await request(h.app)
      .post(`/api/attempts/${attemptId}/violation`)
      .send({ type: 'fullscreen_exit', section: 'S1', questionId: 'S1-APT-01' });
    expect(v1.body.count).toBe(1);

    h.advanceTime(500);
    const vDup = await request(h.app)
      .post(`/api/attempts/${attemptId}/violation`)
      .send({ type: 'fullscreen_exit', section: 'S1', questionId: 'S1-APT-01' });
    expect(vDup.body.deduplicated).toBe(true);
    expect(vDup.body.count).toBe(1);

    // Different violation type within 1s still counts
    const vDiff = await request(h.app)
      .post(`/api/attempts/${attemptId}/violation`)
      .send({ type: 'tab_hidden', section: 'S1', questionId: 'S1-APT-01' });
    expect(vDiff.body.deduplicated).toBe(false);
    expect(vDiff.body.count).toBe(2);
  });

  it('persists settings violationLimit (3 or 5) for new attempts only and supports /terminate', async () => {
    const h = await setupHarness();

    const firstAttempt = await request(h.app).post('/api/attempts').send({ paperId: h.paperDbId });
    expect(firstAttempt.body.attempt.violationLimit).toBe(3);

    const saveRes = await request(h.app).post('/api/settings').send({ violationLimit: 5 });
    expect(saveRes.status).toBe(200);
    expect(saveRes.body.violationLimit).toBe(5);

    const secondAttempt = await request(h.app).post('/api/attempts').send({ paperId: h.paperDbId });
    expect(secondAttempt.body.attempt.violationLimit).toBe(5);

    // Original attempt retains 3
    const firstState = await request(h.app).get(
      `/api/attempts/${firstAttempt.body.attempt.id}/state`
    );
    expect(firstState.body.violationLimit).toBe(3);

    const termRes = await request(h.app)
      .post(`/api/attempts/${secondAttempt.body.attempt.id}/terminate`)
      .send({ reason: 'Manual terminate test' });
    expect(termRes.status).toBe(200);
    expect(termRes.body.terminated).toBe(true);
    expect(termRes.body.state.status).toBe('terminated');
  });
});
