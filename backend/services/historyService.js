import { AppError } from '../middleware/errorHandler.js';

const LETTERS = ['A', 'B', 'C', 'D'];
const PAST_STATUSES = new Set(['completed', 'terminated', 'abandoned']);

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function escapeCsvCell(value) {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function createHistoryService({ repos, resultService, nowFn = () => Date.now() }) {
  async function ensureEvaluatedRows() {
    const rows = repos.resultsRepo.listAllWithAttempts();
    for (const row of rows) {
      if ((row.status === 'completed' || row.status === 'terminated') && !row.breakdown_json) {
        try {
          await resultService.getResult(row.id);
        } catch {
          // Ignore if paper is missing or attempt cannot be scored
        }
      }
    }
    return repos.resultsRepo.listAllWithAttempts();
  }

  async function listHistory() {
    const rows = await ensureEvaluatedRows();
    const attempts = [];

    for (const row of rows) {
      if (!PAST_STATUSES.has(row.status)) continue;

      let breakdown = null;
      if (row.breakdown_json) {
        try {
          breakdown = JSON.parse(row.breakdown_json);
        } catch {
          breakdown = null;
        }
      }

      const fallbackDuration =
        row.started_at != null && row.ended_at != null ? Math.max(0, row.ended_at - row.started_at) : 0;
      const durationMs = breakdown?.time?.totalMs ?? fallbackDuration;

      attempts.push({
        attemptId: row.id,
        paperDbId: row.paper_id,
        paperId: row.external_paper_id || breakdown?.paperId || '',
        paperTitle: row.paper_title || breakdown?.paperTitle || 'Untitled Paper',
        status: row.status,
        terminationReason: row.termination_reason || null,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        date: row.ended_at || row.started_at || row.computed_at || null,
        durationMs,
        total: row.total ?? null,
        section1: row.section1 ?? null,
        section2: row.section2 ?? null,
        section2a: row.section2a ?? null,
        hasResult: row.total !== null && row.total !== undefined,
      });
    }

    return { attempts };
  }

  async function getAnalytics() {
    const rows = await ensureEvaluatedRows();
    const topicAgg = new Map();
    let totalAttempts = 0;

    for (const row of rows) {
      if (row.status !== 'completed' && row.status !== 'terminated') continue;
      if (!row.breakdown_json) continue;

      let breakdown;
      try {
        breakdown = JSON.parse(row.breakdown_json);
      } catch {
        continue;
      }

      totalAttempts += 1;
      for (const t of breakdown.topics || []) {
        const key = t.topic || 'General';
        if (!topicAgg.has(key)) {
          topicAgg.set(key, {
            topic: key,
            totalQuestions: 0,
            attempted: 0,
            correct: 0,
            marksObtained: 0,
            marksPossible: 0,
            attemptsCount: 0,
          });
        }
        const agg = topicAgg.get(key);
        agg.totalQuestions += Number(t.totalQuestions) || 0;
        agg.attempted += Number(t.attempted) || 0;
        agg.correct += Number(t.correct) || 0;
        agg.marksObtained = round2(agg.marksObtained + (Number(t.marksObtained) || 0));
        agg.marksPossible = round2(agg.marksPossible + (Number(t.marksPossible) || 0));
        if ((Number(t.attempted) || 0) > 0) {
          agg.attemptsCount += 1;
        }
      }
    }

    if (totalAttempts === 0) {
      return {
        totalAttempts: 0,
        topics: [],
        recommendations: [],
      };
    }

    const topics = Array.from(topicAgg.values()).map((entry) => {
      const enoughData = entry.attempted >= 3;
      const accuracyPercent = enoughData
        ? Math.round((entry.correct / entry.attempted) * 100)
        : null;
      const statusText = enoughData
        ? `${accuracyPercent}% (${entry.correct} of ${entry.attempted})`
        : 'not enough data';

      return {
        topic: entry.topic,
        totalQuestions: entry.totalQuestions,
        attempted: entry.attempted,
        correct: entry.correct,
        marksObtained: entry.marksObtained,
        marksPossible: entry.marksPossible,
        attemptsCount: entry.attemptsCount,
        enoughData,
        accuracyPercent,
        statusText,
      };
    });

    topics.sort((a, b) => {
      if (a.enoughData !== b.enoughData) return a.enoughData ? -1 : 1;
      if (a.enoughData && b.enoughData) {
        if (a.accuracyPercent !== b.accuracyPercent) return a.accuracyPercent - b.accuracyPercent;
        if (a.attempted !== b.attempted) return b.attempted - a.attempted;
      }
      return a.topic.localeCompare(b.topic);
    });

    const recommendations = topics
      .filter((t) => t.enoughData && t.accuracyPercent < 100)
      .slice(0, 5)
      .map(
        (t) =>
          `Practise ${t.topic}: ${t.accuracyPercent}% across ${t.attemptsCount} ${
            t.attemptsCount === 1 ? 'attempt' : 'attempts'
          }`
      );

    return {
      totalAttempts,
      topics,
      recommendations,
    };
  }

  async function compareAttempts(rawIds) {
    const ids = (Array.isArray(rawIds) ? rawIds : String(rawIds || '').split(','))
      .map((s) => s.trim())
      .filter(Boolean);

    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length < 2 || uniqueIds.length > 4) {
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Select between 2 and 4 distinct ended attempts to compare.'
      );
    }

    const compared = [];
    for (const id of uniqueIds) {
      const attempt = repos.attemptsRepo.getById(id);
      if (!attempt) {
        throw new AppError(404, 'NOT_FOUND', `Attempt "${id}" not found.`);
      }
      if (attempt.status !== 'completed' && attempt.status !== 'terminated') {
        throw new AppError(
          400,
          'VALIDATION_ERROR',
          `Attempt "${id}" (${attempt.status}) does not have completed score data to compare.`
        );
      }
      const res = await resultService.getResult(id);
      const b = res.breakdown;
      compared.push({
        attemptId: res.attemptId,
        paperId: res.paperId,
        paperTitle: res.paperTitle,
        status: res.status,
        startedAt: res.startedAt,
        endedAt: res.endedAt,
        durationMs: b.time?.totalMs ?? 0,
        total: res.total,
        percentage: b.percentage,
        section1: res.section1,
        section2: res.section2,
        section2a: res.section2a,
        categories: b.categories,
        snippets: b.snippets,
        subjects: b.subjects,
        coding: {
          obtained: b.coding?.obtained ?? res.section2a,
          possible: b.coding?.possible ?? 20,
          testsPassed: b.coding?.testsPassed ?? 0,
          testsTotal: b.coding?.testsTotal ?? 0,
        },
        counts: b.counts,
        violationCount: (b.violations || []).length,
      });
    }

    compared.sort((a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0));
    return { attempts: compared };
  }

  async function exportAttempt(attemptId, format = 'json') {
    if (format !== 'json' && format !== 'csv') {
      throw new AppError(400, 'VALIDATION_ERROR', 'Export format must be json or csv.');
    }

    const result = await resultService.getResult(attemptId);
    const review = await resultService.getReview(attemptId);

    // Strip answer keys, hidden test expectations, reference solutions, and raw question paper text/options
    const safeResponses = review.items.map((item) => {
      const outcome = item.isUnanswered ? 'unanswered' : item.isCorrect ? 'correct' : 'incorrect';
      if (item.type === 'coding') {
        const testsPassed = (item.testResults || []).filter((t) => t.passed).length;
        const testsTotal = (item.testResults || []).length;
        return {
          questionId: item.id,
          section: item.section,
          type: item.type,
          category: item.domain ?? null,
          topic: item.topic,
          difficulty: item.difficulty,
          marks: item.marks,
          marksAwarded: item.marksAwarded,
          outcome,
          isCorrect: item.isCorrect,
          isUnanswered: item.isUnanswered,
          submittedLanguage: item.submittedLanguage,
          testsPassed,
          testsTotal,
          testResults: item.testResults,
        };
      }
      return {
        questionId: item.id,
        section: item.section,
        type: item.type,
        category: item.category ?? null,
        topic: item.topic,
        difficulty: item.difficulty,
        marks: item.marks,
        marksAwarded: item.marksAwarded,
        outcome,
        isCorrect: item.isCorrect,
        isUnanswered: item.isUnanswered,
        selectedIndex: item.selectedIndex,
        selectedOption: item.selectedIndex !== null ? LETTERS[item.selectedIndex] ?? null : null,
        timeSpentMs: item.timeSpentMs ?? 0,
      };
    });

    if (format === 'json') {
      const payload = {
        exportVersion: 1,
        exportedAt: new Date(nowFn()).toISOString(),
        result,
        responses: safeResponses,
      };
      return {
        filename: `pet-prep-attempt-${attemptId}.json`,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify(payload, null, 2),
      };
    }

    const header = [
      'attemptId',
      'questionId',
      'section',
      'type',
      'category',
      'topic',
      'difficulty',
      'marks',
      'marksAwarded',
      'outcome',
      'selectedOption',
      'submittedLanguage',
      'timeSpentMs',
      'testsPassed',
      'testsTotal',
    ].join(',');

    const lines = [header];
    for (const r of safeResponses) {
      lines.push(
        [
          attemptId,
          r.questionId,
          r.section,
          r.type,
          r.category ?? '',
          r.topic ?? '',
          r.difficulty ?? '',
          r.marks,
          r.marksAwarded,
          r.outcome,
          r.selectedOption ?? '',
          r.submittedLanguage ?? '',
          r.timeSpentMs ?? '',
          r.testsPassed ?? '',
          r.testsTotal ?? '',
        ]
          .map(escapeCsvCell)
          .join(',')
      );
    }

    return {
      filename: `pet-prep-attempt-${attemptId}.csv`,
      contentType: 'text/csv; charset=utf-8',
      body: lines.join('\n'),
    };
  }

  function deleteAttempt(attemptId) {
    const attempt = repos.attemptsRepo.getById(attemptId);
    if (!attempt) {
      throw new AppError(404, 'NOT_FOUND', `Attempt "${attemptId}" not found.`);
    }
    const deleted = repos.attemptsRepo.deleteById(attemptId);
    return { deleted, id: attemptId };
  }

  return {
    listHistory,
    getAnalytics,
    compareAttempts,
    exportAttempt,
    deleteAttempt,
  };
}
