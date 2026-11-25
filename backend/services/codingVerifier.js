import { runSubmission, runSubmissionBatch } from '../compiler/executionEngine.js';
import { normaliseOutput, outputsMatch } from '../compiler/languageRunner.js';

export async function verifyCodingTests(
  paper,
  { runSubmissionFn = runSubmission, runSubmissionBatchFn = runSubmissionBatch } = {}
) {
  const resolvedPaper = structuredClone(paper);
  const codingQuestions = resolvedPaper?.section2a?.questions || [];
  const failures = [];
  const warnings = [];

  for (let qIdx = 0; qIdx < codingQuestions.length; qIdx += 1) {
    const q = codingQuestions[qIdx];
    const qPath = `section2a.questions[${qIdx}]`;
    const refLang = q.referenceSolution.language;
    const refCode = q.referenceSolution.code;

    // 1. Run any Python inputGenerator tests in the sandbox (5s limit, max 1 MB output)
    const generatedIndexes = [];
    for (let tIdx = 0; tIdx < q.tests.length; tIdx += 1) {
      const testCase = q.tests[tIdx];
      if (testCase.inputGenerator) {
        const genRes = await runSubmissionFn({
          language: 'python',
          source: testCase.inputGenerator.code,
          stdin: '',
          timeLimitMs: 5000,
          memoryLimitMb: 256,
        });

        if (genRes.run.status !== 'ok') {
          failures.push({
            path: `${qPath}.tests[${tIdx}]`,
            code: 'GENERATOR_FAILED',
            questionId: q.id,
            testId: testCase.id,
            expectedOutput: testCase.expectedOutput,
            actualOutput: genRes.run.stderr || genRes.run.stdout,
            message: `${q.id} test ${testCase.id}: inputGenerator failed (${genRes.run.status}): ${genRes.run.stderr || 'non-zero exit'}`,
          });
          continue;
        }

        testCase.input = genRes.run.stdout;
        delete testCase.inputGenerator;
        if (testCase.expectedOutput === 'AUTO') {
          generatedIndexes.push(tIdx);
        }
      }
    }

    if (failures.some((f) => f.questionId === q.id)) {
      continue;
    }

    // 2. If any test has expectedOutput === 'AUTO', compute it via the reference solution
    if (generatedIndexes.length > 0) {
      const autoBatch = await runSubmissionBatchFn({
        language: refLang,
        source: refCode,
        tests: generatedIndexes.map((idx) => ({ stdin: q.tests[idx].input || '' })),
        timeLimitMs: q.timeLimitMs,
        memoryLimitMb: q.memoryLimitMb,
      });

      if (!autoBatch.compile.ok) {
        failures.push({
          path: `${qPath}.referenceSolution`,
          code: 'REFERENCE_COMPILE_ERROR',
          questionId: q.id,
          testId: q.tests[generatedIndexes[0]].id,
          expectedOutput: 'AUTO',
          actualOutput: autoBatch.compile.stderr,
          message: `${q.id} referenceSolution failed to compile: ${autoBatch.compile.stderr}`,
        });
        continue;
      }

      generatedIndexes.forEach((tIdx, pos) => {
        const run = autoBatch.runs[pos];
        const testCase = q.tests[tIdx];
        if (run.status !== 'ok') {
          failures.push({
            path: `${qPath}.tests[${tIdx}]`,
            code: 'REFERENCE_RUNTIME_ERROR',
            questionId: q.id,
            testId: testCase.id,
            expectedOutput: 'AUTO',
            actualOutput: run.stderr || run.stdout,
            message: `${q.id} referenceSolution failed on generated test ${testCase.id} (${run.status}): ${run.stderr}`,
          });
        } else {
          testCase.expectedOutput = normaliseOutput(run.stdout);
        }
      });

      if (failures.some((f) => f.questionId === q.id)) {
        continue;
      }
    }

    // 3. Compile referenceSolution once and verify EVERY sample and hidden test
    const allChecks = [
      ...(q.samples || []).map((s, sIdx) => ({
        testId: `SAMPLE-${sIdx + 1}`,
        path: `${qPath}.samples[${sIdx}]`,
        stdin: s.input,
        expectedOutput: s.output,
      })),
      ...(q.tests || []).map((t, tIdx) => ({
        testId: t.id,
        path: `${qPath}.tests[${tIdx}]`,
        stdin: t.input || '',
        expectedOutput: t.expectedOutput,
      })),
    ];

    const verifyBatch = await runSubmissionBatchFn({
      language: refLang,
      source: refCode,
      tests: allChecks.map((c) => ({ stdin: c.stdin })),
      timeLimitMs: q.timeLimitMs,
      memoryLimitMb: q.memoryLimitMb,
    });

    if (!verifyBatch.compile.ok) {
      failures.push({
        path: `${qPath}.referenceSolution`,
        code: 'REFERENCE_COMPILE_ERROR',
        questionId: q.id,
        testId: allChecks[0]?.testId || 'COMPILE',
        expectedOutput: allChecks[0]?.expectedOutput || '',
        actualOutput: verifyBatch.compile.stderr,
        message: `${q.id} referenceSolution failed to compile: ${verifyBatch.compile.stderr}`,
      });
      continue;
    }

    allChecks.forEach((chk, idx) => {
      const run = verifyBatch.runs[idx];
      if (run.status !== 'ok') {
        failures.push({
          path: chk.path,
          code: 'REFERENCE_RUNTIME_ERROR',
          questionId: q.id,
          testId: chk.testId,
          expectedOutput: chk.expectedOutput,
          actualOutput: run.stderr || run.stdout,
          message: `${q.id} ${chk.testId}: referenceSolution ended with ${run.status} (${run.stderr || 'no stderr'}).`,
        });
      } else if (!outputsMatch(run.stdout, chk.expectedOutput)) {
        failures.push({
          path: chk.path,
          code: 'REFERENCE_OUTPUT_MISMATCH',
          questionId: q.id,
          testId: chk.testId,
          expectedOutput: chk.expectedOutput,
          actualOutput: run.stdout,
          message: `${q.id} ${chk.testId}: expected "${normaliseOutput(chk.expectedOutput)}" but referenceSolution printed "${normaliseOutput(run.stdout)}".`,
        });
      }
    });

    if (failures.some((f) => f.questionId === q.id)) {
      continue;
    }

    // 4. Weak-test sanity check with a trivial wrong solution (print 0)
    const trivialBatch = await runSubmissionBatchFn({
      language: 'python',
      source: 'print(0)\n',
      tests: (q.tests || []).map((t) => ({ stdin: t.input || '' })),
      timeLimitMs: 2000,
      memoryLimitMb: 128,
    });

    if (trivialBatch.compile.ok && q.tests.length > 0) {
      let trivialPassed = 0;
      q.tests.forEach((t, idx) => {
        const run = trivialBatch.runs[idx];
        if (run?.status === 'ok' && outputsMatch(run.stdout, t.expectedOutput)) {
          trivialPassed += 1;
        }
      });
      if (trivialPassed / q.tests.length > 0.3) {
        warnings.push({
          path: `${qPath}.tests`,
          code: 'WEAK_CODING_TESTS',
          questionId: q.id,
          message: `${q.id}: trivial "print(0)" passed ${trivialPassed} of ${q.tests.length} hidden tests (> 30%); consider stronger test cases.`,
        });
      }
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    resolvedPaper,
  };
}
