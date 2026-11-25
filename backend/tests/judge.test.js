import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../server.js';
import { openDatabase } from '../database/database.js';
import { createKeyStore } from '../services/keyStore.js';
import { verifyCodingTests } from '../services/codingVerifier.js';
import { createValidFullPaper } from './fixtures/paperFixtures.js';

const tempDirs = [];
const openDbs = [];

function createTreePaper() {
  const paper = createValidFullPaper({
    paperId: 'PET-TREE-JUDGE-1',
    title: 'Tree Judge Paper',
  });
  // Make S2A-02 a genuine tree depth/degree sum problem so all 4 languages solve a known tree problem
  paper.section2a.questions[1] = {
    id: 'S2A-02',
    type: 'coding',
    title: 'Tree Edge Weight Sum',
    difficulty: 'hard',
    domain: 'graph',
    isTreeOrGraph: true,
    topic: 'Trees',
    marks: 10,
    statement:
      'Given a weighted tree with N nodes and N-1 edges (u, v, w), compute the total sum of edge weights across the tree.',
    inputFormat: 'First line N. Next N-1 lines contain u v w.',
    outputFormat: 'Single integer: sum of all edge weights.',
    constraints: '1 <= N <= 1000, 0 <= w <= 10^6',
    timeLimitMs: 3000,
    memoryLimitMb: 256,
    samples: [
      { input: '3\n1 2 5\n2 3 7\n', output: '12', explanation: '5 + 7 = 12.' },
      { input: '1\n', output: '0', explanation: 'Single node has 0 edges.' },
    ],
    tests: [
      { id: 'TR-01', input: '1\n', expectedOutput: '0', marks: 0.5, kind: 'single' },
      { id: 'TR-02', input: '2\n1 2 10\n', expectedOutput: '10', marks: 1.0, kind: 'boundary' },
      {
        id: 'TR-03',
        input: '3\n1 2 4\n1 3 6\n',
        expectedOutput: '10',
        marks: 1.0,
        kind: 'general',
      },
      {
        id: 'TR-04',
        input: '4\n1 2 1\n2 3 2\n3 4 3\n',
        expectedOutput: '6',
        marks: 1.0,
        kind: 'general',
      },
      {
        id: 'TR-05',
        input: '4\n1 2 0\n1 3 0\n1 4 0\n',
        expectedOutput: '0',
        marks: 1.0,
        kind: 'corner',
      },
      {
        id: 'TR-06',
        input: '5\n1 2 5\n1 3 5\n2 4 5\n2 5 5\n',
        expectedOutput: '20',
        marks: 1.0,
        kind: 'duplicate',
      },
      {
        id: 'TR-07',
        input: '3\n1 2 100\n2 3 200\n',
        expectedOutput: '300',
        marks: 1.0,
        kind: 'general',
      },
      {
        id: 'TR-08',
        input: '3\n1 2 9\n2 3 11\n',
        expectedOutput: '20',
        marks: 1.0,
        kind: 'general',
      },
      { id: 'TR-09', input: '2\n1 2 999\n', expectedOutput: '999', marks: 1.0, kind: 'general' },
      {
        id: 'TR-10',
        inputGenerator: {
          language: 'python',
          code: 'n = 10\nprint(n)\nfor i in range(2, n + 1):\n    print(i - 1, i, i)\n',
        },
        expectedOutput: 'AUTO',
        marks: 1.5,
        kind: 'max',
      },
    ],
    referenceSolution: {
      language: 'python',
      code: `import sys
data = list(map(int, sys.stdin.read().split()))
if not data:
    print(0)
else:
    n = data[0]
    total = 0
    idx = 1
    for _ in range(n - 1):
        total += data[idx + 2]
        idx += 3
    print(total)
`,
    },
    explanation: 'Accumulate the weight of all N-1 tree edges in O(N) time.',
  };
  return paper;
}

async function setupJudgeHarness({ verifyImport = false } = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-prep-m9-'));
  tempDirs.push(dir);
  const encryptedPapersDir = path.join(dir, 'encrypted');
  const keyDir = path.join(dir, 'keys');
  const dbPath = path.join(dir, 'judge.db');

  let fakeNow = 1_700_000_000_000;
  const db = openDatabase({ dbPath });
  openDbs.push(db);
  const app = createApp({
    db,
    keyStore: createKeyStore({ keyDir, keytar: null }),
    encryptedPapersDir,
    codingVerifier: verifyImport
      ? verifyCodingTests
      : async () => ({ ok: true, failures: [], warnings: [] }),
    nowFn: () => fakeNow,
  });

  const paper = createTreePaper();
  const importRes = await request(app)
    .post('/api/papers/import')
    .attach('files', Buffer.from(JSON.stringify(paper), 'utf8'), 'tree.petdraft');
  expect(importRes.status).toBe(201);

  const attemptRes = await request(app)
    .post('/api/attempts')
    .send({ paperId: importRes.body.paper.id, violationLimit: 3 });
  const attemptId = attemptRes.body.attempt.id;

  // Fast-forward S1 & S2 to reach S2A
  await request(app).post(`/api/attempts/${attemptId}/start-section`).send({ section: 'S1' });
  await request(app).post(`/api/attempts/${attemptId}/submit-section`).send({});
  await request(app).post(`/api/attempts/${attemptId}/start-section`).send({ section: 'S2' });
  await request(app).post(`/api/attempts/${attemptId}/submit-section`).send({});
  await request(app).post(`/api/attempts/${attemptId}/start-section`).send({ section: 'S2A' });

  return {
    app,
    db,
    attemptId,
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

describe('M9 import verification and hidden-test judge', () => {
  it('verifyCodingTests resolves AUTO generated tests and catches a deliberately wrong expectedOutput', async () => {
    const goodPaper = createTreePaper();
    const okRes = await verifyCodingTests(goodPaper);
    expect(okRes.ok).toBe(true);
    expect(okRes.failures).toEqual([]);
    const resolvedLast = okRes.resolvedPaper.section2a.questions[1].tests[9];
    expect(resolvedLast.expectedOutput).toBe('54');
    expect(resolvedLast.inputGenerator).toBeUndefined();

    const badPaper = createTreePaper();
    badPaper.section2a.questions[1].tests[2].expectedOutput = '999999';
    const failRes = await verifyCodingTests(badPaper);
    expect(failRes.ok).toBe(false);
    expect(failRes.failures[0]).toMatchObject({
      code: 'REFERENCE_OUTPUT_MISMATCH',
      testId: 'TR-03',
      expectedOutput: '999999',
    });
  }, 120000);

  it('enforces /code/run rate limit and never leaks hidden tests in responses', async () => {
    const h = await setupJudgeHarness();

    const qRes = await request(h.app).get(`/api/attempts/${h.attemptId}/question`);
    expect(qRes.body.question.id).toBe('S2A-01');
    expect(qRes.body.question).not.toHaveProperty('tests');
    expect(qRes.body.question).not.toHaveProperty('referenceSolution');

    const run1 = await request(h.app).post(`/api/attempts/${h.attemptId}/code/run`).send({
      questionId: 'S2A-01',
      language: 'python',
      source: 'import sys\nprint(sys.stdin.read().strip())\n',
      stdin: '42\n',
    });
    expect(run1.status).toBe(200);
    expect(run1.body.status).toBe('ok');
    expect(run1.body.stdout.trim()).toBe('42');

    // Immediate second run within 3 seconds must be rate-limited
    const run2 = await request(h.app).post(`/api/attempts/${h.attemptId}/code/run`).send({
      questionId: 'S2A-01',
      language: 'python',
      source: 'print(1)\n',
      stdin: '42\n',
    });
    expect(run2.status).toBe(429);
    expect(run2.body.error.code).toBe('RATE_LIMITED');

    h.advanceTime(3500);
    const run3 = await request(h.app).post(`/api/attempts/${h.attemptId}/code/run`).send({
      questionId: 'S2A-01',
      language: 'python',
      source: 'print(99)\n',
      stdin: '42\n',
    });
    expect(run3.status).toBe(200);
  }, 60000);

  it('judges correct tree solutions in all 4 languages, partial wrong answers, TLE, RTE, and CE', async () => {
    const h = await setupJudgeHarness({ verifyImport: true });

    // Move to S2A-02 (the Tree Edge Weight Sum problem)
    await request(h.app)
      .post(`/api/attempts/${h.attemptId}/next`)
      .send({ unanswered: true, questionId: 'S2A-01' });

    const treeSolutions = [
      {
        language: 'c',
        source: `#include <stdio.h>
int main(void){
  int n; if(scanf("%d",&n)!=1) return 0;
  long long sum=0;
  for(int i=0;i<n-1;i++){ long long u,v,w; if(scanf("%lld %lld %lld",&u,&v,&w)==3) sum+=w; }
  printf("%lld\\n", sum);
  return 0;
}`,
      },
      {
        language: 'cpp',
        source: `#include <iostream>
int main(){
  int n; if(!(std::cin>>n)) return 0;
  long long sum=0;
  for(int i=0;i<n-1;i++){ long long u,v,w; std::cin>>u>>v>>w; sum+=w; }
  std::cout<<sum<<"\\n";
  return 0;
}`,
      },
      {
        language: 'java',
        source: `import java.util.*;
public class Main {
  public static void main(String[] args){
    Scanner sc = new Scanner(System.in);
    if(!sc.hasNextInt()) return;
    int n = sc.nextInt();
    long sum = 0;
    for(int i=0;i<n-1;i++){ sc.nextLong(); sc.nextLong(); sum += sc.nextLong(); }
    System.out.println(sum);
  }
}`,
      },
      {
        language: 'python',
        source: `import sys
d = list(map(int, sys.stdin.read().split()))
n = d[0] if d else 0
print(sum(d[3::3][:max(0, n-1)]))
`,
      },
    ];

    for (const sol of treeSolutions) {
      const subRes = await request(h.app).post(`/api/attempts/${h.attemptId}/code/submit`).send({
        questionId: 'S2A-02',
        language: sol.language,
        source: sol.source,
      });
      expect(subRes.status).toBe(200);
      expect(subRes.body.compile.ok).toBe(true);
      expect(subRes.body.passedCount).toBe(10);
      expect(subRes.body.totalTests).toBe(10);
      expect(subRes.body.marksObtained).toBe(10);

      // Assert hidden data is absent from every response test item
      for (const hiddenItem of subRes.body.tests) {
        expect(hiddenItem).not.toHaveProperty('input');
        expect(hiddenItem).not.toHaveProperty('expectedOutput');
        expect(hiddenItem).not.toHaveProperty('actualOutput');
      }
    }

    // Partial-mark wrong answer: outputs 10 (passes TR-02, TR-03, TR-06? TR-02=10 (1.0), TR-03=10 (1.0)) => 2.0 marks
    const partialRes = await request(h.app).post(`/api/attempts/${h.attemptId}/code/submit`).send({
      questionId: 'S2A-02',
      language: 'python',
      source: 'print(10)\n',
    });
    expect(partialRes.status).toBe(200);
    expect(partialRes.body.passedCount).toBe(2);
    expect(partialRes.body.marksObtained).toBe(2);

    // Compile error in C++
    const ceRes = await request(h.app).post(`/api/attempts/${h.attemptId}/code/submit`).send({
      questionId: 'S2A-02',
      language: 'cpp',
      source: 'int main() { broken syntax }',
    });
    expect(ceRes.status).toBe(200);
    expect(ceRes.body.compile.ok).toBe(false);
    expect(ceRes.body.tests.every((t) => t.status === 'ce')).toBe(true);

    // Runtime error in Python
    const rteRes = await request(h.app).post(`/api/attempts/${h.attemptId}/code/submit`).send({
      questionId: 'S2A-02',
      language: 'python',
      source: 'raise RuntimeError("boom")\n',
    });
    expect(rteRes.status).toBe(200);
    expect(rteRes.body.tests.every((t) => t.status === 'rte')).toBe(true);

    // TLE in Python (last submit becomes final)
    const tleRes = await request(h.app).post(`/api/attempts/${h.attemptId}/code/submit`).send({
      questionId: 'S2A-02',
      language: 'python',
      source: 'while True:\n    pass\n',
    });
    expect(tleRes.status).toBe(200);
    expect(tleRes.body.tests[0].status).toBe('tle');

    const finals = h.app.locals.repos.codingRepo.getFinalSubmissions(h.attemptId);
    expect(finals).toHaveLength(1);
    expect(finals[0].id).toBe(tleRes.body.submissionId);
  }, 240000);

  it('auto-submits and judges saved draft when Section 2a deadline expires', async () => {
    const h = await setupJudgeHarness({ verifyImport: true });

    const draftRes = await request(h.app).post(`/api/attempts/${h.attemptId}/code/draft`).send({
      questionId: 'S2A-01',
      language: 'python',
      source: 'import sys\nprint(sys.stdin.read().strip())\n',
    });
    expect(draftRes.status).toBe(200);

    // Expire Section 2a deadline
    h.advanceTime(50 * 60 * 1000 + 2000);

    const stateRes = await request(h.app).get(`/api/attempts/${h.attemptId}/state`);
    expect(stateRes.status).toBe(200);
    expect(stateRes.body.status).toBe('completed');

    const finalSub = h.app.locals.repos.codingRepo.getFinalSubmissionForQuestion(
      h.attemptId,
      'S2A-01'
    );
    expect(finalSub).not.toBeNull();
    const results = h.app.locals.repos.codingRepo.getTestResults(finalSub.id);
    expect(results).toHaveLength(10);
    expect(results.every((r) => r.passed === 1)).toBe(true);
  }, 120000);
});
