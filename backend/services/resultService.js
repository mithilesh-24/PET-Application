import { AppError } from '../middleware/errorHandler.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export function createResultService({ repos, examEngine, evaluationService }) {
  function requireEndedAttempt(attemptId) {
    const attempt = repos.attemptsRepo.getById(attemptId);
    if (!attempt) {
      throw new AppError(404, 'NOT_FOUND', `Attempt "${attemptId}" not found.`);
    }
    if (attempt.status !== 'completed' && attempt.status !== 'terminated') {
      throw new AppError(
        403,
        'NOT_FOUND',
        'Results and review are blocked until the attempt has ended.'
      );
    }
    return attempt;
  }

  async function getResult(attemptId, { forceRecompute = false } = {}) {
    const attempt = requireEndedAttempt(attemptId);
    const paperRow = repos.papersRepo.getById(attempt.paper_id);

    let stored = forceRecompute ? null : repos.resultsRepo.getByAttemptId(attemptId);
    let breakdown;

    if (!stored) {
      const evaluated = await evaluationService.evaluateAttempt(attemptId);
      stored = evaluated.result;
      breakdown = evaluated.breakdown;
    } else {
      breakdown = JSON.parse(stored.breakdown_json);
    }

    return {
      attemptId: attempt.id,
      paperId: paperRow?.paper_id || breakdown.paperId,
      paperTitle: paperRow?.title || breakdown.paperTitle,
      status: attempt.status,
      terminated: attempt.status === 'terminated',
      terminationReason: attempt.termination_reason,
      startedAt: attempt.started_at,
      endedAt: attempt.ended_at,
      computedAt: stored.computed_at,
      total: stored.total,
      section1: stored.section1,
      section2: stored.section2,
      section2a: stored.section2a,
      breakdown,
    };
  }

  async function getReview(attemptId) {
    const attempt = requireEndedAttempt(attemptId);
    const paperRow = repos.papersRepo.getById(attempt.paper_id);
    if (!paperRow) {
      throw new AppError(404, 'NOT_FOUND', 'Paper for this attempt no longer exists.');
    }

    const paperObj = await examEngine.loadDecryptedPaper(paperRow);
    const responses = repos.responsesRepo.getForAttempt(attemptId);
    const responseByQid = new Map(responses.map((r) => [r.question_id, r]));

    const items = [];

    for (const sec of ['S1', 'S2', 'S2A']) {
      const questions = examEngine.getOrderedSectionQuestions(paperObj, sec);
      for (const q of questions) {
        if (q.type === 'coding') {
          const finalSub = repos.codingRepo.getFinalSubmissionForQuestion(attemptId, q.id);
          const testResults = finalSub ? repos.codingRepo.getTestResults(finalSub.id) : [];
          const marksAwarded = Math.min(
            q.marks,
            round2(
              testResults.reduce(
                (sum, r) => sum + (r.passed === 1 ? Number(r.marks_awarded) : 0),
                0
              )
            )
          );
          const isUnanswered = !finalSub;
          const isCorrect = Boolean(finalSub) && marksAwarded >= q.marks;

          items.push({
            id: q.id,
            section: sec,
            type: 'coding',
            title: q.title,
            difficulty: q.difficulty,
            domain: q.domain,
            topic: q.topic,
            marks: q.marks,
            marksAwarded,
            isCorrect,
            isUnanswered,
            statement: q.statement,
            inputFormat: q.inputFormat,
            outputFormat: q.outputFormat,
            constraints: q.constraints,
            samples: q.samples,
            submittedLanguage: finalSub?.language || null,
            submittedSource: finalSub?.source || null,
            testResults: testResults.map((tr) => ({
              testId: tr.test_id,
              passed: tr.passed === 1,
              status: tr.status,
              runtimeMs: tr.runtime_ms,
              memoryKb: tr.memory_kb,
              marksAwarded: tr.marks_awarded,
            })),
            referenceSolution: q.referenceSolution,
            explanation: q.explanation,
          });
        } else {
          const resp = responseByQid.get(q.id);
          const selectedIndex = resp ? resp.selected_index : null;
          const isUnanswered = selectedIndex === null;
          const isCorrect = !isUnanswered && selectedIndex === q.answerIndex;
          items.push({
            id: q.id,
            section: sec,
            type: q.type,
            category: q.category,
            topic: q.topic,
            difficulty: q.difficulty,
            marks: q.marks,
            marksAwarded: isCorrect ? q.marks : 0,
            isCorrect,
            isUnanswered,
            text: q.text,
            language: q.language,
            code: q.code,
            options: q.options,
            selectedIndex,
            answerIndex: q.answerIndex,
            timeSpentMs: resp?.time_spent_ms ?? 0,
            explanation: q.explanation,
          });
        }
      }
    }

    return {
      attemptId: attempt.id,
      paperId: paperRow.paper_id,
      paperTitle: paperRow.title,
      status: attempt.status,
      items,
    };
  }

  return {
    getResult,
    getReview,
  };
}
