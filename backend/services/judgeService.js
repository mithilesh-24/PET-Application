import { runSubmission, runSubmissionBatch } from '../compiler/executionEngine.js';
import { outputsMatch } from '../compiler/languageRunner.js';
import { AppError } from '../middleware/errorHandler.js';

const MAX_CUSTOM_STDIN_BYTES = 8 * 1024;
const RUN_RATE_LIMIT_MS = 3000;

function mapDbStatus(runStatus, passed) {
  if (runStatus === 'ce') return 'ce';
  if (runStatus === 'tle') return 'tle';
  if (runStatus === 'rte' || runStatus === 'mle') return 'rte';
  return passed ? 'pass' : 'fail';
}

export function createJudgeService({
  repos,
  examEngine,
  runSubmissionFn = runSubmission,
  runSubmissionBatchFn = runSubmissionBatch,
  nowFn = () => Date.now(),
} = {}) {
  const lastRunByAttempt = new Map();

  async function requireOpenS2AQuestion(attemptId, questionId) {
    examEngine.reconcileAttempt(attemptId);
    const attempt = repos.attemptsRepo.getById(attemptId);
    if (!attempt) {
      throw new AppError(404, 'NOT_FOUND', `Attempt "${attemptId}" not found.`);
    }
    if (attempt.status === 'terminated') {
      throw new AppError(403, 'ATTEMPT_TERMINATED', 'Attempt has been terminated.');
    }

    const s2aState = repos.sectionStateRepo.getSection(attemptId, 'S2A');
    if (!s2aState || s2aState.status !== 'open') {
      throw new AppError(400, 'SECTION_LOCKED', 'Section 2a is not currently open.');
    }

    const now = nowFn();
    if (now >= s2aState.deadline_at) {
      throw new AppError(400, 'SECTION_EXPIRED', 'Section 2a deadline has expired.');
    }

    const paperRow = repos.papersRepo.getById(attempt.paper_id);
    if (!paperRow) {
      throw new AppError(404, 'NOT_FOUND', 'Paper not found.');
    }
    const paperObj = await examEngine.loadDecryptedPaper(paperRow);
    const ordered = examEngine.getOrderedSectionQuestions(paperObj, 'S2A');
    const currentQuestion = ordered[attempt.current_index];

    if (!currentQuestion || currentQuestion.id !== questionId) {
      throw new AppError(
        403,
        'BACKWARD_NAVIGATION_FORBIDDEN',
        `Can only act on the current coding question (${currentQuestion?.id || 'unknown'}).`
      );
    }

    return { attempt, question: currentQuestion, now };
  }

  async function runCustomCode({ attemptId, questionId, language, source, stdin = '' }) {
    if (Buffer.byteLength(stdin, 'utf8') > MAX_CUSTOM_STDIN_BYTES) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Custom input cannot exceed 8 KB.');
    }

    const { question, now } = await requireOpenS2AQuestion(attemptId, questionId);

    const lastRun = lastRunByAttempt.get(attemptId) || 0;
    if (now - lastRun < RUN_RATE_LIMIT_MS) {
      throw new AppError(429, 'RATE_LIMITED', 'Please wait at least 3 seconds between code runs.');
    }
    lastRunByAttempt.set(attemptId, now);

    const result = await runSubmissionFn({
      language,
      source,
      stdin,
      timeLimitMs: question.timeLimitMs,
      memoryLimitMb: question.memoryLimitMb,
    });

    return {
      compile: result.compile,
      status: result.compile.ok ? result.run.status : 'ce',
      stdout: result.run.stdout,
      stderr: result.run.stderr,
      exitCode: result.run.exitCode,
      ms: result.run.ms,
      memoryKb: result.run.memoryKb,
    };
  }

  async function saveDraft({ attemptId, questionId, language, source }) {
    const { now } = await requireOpenS2AQuestion(attemptId, questionId);
    const saved = repos.codingRepo.saveDraft({
      attempt_id: attemptId,
      question_id: questionId,
      language,
      source,
      saved_at: now,
    });
    return {
      saved: true,
      questionId,
      language,
      savedAt: saved.submitted_at,
    };
  }

  async function evaluateAndStoreSubmission({ attemptId, question, language, source, now }) {
    const samples = question.samples || [];
    const hiddenTests = question.tests || [];
    const allInputs = [
      ...samples.map((s) => ({ stdin: s.input || '' })),
      ...hiddenTests.map((t) => ({ stdin: t.input || '' })),
    ];

    const batch = await runSubmissionBatchFn({
      language,
      source,
      tests: allInputs,
      timeLimitMs: question.timeLimitMs,
      memoryLimitMb: question.memoryLimitMb,
    });

    const sampleRuns = batch.runs.slice(0, samples.length);
    const hiddenRuns = batch.runs.slice(samples.length);

    const sampleResults = samples.map((s, idx) => {
      const r = sampleRuns[idx];
      const passed = batch.compile.ok && r.status === 'ok' && outputsMatch(r.stdout, s.output);
      return {
        index: idx + 1,
        id: `SAMPLE-${idx + 1}`,
        label: `Sample ${idx + 1}`,
        kind: 'sample',
        passed,
        status: mapDbStatus(r.status, passed),
        runtimeMs: r.ms,
        memoryKb: r.memoryKb,
        input: s.input,
        sampleExpected: s.output,
        actualOutput: r.stdout,
      };
    });

    let passedCount = 0;
    let marksObtained = 0;
    let maxRuntimeMs = 0;

    const hiddenDbRows = [];
    const hiddenResponseRows = hiddenTests.map((t, idx) => {
      const r = hiddenRuns[idx];
      const passed =
        batch.compile.ok && r.status === 'ok' && outputsMatch(r.stdout, t.expectedOutput);
      const status = mapDbStatus(r.status, passed);
      const marksAwarded = passed ? t.marks : 0;

      if (passed) passedCount += 1;
      marksObtained += marksAwarded;
      if (r.ms > maxRuntimeMs) maxRuntimeMs = r.ms;

      hiddenDbRows.push({
        test_id: t.id,
        passed,
        status,
        runtime_ms: r.ms,
        memory_kb: r.memoryKb,
        marks_awarded: marksAwarded,
      });

      // Strictly omit input, expectedOutput, and actualOutput for hidden tests
      return {
        index: idx + 1,
        id: t.id,
        label: `Hidden ${idx + 1}`,
        kind: 'hidden',
        passed,
        status,
        runtimeMs: r.ms,
        memoryKb: r.memoryKb,
        marksAwarded,
        maxMarks: t.marks,
      };
    });

    const { submission } = repos.codingRepo.createSubmissionWithResults({
      submission: {
        attempt_id: attemptId,
        question_id: question.id,
        language,
        source,
        submitted_at: now,
      },
      testResults: hiddenDbRows,
    });

    return {
      submissionId: submission.id,
      questionId: question.id,
      language,
      compile: batch.compile,
      totalTests: hiddenTests.length,
      passedCount,
      marksObtained,
      totalMarks: question.marks || 10,
      runtimeMs: maxRuntimeMs,
      samples: sampleResults,
      tests: hiddenResponseRows,
    };
  }

  async function submitCode({ attemptId, questionId, language, source }) {
    const { question, now } = await requireOpenS2AQuestion(attemptId, questionId);
    return evaluateAndStoreSubmission({
      attemptId,
      question,
      language,
      source,
      now,
    });
  }

  async function autoSubmitUnsubmittedDrafts(attemptId) {
    const attempt = repos.attemptsRepo.getById(attemptId);
    if (!attempt) return;
    const paperRow = repos.papersRepo.getById(attempt.paper_id);
    if (!paperRow) return;
    const paperObj = await examEngine.loadDecryptedPaper(paperRow);
    const s2aQuestions = examEngine.getOrderedSectionQuestions(paperObj, 'S2A');

    for (const q of s2aQuestions) {
      const existingFinal = repos.codingRepo.getFinalSubmissionForQuestion(attemptId, q.id);
      if (existingFinal) continue;
      const latestDraft = repos.codingRepo.getLatestDraftForQuestion(attemptId, q.id);
      if (!latestDraft || !latestDraft.source || !latestDraft.source.trim()) continue;

      await evaluateAndStoreSubmission({
        attemptId,
        question: q,
        language: latestDraft.language,
        source: latestDraft.source,
        now: nowFn(),
      });
    }
  }

  return {
    runCustomCode,
    saveDraft,
    submitCode,
    autoSubmitUnsubmittedDrafts,
  };
}
