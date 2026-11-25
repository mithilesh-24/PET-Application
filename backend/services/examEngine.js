import path from 'node:path';
import { config } from '../config.js';
import { AppError } from '../middleware/errorHandler.js';
import { readAndDecryptPaper } from './decryptionService.js';
import { defaultKeyStore } from './keyStore.js';

export const SECTION_ORDER = ['S1', 'S2', 'S2A'];
export const TRANSITION_GRACE_MS = 60 * 1000;
export const DEFAULT_SECTION_DURATION_MS = 50 * 60 * 1000;

export function getDefaultSectionDurationMs() {
  const overrideMinutes = Number(process.env.PET_TEST_SECTION_MINUTES);
  if (Number.isFinite(overrideMinutes) && overrideMinutes > 0) {
    return Math.round(overrideMinutes * 60 * 1000);
  }
  return DEFAULT_SECTION_DURATION_MS;
}

export function getOrderedSectionQuestions(paper, section) {
  if (section === 'S1') {
    const order = { aptitude: 0, reasoning: 1, verbal: 2 };
    return [...(paper.section1?.questions || [])].sort(
      (a, b) => (order[a.category] ?? 9) - (order[b.category] ?? 9)
    );
  }
  if (section === 'S2') {
    const subjectOrder = { CC01: 0, CC02: 1, CC03: 2, CC04: 3, CC05: 4 };
    const dept = [...(paper.section2?.departmentMcqs || [])].sort(
      (a, b) => (subjectOrder[a.category] ?? 9) - (subjectOrder[b.category] ?? 9)
    );
    const snippets = [...(paper.section2?.snippets || [])];
    return [...dept, ...snippets];
  }
  if (section === 'S2A') {
    const diffOrder = { medium: 0, hard: 1 };
    return [...(paper.section2a?.questions || [])].sort(
      (a, b) => (diffOrder[a.difficulty] ?? 9) - (diffOrder[b.difficulty] ?? 9)
    );
  }
  return [];
}

export function sanitizeQuestionForClient(question) {
  if (!question) return null;
  if (question.type === 'mcq') {
    return {
      id: question.id,
      type: 'mcq',
      category: question.category,
      topic: question.topic,
      difficulty: question.difficulty,
      marks: question.marks,
      text: question.text,
      options: [...question.options],
    };
  }
  if (question.type === 'snippet') {
    return {
      id: question.id,
      type: 'snippet',
      category: question.category,
      topic: question.topic,
      difficulty: question.difficulty,
      marks: question.marks,
      language: question.language,
      code: question.code,
      text: question.text,
      options: [...question.options],
    };
  }
  if (question.type === 'coding') {
    return {
      id: question.id,
      type: 'coding',
      title: question.title,
      difficulty: question.difficulty,
      domain: question.domain,
      isTreeOrGraph: question.isTreeOrGraph,
      topic: question.topic,
      marks: question.marks,
      statement: question.statement,
      inputFormat: question.inputFormat,
      outputFormat: question.outputFormat,
      constraints: question.constraints,
      timeLimitMs: question.timeLimitMs,
      memoryLimitMb: question.memoryLimitMb,
      samples: (question.samples || []).map((s) => ({
        input: s.input,
        output: s.output,
        explanation: s.explanation,
      })),
    };
  }
  return null;
}

export function createExamEngine({
  db,
  repos,
  keyStore = defaultKeyStore,
  nowFn = () => Date.now(),
  sectionDurationMs = getDefaultSectionDurationMs(),
  transitionGraceMs = TRANSITION_GRACE_MS,
  onAttemptCompleted = null,
} = {}) {
  const decryptedPaperCache = new Map();

  async function loadDecryptedPaper(paperRow) {
    if (decryptedPaperCache.has(paperRow.id)) {
      return decryptedPaperCache.get(paperRow.id);
    }
    const paperObj = await readAndDecryptPaper(paperRow.file_path, {
      keyStore,
      keyId: paperRow.key_id,
    });
    decryptedPaperCache.set(paperRow.id, paperObj);
    return paperObj;
  }

  function getAttemptAndPaperOrThrow(attemptId) {
    const attempt = repos.attemptsRepo.getById(attemptId);
    if (!attempt) {
      throw new AppError(404, 'NOT_FOUND', `Attempt "${attemptId}" not found.`);
    }
    const paperRow = repos.papersRepo.getById(attempt.paper_id);
    if (!paperRow) {
      throw new AppError(404, 'NOT_FOUND', 'Paper for this attempt no longer exists.');
    }
    return { attempt, paperRow };
  }

  function triggerCompletionHook(attemptId) {
    if (typeof onAttemptCompleted === 'function') {
      Promise.resolve(onAttemptCompleted(attemptId)).catch((err) => {
        if (process.env.NODE_ENV !== 'test') {
          console.error('[examEngine] completion hook error:', err);
        }
      });
    }
  }

  function findNextSection(sectionName) {
    const idx = SECTION_ORDER.indexOf(sectionName);
    return idx >= 0 && idx + 1 < SECTION_ORDER.length ? SECTION_ORDER[idx + 1] : null;
  }

  const reconcileTx = db.transaction((attemptId, now) => {
    let attempt = repos.attemptsRepo.getById(attemptId);
    if (!attempt) return null;
    if (
      attempt.status === 'completed' ||
      attempt.status === 'terminated' ||
      attempt.status === 'abandoned'
    ) {
      return { attempt, completedNow: false };
    }

    let sections = repos.sectionStateRepo.getByAttempt(attemptId);
    let completedNow = false;
    let progressed = true;

    while (progressed) {
      progressed = false;
      sections = repos.sectionStateRepo.getByAttempt(attemptId);

      // 1. Auto-expire any open section past its deadline
      const openSec = sections.find((s) => s.status === 'open');
      if (openSec && now >= openSec.deadline_at) {
        const expiredAt = openSec.deadline_at;
        repos.sectionStateRepo.updateSection(attemptId, openSec.section, {
          status: 'expired',
          submitted_at: expiredAt,
        });

        const nextSec = findNextSection(openSec.section);
        if (!nextSec) {
          repos.attemptsRepo.updateState(attemptId, {
            status: 'completed',
            ended_at: expiredAt,
            current_section: null,
            current_index: 0,
          });
          completedNow = true;
          break;
        } else {
          repos.attemptsRepo.updateState(attemptId, {
            current_section: null,
            current_index: 0,
          });
        }
        progressed = true;
        continue;
      }

      // 2. If no section is open, and a submitted/expired section is followed by a locked section,
      //    auto-start the next section once transitionGraceMs (60s) has elapsed.
      if (!openSec && attempt.status === 'running') {
        const nextLocked = sections.find((s) => s.status === 'locked');
        if (nextLocked) {
          const prevIdx = SECTION_ORDER.indexOf(nextLocked.section) - 1;
          const prevSec =
            prevIdx >= 0 ? sections.find((s) => s.section === SECTION_ORDER[prevIdx]) : null;
          if (
            prevSec &&
            (prevSec.status === 'submitted' || prevSec.status === 'expired') &&
            prevSec.submitted_at !== null
          ) {
            const autoStartAt = prevSec.submitted_at + transitionGraceMs;
            if (now >= autoStartAt) {
              repos.sectionStateRepo.updateSection(attemptId, nextLocked.section, {
                status: 'open',
                started_at: autoStartAt,
                deadline_at: autoStartAt + sectionDurationMs,
              });
              repos.attemptsRepo.updateState(attemptId, {
                current_section: nextLocked.section,
                current_index: 0,
              });
              attempt = repos.attemptsRepo.getById(attemptId);
              progressed = true;
            }
          }
        }
      }
    }

    return {
      attempt: repos.attemptsRepo.getById(attemptId),
      completedNow,
    };
  });

  function reconcileAttempt(attemptId) {
    const now = nowFn();
    const res = reconcileTx(attemptId, now);
    if (res?.completedNow) {
      triggerCompletionHook(attemptId);
    }
    return res?.attempt || null;
  }

  function reconcileAllOpenAttempts() {
    const activeRows = db.prepare("SELECT id FROM attempts WHERE status = 'running'").all();
    for (const row of activeRows) {
      reconcileAttempt(row.id);
    }
  }

  function createAttempt({ paperId, violationLimit }) {
    const paper = repos.papersRepo.getById(paperId) || repos.papersRepo.getByPaperId(paperId);
    if (!paper) {
      throw new AppError(404, 'NOT_FOUND', `Paper "${paperId}" not found.`);
    }

    const attempt = repos.attemptsRepo.create({
      paper_id: paper.id,
      status: 'not_started',
      violation_limit: violationLimit ?? config.violationLimit,
      current_section: null,
      current_index: 0,
    });

    return {
      id: attempt.id,
      paperId: paper.paper_id,
      paperDbId: paper.id,
      paperTitle: paper.title,
      status: attempt.status,
      violationLimit: attempt.violation_limit,
    };
  }

  function computeSectionAnswerCounts(attemptId, section, totalInSection, paperObj) {
    if (section === 'S2A') {
      const finals = repos.codingRepo.getFinalSubmissions(attemptId);
      const answeredIds = new Set(finals.map((f) => f.question_id));
      const answeredCount = answeredIds.size;
      return {
        answeredCount,
        unansweredCount: Math.max(0, totalInSection - answeredCount),
      };
    }
    const responses = repos.responsesRepo.getForSection(attemptId, section);
    const validIds = new Set(getOrderedSectionQuestions(paperObj, section).map((q) => q.id));
    const answeredCount = responses.filter(
      (r) => validIds.has(r.question_id) && r.selected_index !== null
    ).length;
    return {
      answeredCount,
      unansweredCount: Math.max(0, totalInSection - answeredCount),
    };
  }

  async function getState(attemptId) {
    reconcileAttempt(attemptId);
    const { attempt, paperRow } = getAttemptAndPaperOrThrow(attemptId);
    const paperObj = await loadDecryptedPaper(paperRow);
    const sections = repos.sectionStateRepo.getByAttempt(attemptId);
    const violationCount = repos.violationsRepo.countForAttempt(attemptId);
    const now = nowFn();

    const openSec = sections.find((s) => s.status === 'open') || null;
    const nextLocked = sections.find((s) => s.status === 'locked') || null;

    let phase = 'not_started';
    if (attempt.status === 'terminated') phase = 'terminated';
    else if (attempt.status === 'completed') phase = 'completed';
    else if (openSec) phase = 'in_section';
    else if (attempt.status === 'running' && nextLocked) phase = 'transition';

    let lastSubmittedSection = null;
    const doneSections = sections.filter((s) => s.status === 'submitted' || s.status === 'expired');
    if (doneSections.length > 0) {
      const last = doneSections[doneSections.length - 1];
      const total = getOrderedSectionQuestions(paperObj, last.section).length;
      const counts = computeSectionAnswerCounts(attemptId, last.section, total, paperObj);
      lastSubmittedSection = {
        section: last.section,
        status: last.status,
        submittedAt: last.submitted_at,
        totalInSection: total,
        ...counts,
      };
    }

    let transitionDeadlineAt = null;
    let transitionSecondsRemaining = 0;
    if (phase === 'transition' && lastSubmittedSection?.submittedAt != null) {
      transitionDeadlineAt = lastSubmittedSection.submittedAt + transitionGraceMs;
      transitionSecondsRemaining = Math.max(0, Math.ceil((transitionDeadlineAt - now) / 1000));
    }

    let totalInSection = 0;
    let answeredCount = 0;
    let unansweredCount = 0;
    let deadlineAt = null;
    let secondsRemaining = 0;

    if (openSec) {
      const qs = getOrderedSectionQuestions(paperObj, openSec.section);
      totalInSection = qs.length;
      const counts = computeSectionAnswerCounts(
        attemptId,
        openSec.section,
        totalInSection,
        paperObj
      );
      answeredCount = counts.answeredCount;
      unansweredCount = counts.unansweredCount;
      deadlineAt = openSec.deadline_at;
      secondsRemaining = Math.max(0, Math.ceil((openSec.deadline_at - now) / 1000));
    }

    return {
      attemptId: attempt.id,
      paperId: paperRow.paper_id,
      paperTitle: paperRow.title,
      status: attempt.status,
      phase,
      violationLimit: attempt.violation_limit,
      violationCount,
      terminationReason: attempt.termination_reason,
      currentSection: openSec ? openSec.section : null,
      currentIndex: openSec ? attempt.current_index : 0,
      totalInSection,
      answeredCount,
      unansweredCount,
      nextSection: nextLocked ? nextLocked.section : null,
      lastSubmittedSection,
      transitionDeadlineAt,
      transitionSecondsRemaining,
      deadlineAt,
      secondsRemaining,
      serverNow: now,
      sectionStates: sections.map((s) => ({
        section: s.section,
        status: s.status,
        startedAt: s.started_at,
        deadlineAt: s.deadline_at,
        submittedAt: s.submitted_at,
      })),
    };
  }

  const startSectionTx = db.transaction((attemptId, requestedSection, now) => {
    const attempt = repos.attemptsRepo.getById(attemptId);
    if (!attempt) {
      throw new AppError(404, 'NOT_FOUND', `Attempt "${attemptId}" not found.`);
    }
    if (attempt.status === 'terminated') {
      throw new AppError(403, 'ATTEMPT_TERMINATED', 'Attempt has been terminated.');
    }
    if (attempt.status === 'completed') {
      throw new AppError(400, 'SECTION_LOCKED', 'Attempt has already been completed.');
    }

    const sections = repos.sectionStateRepo.getByAttempt(attemptId);
    const openSec = sections.find((s) => s.status === 'open');
    if (openSec) {
      throw new AppError(
        409,
        'SECTION_LOCKED',
        `Section ${openSec.section} is still open and must be submitted first.`
      );
    }

    const nextLocked = sections.find((s) => s.status === 'locked');
    if (!nextLocked) {
      throw new AppError(400, 'SECTION_LOCKED', 'No locked sections remain to start.');
    }

    if (requestedSection && requestedSection !== nextLocked.section) {
      throw new AppError(
        403,
        'SECTION_LOCKED',
        `Cannot start section ${requestedSection}; next allowed section is ${nextLocked.section}.`
      );
    }

    const deadlineAt = now + sectionDurationMs;
    repos.sectionStateRepo.updateSection(attemptId, nextLocked.section, {
      status: 'open',
      started_at: now,
      deadline_at: deadlineAt,
    });
    repos.attemptsRepo.updateState(attemptId, {
      status: 'running',
      started_at: attempt.started_at ?? now,
      current_section: nextLocked.section,
      current_index: 0,
    });

    return { section: nextLocked.section, startedAt: now, deadlineAt };
  });

  async function startSection(attemptId, requestedSection = undefined) {
    reconcileAttempt(attemptId);
    const now = nowFn();
    startSectionTx(attemptId, requestedSection, now);
    return getState(attemptId);
  }

  async function getCurrentQuestion(attemptId) {
    reconcileAttempt(attemptId);
    const { attempt, paperRow } = getAttemptAndPaperOrThrow(attemptId);

    if (attempt.status === 'terminated') {
      throw new AppError(403, 'ATTEMPT_TERMINATED', 'Attempt has been terminated.');
    }
    if (attempt.status === 'completed') {
      throw new AppError(400, 'SECTION_LOCKED', 'Attempt is already completed.');
    }

    const sections = repos.sectionStateRepo.getByAttempt(attemptId);
    const openSec = sections.find((s) => s.status === 'open');
    if (!openSec) {
      throw new AppError(
        409,
        'SECTION_LOCKED',
        'No section is currently open. Start the next section first.'
      );
    }

    const paperObj = await loadDecryptedPaper(paperRow);
    const questions = getOrderedSectionQuestions(paperObj, openSec.section);
    const idx = attempt.current_index;
    const rawQuestion = questions[idx];
    if (!rawQuestion) {
      throw new AppError(404, 'NOT_FOUND', 'Current question index out of range.');
    }

    const now = nowFn();
    const existingResponse = repos.responsesRepo.getForQuestion(attemptId, rawQuestion.id);
    const counts = computeSectionAnswerCounts(
      attemptId,
      openSec.section,
      questions.length,
      paperObj
    );

    let codingDraft = null;
    if (rawQuestion.type === 'coding') {
      const drafts = repos.codingRepo
        .getDraftsForAttempt(attemptId)
        .filter((d) => d.question_id === rawQuestion.id);
      const finalSub = repos.codingRepo.getFinalSubmissionForQuestion(attemptId, rawQuestion.id);
      codingDraft = {
        draftsByLanguage: Object.fromEntries(drafts.map((d) => [d.language, d.source])),
        hasSubmitted: Boolean(finalSub),
        finalLanguage: finalSub?.language || null,
      };
    }

    return {
      attemptId,
      section: openSec.section,
      index: idx,
      questionNumber: idx + 1,
      totalInSection: questions.length,
      question: sanitizeQuestionForClient(rawQuestion),
      savedResponse: {
        selectedIndex: existingResponse ? existingResponse.selected_index : null,
        timeSpentMs: existingResponse ? existingResponse.time_spent_ms : 0,
      },
      codingDraft,
      answeredCount: counts.answeredCount,
      unansweredCount: counts.unansweredCount,
      deadlineAt: openSec.deadline_at,
      secondsRemaining: Math.max(0, Math.ceil((openSec.deadline_at - now) / 1000)),
      serverNow: now,
    };
  }

  const saveAnswerTx = db.transaction(
    ({ attemptId, questionId, selectedIndex, timeSpentMs, questions, now }) => {
      const attempt = repos.attemptsRepo.getById(attemptId);
      if (!attempt) {
        throw new AppError(404, 'NOT_FOUND', `Attempt "${attemptId}" not found.`);
      }
      if (attempt.status === 'terminated') {
        throw new AppError(403, 'ATTEMPT_TERMINATED', 'Attempt has been terminated.');
      }

      const openSec = repos.sectionStateRepo
        .getByAttempt(attemptId)
        .find((s) => s.status === 'open');
      if (!openSec) {
        const lastAttempted = attempt.current_section;
        if (lastAttempted) {
          const secRow = repos.sectionStateRepo.getSection(attemptId, lastAttempted);
          if (secRow?.status === 'expired') {
            throw new AppError(400, 'SECTION_EXPIRED', 'Section deadline has expired.');
          }
        }
        throw new AppError(400, 'SECTION_LOCKED', 'No section is currently open.');
      }

      if (now >= openSec.deadline_at) {
        throw new AppError(400, 'SECTION_EXPIRED', 'Section deadline has expired.');
      }

      const currentQ = questions[attempt.current_index];
      if (!currentQ || currentQ.id !== questionId) {
        throw new AppError(
          403,
          'BACKWARD_NAVIGATION_FORBIDDEN',
          `Can only save answer for the current question (${currentQ?.id || 'unknown'}).`
        );
      }

      if (currentQ.type === 'coding') {
        throw new AppError(
          400,
          'VALIDATION_FAILED',
          'Coding questions must be submitted via /code/submit.'
        );
      }

      const existing = repos.responsesRepo.getForQuestion(attemptId, questionId);
      const saved = repos.responsesRepo.upsert({
        attempt_id: attemptId,
        question_id: questionId,
        section: openSec.section,
        selected_index: selectedIndex,
        time_spent_ms: timeSpentMs ?? existing?.time_spent_ms ?? 0,
        saved_at: now,
      });

      return { saved, openSec };
    }
  );

  async function saveAnswer(attemptId, { questionId, selectedIndex, timeSpentMs }) {
    reconcileAttempt(attemptId);
    const { attempt, paperRow } = getAttemptAndPaperOrThrow(attemptId);
    const paperObj = await loadDecryptedPaper(paperRow);

    const openSec = repos.sectionStateRepo.getByAttempt(attemptId).find((s) => s.status === 'open');
    if (!openSec) {
      if (attempt.status === 'terminated') {
        throw new AppError(403, 'ATTEMPT_TERMINATED', 'Attempt has been terminated.');
      }
      throw new AppError(400, 'SECTION_EXPIRED', 'Section is not open or has expired.');
    }

    const questions = getOrderedSectionQuestions(paperObj, openSec.section);
    const now = nowFn();
    const { saved } = saveAnswerTx({
      attemptId,
      questionId,
      selectedIndex,
      timeSpentMs,
      questions,
      now,
    });

    return {
      saved: true,
      questionId: saved.question_id,
      selectedIndex: saved.selected_index,
      savedAt: saved.saved_at,
      serverNow: now,
    };
  }

  const advanceNextTx = db.transaction(({ attemptId, unanswered, questionId, paperObj, now }) => {
    const attempt = repos.attemptsRepo.getById(attemptId);
    if (!attempt) {
      throw new AppError(404, 'NOT_FOUND', `Attempt "${attemptId}" not found.`);
    }
    if (attempt.status === 'terminated') {
      throw new AppError(403, 'ATTEMPT_TERMINATED', 'Attempt has been terminated.');
    }

    const openSec = repos.sectionStateRepo.getByAttempt(attemptId).find((s) => s.status === 'open');
    if (!openSec) {
      throw new AppError(400, 'SECTION_LOCKED', 'No section is currently open.');
    }
    if (now >= openSec.deadline_at) {
      throw new AppError(400, 'SECTION_EXPIRED', 'Section deadline has expired.');
    }

    const questions = getOrderedSectionQuestions(paperObj, openSec.section);
    const currentIdx = attempt.current_index;
    const currentQ = questions[currentIdx];
    if (!currentQ) {
      throw new AppError(400, 'VALIDATION_FAILED', 'No current question available.');
    }

    if (questionId && questionId !== currentQ.id) {
      throw new AppError(
        403,
        'BACKWARD_NAVIGATION_FORBIDDEN',
        `Current question is ${currentQ.id}; cannot advance from ${questionId}.`
      );
    }

    if (currentIdx >= questions.length - 1) {
      throw new AppError(
        400,
        'VALIDATION_FAILED',
        'Already on the last question of the section; submit the section instead.'
      );
    }

    if (currentQ.type === 'coding') {
      const finalSub = repos.codingRepo.getFinalSubmissionForQuestion(attemptId, currentQ.id);
      if (!finalSub && unanswered !== true) {
        throw new AppError(
          400,
          'RESPONSE_REQUIRED',
          'No final code submission recorded. Confirm unanswered:true to skip.'
        );
      }
    } else {
      const existingResp = repos.responsesRepo.getForQuestion(attemptId, currentQ.id);
      const hasAnswer = existingResp && existingResp.selected_index !== null;
      if (!hasAnswer) {
        if (unanswered !== true) {
          throw new AppError(
            400,
            'RESPONSE_REQUIRED',
            'Save an option or send unanswered:true to advance.'
          );
        }
        repos.responsesRepo.upsert({
          attempt_id: attemptId,
          question_id: currentQ.id,
          section: openSec.section,
          selected_index: null,
          time_spent_ms: existingResp?.time_spent_ms ?? 0,
          saved_at: now,
        });
      }
    }

    const nextIndex = currentIdx + 1;
    const info = db
      .prepare(
        'UPDATE attempts SET current_index = ? WHERE id = ? AND current_section = ? AND current_index = ?'
      )
      .run(nextIndex, attemptId, openSec.section, currentIdx);

    if (info.changes !== 1) {
      throw new AppError(409, 'CONCURRENT_NAVIGATION', 'Question already advanced.');
    }

    return { section: openSec.section, nextIndex };
  });

  async function nextQuestion(attemptId, { unanswered = false, questionId = undefined } = {}) {
    reconcileAttempt(attemptId);
    const { paperRow } = getAttemptAndPaperOrThrow(attemptId);
    const paperObj = await loadDecryptedPaper(paperRow);
    const now = nowFn();

    advanceNextTx({
      attemptId,
      unanswered,
      questionId,
      paperObj,
      now,
    });

    return getCurrentQuestion(attemptId);
  }

  const submitSectionTx = db.transaction((attemptId, paperObj, now) => {
    const attempt = repos.attemptsRepo.getById(attemptId);
    if (!attempt) {
      throw new AppError(404, 'NOT_FOUND', `Attempt "${attemptId}" not found.`);
    }
    if (attempt.status === 'terminated') {
      throw new AppError(403, 'ATTEMPT_TERMINATED', 'Attempt has been terminated.');
    }
    if (attempt.status === 'completed') {
      throw new AppError(400, 'SECTION_LOCKED', 'Attempt is already completed.');
    }

    const openSec = repos.sectionStateRepo.getByAttempt(attemptId).find((s) => s.status === 'open');
    if (!openSec) {
      throw new AppError(400, 'SECTION_LOCKED', 'No section is currently open to submit.');
    }

    const isExpired = now >= openSec.deadline_at;
    const finalStatus = isExpired ? 'expired' : 'submitted';
    const submittedAt = isExpired ? openSec.deadline_at : now;

    repos.sectionStateRepo.updateSection(attemptId, openSec.section, {
      status: finalStatus,
      submitted_at: submittedAt,
    });

    const nextSection = findNextSection(openSec.section);
    if (!nextSection) {
      repos.attemptsRepo.updateState(attemptId, {
        status: 'completed',
        ended_at: submittedAt,
        current_section: null,
        current_index: 0,
      });
    } else {
      repos.attemptsRepo.updateState(attemptId, {
        current_section: null,
        current_index: 0,
      });
    }

    const questions = getOrderedSectionQuestions(paperObj, openSec.section);
    const counts = computeSectionAnswerCounts(
      attemptId,
      openSec.section,
      questions.length,
      paperObj
    );

    return {
      submittedSection: openSec.section,
      status: finalStatus,
      submittedAt,
      nextSection,
      completed: !nextSection,
      totalInSection: questions.length,
      ...counts,
    };
  });

  async function submitSection(attemptId) {
    reconcileAttempt(attemptId);
    const { attempt, paperRow } = getAttemptAndPaperOrThrow(attemptId);
    if (attempt.status === 'completed') {
      return {
        completed: true,
        state: await getState(attemptId),
      };
    }
    const paperObj = await loadDecryptedPaper(paperRow);
    const now = nowFn();
    const outcome = submitSectionTx(attemptId, paperObj, now);

    if (outcome.completed) {
      triggerCompletionHook(attemptId);
    }

    const state = await getState(attemptId);
    return {
      ...outcome,
      transitionDeadlineAt: outcome.nextSection ? outcome.submittedAt + transitionGraceMs : null,
      state,
    };
  }

  const terminateAttemptTx = db.transaction((attemptId, reason, now) => {
    const attempt = repos.attemptsRepo.getById(attemptId);
    if (!attempt) {
      throw new AppError(404, 'NOT_FOUND', `Attempt "${attemptId}" not found.`);
    }
    if (attempt.status === 'completed' || attempt.status === 'terminated') {
      return attempt;
    }

    repos.sectionStateRepo.lockRemainingSections(attemptId, 'expired');
    return repos.attemptsRepo.updateState(attemptId, {
      status: 'terminated',
      ended_at: now,
      termination_reason: reason || 'Terminated',
      current_section: null,
      current_index: 0,
    });
  });

  function terminateAttempt(attemptId, reason) {
    const now = nowFn();
    const updated = terminateAttemptTx(attemptId, reason, now);
    triggerCompletionHook(attemptId);
    return updated;
  }

  return {
    createAttempt,
    getState,
    startSection,
    getCurrentQuestion,
    saveAnswer,
    nextQuestion,
    submitSection,
    terminateAttempt,
    reconcileAttempt,
    reconcileAllOpenAttempts,
    loadDecryptedPaper,
    getOrderedSectionQuestions,
    getDataFilePath(paperRow) {
      return path.resolve(paperRow.file_path);
    },
  };
}
