import { AppError } from '../middleware/errorHandler.js';

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const SUBJECT_NAMES = {
  CC01: 'Data Structures & Algorithms',
  CC02: 'Programming & OOPS (Java)',
  CC03: 'Database Management Systems',
  CC04: 'Operating Systems',
  CC05: 'Computer Networks',
};

export function createEvaluationService({ repos, examEngine, nowFn = () => Date.now() }) {
  async function evaluateAttempt(attemptId) {
    const attempt = repos.attemptsRepo.getById(attemptId);
    if (!attempt) {
      throw new AppError(404, 'NOT_FOUND', `Attempt "${attemptId}" not found.`);
    }
    if (attempt.status !== 'completed' && attempt.status !== 'terminated') {
      throw new AppError(
        403,
        'NOT_FOUND',
        'Results are not available until the attempt has ended.'
      );
    }

    const paperRow = repos.papersRepo.getById(attempt.paper_id);
    if (!paperRow) {
      throw new AppError(404, 'NOT_FOUND', 'Paper for this attempt no longer exists.');
    }

    const paperObj = await examEngine.loadDecryptedPaper(paperRow);
    const sections = repos.sectionStateRepo.getByAttempt(attemptId);
    const responses = repos.responsesRepo.getForAttempt(attemptId);
    const responseByQid = new Map(responses.map((r) => [r.question_id, r]));
    const violations = repos.violationsRepo.listForAttempt(attemptId);

    let correctCount = 0;
    let incorrectCount = 0;
    let unansweredCount = 0;

    const topicMap = new Map();
    function recordTopic(topicName, { attempted, correct, marksObtained, marksPossible }) {
      const key = topicName || 'General';
      if (!topicMap.has(key)) {
        topicMap.set(key, {
          topic: key,
          totalQuestions: 0,
          attempted: 0,
          correct: 0,
          marksObtained: 0,
          marksPossible: 0,
        });
      }
      const entry = topicMap.get(key);
      entry.totalQuestions += 1;
      if (attempted) entry.attempted += 1;
      if (correct) entry.correct += 1;
      entry.marksObtained = round2(entry.marksObtained + marksObtained);
      entry.marksPossible = round2(entry.marksPossible + marksPossible);
    }

    // Section 1
    const s1Questions = examEngine.getOrderedSectionQuestions(paperObj, 'S1');
    const categories = {
      aptitude: { obtained: 0, possible: 0 },
      reasoning: { obtained: 0, possible: 0 },
      verbal: { obtained: 0, possible: 0 },
    };
    let section1Score = 0;

    for (const q of s1Questions) {
      const resp = responseByQid.get(q.id);
      const answered = Boolean(resp && resp.selected_index !== null);
      const isCorrect = answered && resp.selected_index === q.answerIndex;
      const awarded = isCorrect ? q.marks : 0;

      section1Score = round2(section1Score + awarded);
      if (categories[q.category]) {
        categories[q.category].possible = round2(categories[q.category].possible + q.marks);
        categories[q.category].obtained = round2(categories[q.category].obtained + awarded);
      }

      if (!answered) unansweredCount += 1;
      else if (isCorrect) correctCount += 1;
      else incorrectCount += 1;

      recordTopic(q.topic, {
        attempted: answered,
        correct: isCorrect,
        marksObtained: awarded,
        marksPossible: q.marks,
      });
    }

    // Section 2
    const s2Questions = examEngine.getOrderedSectionQuestions(paperObj, 'S2');
    const subjects = Object.fromEntries(
      Object.entries(SUBJECT_NAMES).map(([code, name]) => [
        code,
        { code, name, obtained: 0, possible: 0 },
      ])
    );
    const snippets = { obtained: 0, possible: 0 };
    let section2Score = 0;

    for (const q of s2Questions) {
      const resp = responseByQid.get(q.id);
      const answered = Boolean(resp && resp.selected_index !== null);
      const isCorrect = answered && resp.selected_index === q.answerIndex;
      const awarded = isCorrect ? q.marks : 0;

      section2Score = round2(section2Score + awarded);
      if (q.type === 'snippet') {
        snippets.possible = round2(snippets.possible + q.marks);
        snippets.obtained = round2(snippets.obtained + awarded);
      } else if (subjects[q.category]) {
        subjects[q.category].possible = round2(subjects[q.category].possible + q.marks);
        subjects[q.category].obtained = round2(subjects[q.category].obtained + awarded);
      }

      if (!answered) unansweredCount += 1;
      else if (isCorrect) correctCount += 1;
      else incorrectCount += 1;

      recordTopic(q.topic, {
        attempted: answered,
        correct: isCorrect,
        marksObtained: awarded,
        marksPossible: q.marks,
      });
    }

    // Section 2a
    const s2aQuestions = examEngine.getOrderedSectionQuestions(paperObj, 'S2A');
    let section2aScore = 0;
    let codingTestsPassed = 0;
    let codingTestsTotal = 0;
    const codingProblems = [];

    for (const q of s2aQuestions) {
      const finalSub = repos.codingRepo.getFinalSubmissionForQuestion(attemptId, q.id);
      const hiddenTotal = (q.tests || []).length;
      codingTestsTotal += hiddenTotal;

      let problemMarks = 0;
      let passedCount = 0;

      if (finalSub) {
        const testResults = repos.codingRepo.getTestResults(finalSub.id);
        for (const tr of testResults) {
          if (tr.passed === 1) {
            passedCount += 1;
            problemMarks = round2(problemMarks + tr.marks_awarded);
          }
        }
        problemMarks = Math.min(q.marks, problemMarks);
        codingTestsPassed += passedCount;
        section2aScore = round2(section2aScore + problemMarks);

        const isFullPass = problemMarks >= q.marks;
        if (isFullPass) correctCount += 1;
        else incorrectCount += 1;

        recordTopic(q.topic, {
          attempted: true,
          correct: isFullPass,
          marksObtained: problemMarks,
          marksPossible: q.marks,
        });
      } else {
        unansweredCount += 1;
        recordTopic(q.topic, {
          attempted: false,
          correct: false,
          marksObtained: 0,
          marksPossible: q.marks,
        });
      }

      codingProblems.push({
        id: q.id,
        title: q.title,
        difficulty: q.difficulty,
        topic: q.topic,
        submitted: Boolean(finalSub),
        language: finalSub?.language || null,
        marksObtained: problemMarks,
        marksPossible: q.marks,
        testsPassed: passedCount,
        testsTotal: hiddenTotal,
      });
    }

    const sectionTimeMs = (secName) => {
      const s = sections.find((item) => item.section === secName);
      if (!s || s.started_at == null || s.submitted_at == null) return 0;
      return Math.max(0, s.submitted_at - s.started_at);
    };

    const s1Ms = sectionTimeMs('S1');
    const s2Ms = sectionTimeMs('S2');
    const s2aMs = sectionTimeMs('S2A');
    const totalMs = s1Ms + s2Ms + s2aMs;

    const totalScore = round2(section1Score + section2Score + section2aScore);
    const percentage = round2((totalScore / 100) * 100);

    const breakdown = {
      attemptId: attempt.id,
      paperId: paperRow.paper_id,
      paperTitle: paperRow.title,
      status: attempt.status,
      terminated: attempt.status === 'terminated',
      terminationReason: attempt.termination_reason,
      total: totalScore,
      maxTotal: 100,
      percentage,
      sections: {
        S1: { obtained: section1Score, possible: 40, timeMs: s1Ms },
        S2: { obtained: section2Score, possible: 40, timeMs: s2Ms },
        S2A: { obtained: section2aScore, possible: 20, timeMs: s2aMs },
      },
      categories,
      subjects,
      snippets,
      coding: {
        obtained: section2aScore,
        possible: 20,
        testsPassed: codingTestsPassed,
        testsTotal: codingTestsTotal,
        problems: codingProblems,
      },
      counts: {
        totalQuestions: 67,
        correct: correctCount,
        incorrect: incorrectCount,
        unanswered: unansweredCount,
      },
      time: {
        section1Ms: s1Ms,
        section2Ms: s2Ms,
        section2aMs: s2aMs,
        totalMs,
      },
      topics: Array.from(topicMap.values()),
      violations: violations.map((v) => ({
        id: v.id,
        type: v.type,
        at: v.at,
        section: v.section,
        questionId: v.question_id,
      })),
    };

    const stored = repos.resultsRepo.upsert({
      attempt_id: attemptId,
      total: totalScore,
      section1: section1Score,
      section2: section2Score,
      section2a: section2aScore,
      breakdown_json: JSON.stringify(breakdown),
      computed_at: nowFn(),
    });

    return {
      result: stored,
      breakdown,
    };
  }

  return {
    evaluateAttempt,
  };
}
