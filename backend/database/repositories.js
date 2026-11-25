import crypto from 'node:crypto';

function toPlain(row) {
  return row ? { ...row } : null;
}

function toPlainList(rows) {
  return rows.map((row) => ({ ...row }));
}

export function createSettingsRepo(db) {
  const getStmt = db.prepare('SELECT key, value FROM settings WHERE key = ?');
  const setStmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  const allStmt = db.prepare('SELECT key, value FROM settings ORDER BY key ASC');
  const delStmt = db.prepare('DELETE FROM settings WHERE key = ?');

  return {
    get(key) {
      const row = getStmt.get(key);
      return row ? row.value : null;
    },
    set(key, value) {
      setStmt.run(key, String(value));
      return { key, value: String(value) };
    },
    getAll() {
      const rows = allStmt.all();
      return Object.fromEntries(rows.map((r) => [r.key, r.value]));
    },
    delete(key) {
      return delStmt.run(key).changes > 0;
    },
  };
}

export function createPapersRepo(db) {
  const insertStmt = db.prepare(`
    INSERT INTO papers (id, paper_id, title, file_path, key_id, sha256, question_count, total_marks, created_at, verified_at)
    VALUES (@id, @paper_id, @title, @file_path, @key_id, @sha256, @question_count, @total_marks, @created_at, @verified_at)
  `);
  const getByIdStmt = db.prepare('SELECT * FROM papers WHERE id = ?');
  const getByPaperIdStmt = db.prepare('SELECT * FROM papers WHERE paper_id = ?');
  const listStmt = db.prepare('SELECT * FROM papers ORDER BY created_at DESC');
  const deleteStmt = db.prepare('DELETE FROM papers WHERE id = ?');
  const markVerifiedStmt = db.prepare('UPDATE papers SET verified_at = ? WHERE id = ?');

  return {
    create(paper) {
      const row = {
        id: paper.id || crypto.randomUUID(),
        paper_id: paper.paper_id,
        title: paper.title,
        file_path: paper.file_path,
        key_id: paper.key_id,
        sha256: paper.sha256,
        question_count: paper.question_count,
        total_marks: paper.total_marks,
        created_at: paper.created_at ?? Date.now(),
        verified_at: paper.verified_at ?? null,
      };
      insertStmt.run(row);
      return toPlain(getByIdStmt.get(row.id));
    },
    getById(id) {
      return toPlain(getByIdStmt.get(id));
    },
    getByPaperId(paperId) {
      return toPlain(getByPaperIdStmt.get(paperId));
    },
    listAll() {
      return toPlainList(listStmt.all());
    },
    deleteById(id) {
      return deleteStmt.run(id).changes > 0;
    },
    markVerified(id, verifiedAt = Date.now()) {
      markVerifiedStmt.run(verifiedAt, id);
      return toPlain(getByIdStmt.get(id));
    },
  };
}

export function createAttemptsRepo(db) {
  const insertAttemptStmt = db.prepare(`
    INSERT INTO attempts (id, paper_id, status, started_at, ended_at, violation_limit, termination_reason, current_section, current_index)
    VALUES (@id, @paper_id, @status, @started_at, @ended_at, @violation_limit, @termination_reason, @current_section, @current_index)
  `);
  const insertSectionStmt = db.prepare(`
    INSERT INTO section_state (attempt_id, section, started_at, deadline_at, submitted_at, status)
    VALUES (?, ?, NULL, NULL, NULL, 'locked')
  `);
  const getByIdStmt = db.prepare('SELECT * FROM attempts WHERE id = ?');
  const listAllStmt = db.prepare('SELECT * FROM attempts ORDER BY COALESCE(started_at, 0) DESC, rowid DESC');
  const deleteStmt = db.prepare('DELETE FROM attempts WHERE id = ?');

  const createTx = db.transaction((attempt) => {
    const row = {
      id: attempt.id || crypto.randomUUID(),
      paper_id: attempt.paper_id,
      status: attempt.status || 'not_started',
      started_at: attempt.started_at ?? null,
      ended_at: attempt.ended_at ?? null,
      violation_limit: attempt.violation_limit ?? 3,
      termination_reason: attempt.termination_reason ?? null,
      current_section: attempt.current_section ?? null,
      current_index: attempt.current_index ?? 0,
    };
    insertAttemptStmt.run(row);
    for (const sec of ['S1', 'S2', 'S2A']) {
      insertSectionStmt.run(row.id, sec);
    }
    return row.id;
  });

  const ALLOWED_PATCH_COLS = [
    'status',
    'started_at',
    'ended_at',
    'violation_limit',
    'termination_reason',
    'current_section',
    'current_index',
  ];

  return {
    create(attempt) {
      const id = createTx(attempt);
      return toPlain(getByIdStmt.get(id));
    },
    getById(id) {
      return toPlain(getByIdStmt.get(id));
    },
    listAll() {
      return toPlainList(listAllStmt.all());
    },
    updateState(id, patch) {
      const entries = Object.entries(patch).filter(
        ([k, v]) => ALLOWED_PATCH_COLS.includes(k) && v !== undefined
      );
      if (entries.length === 0) {
        return toPlain(getByIdStmt.get(id));
      }
      const setClause = entries.map(([k]) => `${k} = @${k}`).join(', ');
      const stmt = db.prepare(`UPDATE attempts SET ${setClause} WHERE id = @id`);
      stmt.run({ id, ...Object.fromEntries(entries) });
      return toPlain(getByIdStmt.get(id));
    },
    deleteById(id) {
      return deleteStmt.run(id).changes > 0;
    },
  };
}

export function createSectionStateRepo(db) {
  const getByAttemptStmt = db.prepare(`
    SELECT * FROM section_state
    WHERE attempt_id = ?
    ORDER BY CASE section WHEN 'S1' THEN 1 WHEN 'S2' THEN 2 WHEN 'S2A' THEN 3 ELSE 4 END
  `);
  const getSectionStmt = db.prepare(
    'SELECT * FROM section_state WHERE attempt_id = ? AND section = ?'
  );
  const lockAllRemainingStmt = db.prepare(`
    UPDATE section_state
    SET status = ?
    WHERE attempt_id = ? AND status IN ('locked', 'open')
  `);

  const ALLOWED_COLS = ['started_at', 'deadline_at', 'submitted_at', 'status'];

  return {
    getByAttempt(attemptId) {
      return toPlainList(getByAttemptStmt.all(attemptId));
    },
    getSection(attemptId, section) {
      return toPlain(getSectionStmt.get(attemptId, section));
    },
    updateSection(attemptId, section, patch) {
      const entries = Object.entries(patch).filter(
        ([k, v]) => ALLOWED_COLS.includes(k) && v !== undefined
      );
      if (entries.length === 0) {
        return toPlain(getSectionStmt.get(attemptId, section));
      }
      const setClause = entries.map(([k]) => `${k} = @${k}`).join(', ');
      const stmt = db.prepare(
        `UPDATE section_state SET ${setClause} WHERE attempt_id = @attemptId AND section = @section`
      );
      stmt.run({ attemptId, section, ...Object.fromEntries(entries) });
      return toPlain(getSectionStmt.get(attemptId, section));
    },
    lockRemainingSections(attemptId, status = 'expired') {
      return lockAllRemainingStmt.run(status, attemptId).changes;
    },
  };
}

export function createResponsesRepo(db) {
  const upsertStmt = db.prepare(`
    INSERT INTO responses (attempt_id, question_id, section, selected_index, time_spent_ms, saved_at)
    VALUES (@attempt_id, @question_id, @section, @selected_index, @time_spent_ms, @saved_at)
    ON CONFLICT(attempt_id, question_id) DO UPDATE SET
      selected_index = excluded.selected_index,
      time_spent_ms = excluded.time_spent_ms,
      saved_at = excluded.saved_at
  `);
  const getForAttemptStmt = db.prepare(
    'SELECT * FROM responses WHERE attempt_id = ? ORDER BY saved_at ASC'
  );
  const getForSectionStmt = db.prepare(
    'SELECT * FROM responses WHERE attempt_id = ? AND section = ? ORDER BY saved_at ASC'
  );
  const getForQuestionStmt = db.prepare(
    'SELECT * FROM responses WHERE attempt_id = ? AND question_id = ?'
  );
  const deleteForQuestionStmt = db.prepare(
    'DELETE FROM responses WHERE attempt_id = ? AND question_id = ?'
  );

  return {
    upsert({ attempt_id, question_id, section, selected_index, time_spent_ms = 0, saved_at }) {
      const row = {
        attempt_id,
        question_id,
        section,
        selected_index: selected_index ?? null,
        time_spent_ms,
        saved_at: saved_at ?? Date.now(),
      };
      upsertStmt.run(row);
      return toPlain(getForQuestionStmt.get(attempt_id, question_id));
    },
    getForAttempt(attemptId) {
      return toPlainList(getForAttemptStmt.all(attemptId));
    },
    getForSection(attemptId, section) {
      return toPlainList(getForSectionStmt.all(attemptId, section));
    },
    getForQuestion(attemptId, questionId) {
      return toPlain(getForQuestionStmt.get(attemptId, questionId));
    },
    deleteForQuestion(attemptId, questionId) {
      return deleteForQuestionStmt.run(attemptId, questionId).changes > 0;
    },
  };
}

export function createCodingRepo(db) {
  const findDraftStmt = db.prepare(`
    SELECT * FROM coding_submissions
    WHERE attempt_id = ? AND question_id = ? AND language = ? AND is_final = 0
    ORDER BY submitted_at DESC
    LIMIT 1
  `);
  const insertSubmissionStmt = db.prepare(`
    INSERT INTO coding_submissions (id, attempt_id, question_id, language, source, is_final, submitted_at)
    VALUES (@id, @attempt_id, @question_id, @language, @source, @is_final, @submitted_at)
  `);
  const updateDraftStmt = db.prepare(`
    UPDATE coding_submissions SET source = ?, submitted_at = ? WHERE id = ?
  `);
  const clearFinalStmt = db.prepare(`
    UPDATE coding_submissions SET is_final = 0
    WHERE attempt_id = ? AND question_id = ? AND is_final = 1
  `);
  const insertTestResultStmt = db.prepare(`
    INSERT INTO coding_test_results (submission_id, test_id, passed, status, runtime_ms, memory_kb, marks_awarded)
    VALUES (@submission_id, @test_id, @passed, @status, @runtime_ms, @memory_kb, @marks_awarded)
  `);
  const getSubmissionByIdStmt = db.prepare('SELECT * FROM coding_submissions WHERE id = ?');
  const getLatestDraftForQuestionStmt = db.prepare(`
    SELECT * FROM coding_submissions
    WHERE attempt_id = ? AND question_id = ? AND is_final = 0
    ORDER BY submitted_at DESC
    LIMIT 1
  `);
  const getDraftsForAttemptStmt = db.prepare(`
    SELECT * FROM coding_submissions
    WHERE attempt_id = ? AND is_final = 0
    ORDER BY submitted_at DESC
  `);
  const getFinalSubmissionsStmt = db.prepare(`
    SELECT * FROM coding_submissions
    WHERE attempt_id = ? AND is_final = 1
    ORDER BY submitted_at ASC
  `);
  const getFinalForQuestionStmt = db.prepare(`
    SELECT * FROM coding_submissions
    WHERE attempt_id = ? AND question_id = ? AND is_final = 1
    LIMIT 1
  `);
  const getTestResultsStmt = db.prepare(
    'SELECT * FROM coding_test_results WHERE submission_id = ? ORDER BY rowid ASC'
  );

  const saveDraftTx = db.transaction(({ id, attempt_id, question_id, language, source, saved_at }) => {
    const ts = saved_at ?? Date.now();
    const existing = findDraftStmt.get(attempt_id, question_id, language);
    if (existing) {
      updateDraftStmt.run(source, ts, existing.id);
      return existing.id;
    }
    const newId = id || crypto.randomUUID();
    insertSubmissionStmt.run({
      id: newId,
      attempt_id,
      question_id,
      language,
      source,
      is_final: 0,
      submitted_at: ts,
    });
    return newId;
  });

  const createFinalSubmissionTx = db.transaction(({ submission, testResults = [] }) => {
    const subId = submission.id || crypto.randomUUID();
    clearFinalStmt.run(submission.attempt_id, submission.question_id);
    insertSubmissionStmt.run({
      id: subId,
      attempt_id: submission.attempt_id,
      question_id: submission.question_id,
      language: submission.language,
      source: submission.source,
      is_final: 1,
      submitted_at: submission.submitted_at ?? Date.now(),
    });
    for (const tr of testResults) {
      insertTestResultStmt.run({
        submission_id: subId,
        test_id: tr.test_id,
        passed: tr.passed ? 1 : 0,
        status: tr.status,
        runtime_ms: tr.runtime_ms ?? 0,
        memory_kb: tr.memory_kb ?? 0,
        marks_awarded: tr.marks_awarded ?? 0,
      });
    }
    return subId;
  });

  return {
    saveDraft(draft) {
      const id = saveDraftTx(draft);
      return toPlain(getSubmissionByIdStmt.get(id));
    },
    getDraft(attemptId, questionId, language) {
      return toPlain(findDraftStmt.get(attemptId, questionId, language));
    },
    getLatestDraftForQuestion(attemptId, questionId) {
      return toPlain(getLatestDraftForQuestionStmt.get(attemptId, questionId));
    },
    getDraftsForAttempt(attemptId) {
      return toPlainList(getDraftsForAttemptStmt.all(attemptId));
    },
    createSubmissionWithResults(payload) {
      const subId = createFinalSubmissionTx(payload);
      return {
        submission: toPlain(getSubmissionByIdStmt.get(subId)),
        testResults: toPlainList(getTestResultsStmt.all(subId)),
      };
    },
    getFinalSubmissions(attemptId) {
      return toPlainList(getFinalSubmissionsStmt.all(attemptId));
    },
    getFinalSubmissionForQuestion(attemptId, questionId) {
      return toPlain(getFinalForQuestionStmt.get(attemptId, questionId));
    },
    getTestResults(submissionId) {
      return toPlainList(getTestResultsStmt.all(submissionId));
    },
  };
}

export function createViolationsRepo(db) {
  const insertStmt = db.prepare(`
    INSERT INTO violations (id, attempt_id, type, at, section, question_id)
    VALUES (@id, @attempt_id, @type, @at, @section, @question_id)
  `);
  const getByIdStmt = db.prepare('SELECT * FROM violations WHERE id = ?');
  const listForAttemptStmt = db.prepare(
    'SELECT * FROM violations WHERE attempt_id = ? ORDER BY at ASC, rowid ASC'
  );
  const countForAttemptStmt = db.prepare(
    'SELECT COUNT(*) AS count FROM violations WHERE attempt_id = ?'
  );
  const latestByTypeStmt = db.prepare(
    'SELECT * FROM violations WHERE attempt_id = ? AND type = ? ORDER BY at DESC LIMIT 1'
  );

  return {
    record(violation) {
      const row = {
        id: violation.id || crypto.randomUUID(),
        attempt_id: violation.attempt_id,
        type: violation.type,
        at: violation.at ?? Date.now(),
        section: violation.section ?? null,
        question_id: violation.question_id ?? null,
      };
      insertStmt.run(row);
      return toPlain(getByIdStmt.get(row.id));
    },
    listForAttempt(attemptId) {
      return toPlainList(listForAttemptStmt.all(attemptId));
    },
    countForAttempt(attemptId) {
      return countForAttemptStmt.get(attemptId).count;
    },
    getLatestByType(attemptId, type) {
      return toPlain(latestByTypeStmt.get(attemptId, type));
    },
  };
}

export function createResultsRepo(db) {
  const upsertStmt = db.prepare(`
    INSERT INTO results (attempt_id, total, section1, section2, section2a, breakdown_json, computed_at)
    VALUES (@attempt_id, @total, @section1, @section2, @section2a, @breakdown_json, @computed_at)
    ON CONFLICT(attempt_id) DO UPDATE SET
      total = excluded.total,
      section1 = excluded.section1,
      section2 = excluded.section2,
      section2a = excluded.section2a,
      breakdown_json = excluded.breakdown_json,
      computed_at = excluded.computed_at
  `);
  const getByAttemptStmt = db.prepare('SELECT * FROM results WHERE attempt_id = ?');
  const listWithAttemptsStmt = db.prepare(`
    SELECT r.*, a.paper_id, a.status, a.started_at, a.ended_at, a.violation_limit, a.termination_reason,
           p.title AS paper_title, p.paper_id AS external_paper_id
    FROM attempts a
    LEFT JOIN results r ON r.attempt_id = a.id
    LEFT JOIN papers p ON p.id = a.paper_id
    ORDER BY COALESCE(a.started_at, 0) DESC, a.rowid DESC
  `);

  return {
    upsert({ attempt_id, total, section1, section2, section2a, breakdown_json, computed_at }) {
      const serialized =
        typeof breakdown_json === 'string' ? breakdown_json : JSON.stringify(breakdown_json);
      upsertStmt.run({
        attempt_id,
        total,
        section1,
        section2,
        section2a,
        breakdown_json: serialized,
        computed_at: computed_at ?? Date.now(),
      });
      return toPlain(getByAttemptStmt.get(attempt_id));
    },
    getByAttemptId(attemptId) {
      return toPlain(getByAttemptStmt.get(attemptId));
    },
    listAllWithAttempts() {
      return toPlainList(listWithAttemptsStmt.all());
    },
  };
}

export function createRepositories(db) {
  return {
    settingsRepo: createSettingsRepo(db),
    papersRepo: createPapersRepo(db),
    attemptsRepo: createAttemptsRepo(db),
    sectionStateRepo: createSectionStateRepo(db),
    responsesRepo: createResponsesRepo(db),
    codingRepo: createCodingRepo(db),
    violationsRepo: createViolationsRepo(db),
    resultsRepo: createResultsRepo(db),
  };
}
