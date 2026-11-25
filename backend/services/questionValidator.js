import {
  CODING_TEST_KINDS,
  DIFFICULTIES,
  REFERENCE_LANGUAGES,
  SECTION1_CATEGORIES,
  SECTION2_SUBJECTS,
  SNIPPET_LANGUAGES,
  fullPaperSchema,
  partASchema,
  partBSchema,
  partCSchema,
} from '../schemas/paperSchema.js';

const S1_ID_PATTERNS = {
  aptitude: /^S1-APT-(0[1-9]|1[0-5])$/,
  reasoning: /^S1-REA-(0[1-9]|1[0-5])$/,
  verbal: /^S1-VER-(0[1-9]|10)$/,
};

const S2_DEPT_ID_PATTERN = /^S2-(CC0[1-5])-0[1-4]$/;
const S2_SNIPPET_ID_PATTERN = /^S2-SNP-0[1-5]$/;
const TREE_OR_GRAPH_KEYWORD_REGEX =
  /\b(tree|trees|graph|graphs|node|nodes|vertex|vertices|edge|edges)\b/i;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidDateString(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return false;
  }
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function normalizeQuestionText(text) {
  if (typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getWordSet(normalizedText) {
  if (!normalizedText) return new Set();
  return new Set(normalizedText.split(' ').filter(Boolean));
}

export function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function addIssue(list, path, code, message) {
  list.push({ path, code, message });
}

function validateMcqLike(q, path, errors, { expectedType, expectedMarks, isSnippet }) {
  if (!isPlainObject(q)) {
    addIssue(errors, path, 'INVALID_QUESTION', 'Question entry must be an object.');
    return;
  }

  if (q.type !== expectedType) {
    addIssue(
      errors,
      `${path}.type`,
      'INVALID_QUESTION_TYPE',
      `Expected question type "${expectedType}", found "${String(q.type)}".`
    );
  }

  if (!isNonEmptyString(q.topic)) {
    addIssue(errors, `${path}.topic`, 'MISSING_TOPIC', 'Question must have a non-empty topic.');
  }

  if (!DIFFICULTIES.includes(q.difficulty)) {
    addIssue(
      errors,
      `${path}.difficulty`,
      'INVALID_DIFFICULTY',
      `Difficulty must be one of ${DIFFICULTIES.join(', ')}.`
    );
  }

  if (expectedMarks !== undefined && q.marks !== expectedMarks) {
    addIssue(
      errors,
      `${path}.marks`,
      'INVALID_MARKS',
      `Question ${q.id || path} must carry ${expectedMarks} mark(s), found ${String(q.marks)}.`
    );
  }

  if (!isNonEmptyString(q.text)) {
    addIssue(errors, `${path}.text`, 'MISSING_QUESTION_TEXT', 'Question text cannot be empty.');
  }

  if (!Array.isArray(q.options) || q.options.length !== 4) {
    addIssue(
      errors,
      `${path}.options`,
      'INVALID_OPTIONS_COUNT',
      'Every MCQ must have exactly 4 options.'
    );
  } else {
    const emptyIdx = q.options.findIndex((opt) => !isNonEmptyString(opt));
    if (emptyIdx !== -1) {
      addIssue(
        errors,
        `${path}.options[${emptyIdx}]`,
        'EMPTY_OPTION',
        `Option ${emptyIdx + 1} cannot be empty.`
      );
    }
    const normalizedOpts = q.options.map((opt) => (typeof opt === 'string' ? opt.trim() : ''));
    if (new Set(normalizedOpts).size !== 4) {
      addIssue(errors, `${path}.options`, 'DUPLICATE_OPTIONS', 'All 4 options must be distinct.');
    }
  }

  if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex > 3) {
    addIssue(
      errors,
      `${path}.answerIndex`,
      'INVALID_ANSWER_INDEX',
      'answerIndex must be an integer between 0 and 3.'
    );
  }

  if (!isNonEmptyString(q.explanation)) {
    addIssue(
      errors,
      `${path}.explanation`,
      'MISSING_EXPLANATION',
      'Every question must include a non-empty explanation.'
    );
  }

  if (isSnippet) {
    if (!SNIPPET_LANGUAGES.includes(q.language)) {
      addIssue(
        errors,
        `${path}.language`,
        'INVALID_SNIPPET_LANGUAGE',
        `Snippet language must be one of ${SNIPPET_LANGUAGES.join(', ')}.`
      );
    }
    if (!isNonEmptyString(q.code)) {
      addIssue(
        errors,
        `${path}.code`,
        'MISSING_SNIPPET_CODE',
        'Code snippet question must include non-empty code.'
      );
    }
  }
}

function checkDegenerateAnswers(questions, sectionName, path, warnings) {
  if (!Array.isArray(questions) || questions.length === 0) return;
  const counts = [0, 0, 0, 0];
  let validCount = 0;
  for (const q of questions) {
    if (
      isPlainObject(q) &&
      Number.isInteger(q.answerIndex) &&
      q.answerIndex >= 0 &&
      q.answerIndex <= 3
    ) {
      counts[q.answerIndex] += 1;
      validCount += 1;
    }
  }
  if (validCount === 0) return;

  for (let idx = 0; idx < 4; idx += 1) {
    const ratio = counts[idx] / validCount;
    if (ratio > 0.6) {
      const letter = String.fromCharCode(65 + idx);
      addIssue(
        warnings,
        path,
        'DEGENERATE_ANSWER_DISTRIBUTION',
        `${sectionName} has ${counts[idx]} of ${validCount} answers (${Math.round(ratio * 100)}%) on option ${letter}, which exceeds 60%.`
      );
    }
  }
}

function validateSection1(section1, errors, warnings) {
  if (!isPlainObject(section1)) {
    addIssue(errors, 'section1', 'MISSING_SECTION', 'Section 1 is missing.');
    return { questions: [], marks: 0 };
  }

  if (!Array.isArray(section1.questions)) {
    addIssue(
      errors,
      'section1.questions',
      'INVALID_STRUCTURE',
      'section1.questions must be an array.'
    );
    return { questions: [], marks: 0 };
  }

  const questions = section1.questions;
  if (questions.length !== 40) {
    addIssue(
      errors,
      'section1.questions',
      'SECTION1_COUNT_MISMATCH',
      `Section 1 must contain 40 questions, found ${questions.length}.`
    );
  }

  const catCounts = { aptitude: 0, reasoning: 0, verbal: 0 };
  let totalMarks = 0;

  questions.forEach((q, idx) => {
    const qPath = `section1.questions[${idx}]`;
    validateMcqLike(q, qPath, errors, {
      expectedType: 'mcq',
      expectedMarks: 1,
      isSnippet: false,
    });

    if (!isPlainObject(q)) return;

    if (typeof q.marks === 'number') {
      totalMarks += q.marks;
    }

    if (!SECTION1_CATEGORIES.includes(q.category)) {
      addIssue(
        errors,
        `${qPath}.category`,
        'INVALID_CATEGORY',
        `Section 1 category must be aptitude, reasoning, or verbal; found "${String(q.category)}".`
      );
    } else {
      catCounts[q.category] += 1;
      const pattern = S1_ID_PATTERNS[q.category];
      if (!isNonEmptyString(q.id) || !pattern.test(q.id)) {
        addIssue(
          errors,
          `${qPath}.id`,
          'INVALID_QUESTION_ID',
          `Question id "${String(q.id)}" does not match the required pattern for ${q.category}.`
        );
      }
    }
  });

  if (catCounts.aptitude !== 15) {
    addIssue(
      errors,
      'section1.questions',
      'APTITUDE_COUNT_MISMATCH',
      `Section 1 must have 15 aptitude questions, found ${catCounts.aptitude}.`
    );
  }
  if (catCounts.reasoning !== 15) {
    addIssue(
      errors,
      'section1.questions',
      'REASONING_COUNT_MISMATCH',
      `Section 1 must have 15 reasoning questions, found ${catCounts.reasoning}.`
    );
  }
  if (catCounts.verbal !== 10) {
    addIssue(
      errors,
      'section1.questions',
      'VERBAL_COUNT_MISMATCH',
      `Section 1 must have 10 verbal questions, found ${catCounts.verbal}.`
    );
  }

  if (totalMarks !== 40) {
    addIssue(
      errors,
      'section1.questions',
      'SECTION1_MARKS_MISMATCH',
      `Section 1 marks must sum to 40, found ${totalMarks}.`
    );
  }

  checkDegenerateAnswers(questions, 'Section 1', 'section1.questions', warnings);
  return { questions, marks: totalMarks };
}

function validateSection2(section2, errors, warnings) {
  if (!isPlainObject(section2)) {
    addIssue(errors, 'section2', 'MISSING_SECTION', 'Section 2 is missing.');
    return { questions: [], marks: 0 };
  }

  const deptMcqs = Array.isArray(section2.departmentMcqs) ? section2.departmentMcqs : null;
  const snippets = Array.isArray(section2.snippets) ? section2.snippets : null;

  if (!deptMcqs) {
    addIssue(
      errors,
      'section2.departmentMcqs',
      'INVALID_STRUCTURE',
      'section2.departmentMcqs must be an array.'
    );
  }
  if (!snippets) {
    addIssue(
      errors,
      'section2.snippets',
      'INVALID_STRUCTURE',
      'section2.snippets must be an array.'
    );
  }

  const subjectStats = Object.fromEntries(
    SECTION2_SUBJECTS.map((subj) => [subj, { total: 0, oneMark: 0, twoMark: 0 }])
  );
  let totalMarks = 0;

  if (deptMcqs) {
    if (deptMcqs.length !== 20) {
      addIssue(
        errors,
        'section2.departmentMcqs',
        'SECTION2_MCQ_COUNT_MISMATCH',
        `Section 2 must contain 20 department MCQs, found ${deptMcqs.length}.`
      );
    }

    deptMcqs.forEach((q, idx) => {
      const qPath = `section2.departmentMcqs[${idx}]`;
      validateMcqLike(q, qPath, errors, {
        expectedType: 'mcq',
        expectedMarks: undefined,
        isSnippet: false,
      });

      if (!isPlainObject(q)) return;

      if (q.marks !== 1 && q.marks !== 2) {
        addIssue(
          errors,
          `${qPath}.marks`,
          'INVALID_MARKS',
          `Department MCQ ${q.id || qPath} must be worth 1 or 2 marks, found ${String(q.marks)}.`
        );
      } else {
        totalMarks += q.marks;
      }

      if (!SECTION2_SUBJECTS.includes(q.category)) {
        addIssue(
          errors,
          `${qPath}.category`,
          'INVALID_SUBJECT_CATEGORY',
          `Department MCQ category must be one of ${SECTION2_SUBJECTS.join(', ')}, found "${String(q.category)}".`
        );
      } else {
        subjectStats[q.category].total += 1;
        if (q.marks === 1) subjectStats[q.category].oneMark += 1;
        if (q.marks === 2) subjectStats[q.category].twoMark += 1;

        const match = typeof q.id === 'string' ? q.id.match(S2_DEPT_ID_PATTERN) : null;
        if (!match || match[1] !== q.category) {
          addIssue(
            errors,
            `${qPath}.id`,
            'INVALID_QUESTION_ID',
            `Department MCQ id "${String(q.id)}" must match S2-${q.category}-01..04.`
          );
        }
      }
    });

    for (const subj of SECTION2_SUBJECTS) {
      const stat = subjectStats[subj];
      if (stat.total !== 4) {
        addIssue(
          errors,
          'section2.departmentMcqs',
          'SUBJECT_COUNT_MISMATCH',
          `Subject ${subj} must have exactly 4 MCQs, found ${stat.total}.`
        );
      } else if (stat.oneMark !== 2 || stat.twoMark !== 2) {
        addIssue(
          errors,
          'section2.departmentMcqs',
          'SUBJECT_MARKS_DISTRIBUTION_INVALID',
          `Subject ${subj} must have two 1-mark and two 2-mark MCQs (found ${stat.oneMark} x 1-mark, ${stat.twoMark} x 2-mark).`
        );
      }
    }
  }

  if (snippets) {
    if (snippets.length !== 5) {
      addIssue(
        errors,
        'section2.snippets',
        'SECTION2_SNIPPET_COUNT_MISMATCH',
        `Section 2 must contain 5 code-snippet questions, found ${snippets.length}.`
      );
    }

    snippets.forEach((q, idx) => {
      const qPath = `section2.snippets[${idx}]`;
      validateMcqLike(q, qPath, errors, {
        expectedType: 'snippet',
        expectedMarks: 2,
        isSnippet: true,
      });

      if (!isPlainObject(q)) return;

      if (typeof q.marks === 'number') {
        totalMarks += q.marks;
      }

      if (!isNonEmptyString(q.id) || !S2_SNIPPET_ID_PATTERN.test(q.id)) {
        addIssue(
          errors,
          `${qPath}.id`,
          'INVALID_QUESTION_ID',
          `Snippet id "${String(q.id)}" must match S2-SNP-01..05.`
        );
      }
    });
  }

  if (totalMarks !== 40) {
    addIssue(
      errors,
      'section2',
      'SECTION2_MARKS_MISMATCH',
      `Section 2 marks must sum to 40, found ${totalMarks}.`
    );
  }

  const allSection2 = [...(deptMcqs || []), ...(snippets || [])];
  checkDegenerateAnswers(allSection2, 'Section 2', 'section2', warnings);

  return { questions: allSection2, marks: totalMarks };
}

function validateCodingQuestion(q, path, idx, errors) {
  if (!isPlainObject(q)) {
    addIssue(errors, path, 'INVALID_QUESTION', 'Coding question must be an object.');
    return;
  }

  const expectedId = `S2A-0${idx + 1}`;
  if (q.id !== expectedId) {
    addIssue(
      errors,
      `${path}.id`,
      'INVALID_QUESTION_ID',
      `Coding question ${idx + 1} must have id "${expectedId}", found "${String(q.id)}".`
    );
  }

  if (q.type !== 'coding') {
    addIssue(
      errors,
      `${path}.type`,
      'INVALID_QUESTION_TYPE',
      'Coding question type must be "coding".'
    );
  }

  if (q.marks !== 10) {
    addIssue(errors, `${path}.marks`, 'INVALID_MARKS', 'Each coding question must carry 10 marks.');
  }

  if (q.difficulty !== 'medium' && q.difficulty !== 'hard') {
    addIssue(
      errors,
      `${path}.difficulty`,
      'INVALID_DIFFICULTY',
      'Coding difficulty must be "medium" or "hard".'
    );
  }

  if (typeof q.isTreeOrGraph !== 'boolean') {
    addIssue(
      errors,
      `${path}.isTreeOrGraph`,
      'INVALID_CODING_FIELD',
      'isTreeOrGraph must be a boolean.'
    );
  }

  for (const field of [
    'title',
    'domain',
    'topic',
    'statement',
    'inputFormat',
    'outputFormat',
    'constraints',
    'explanation',
  ]) {
    if (!isNonEmptyString(q[field])) {
      addIssue(
        errors,
        `${path}.${field}`,
        'MISSING_CODING_FIELD',
        `Coding question ${q.id || path} is missing non-empty "${field}".`
      );
    }
  }

  if (!Number.isInteger(q.timeLimitMs) || q.timeLimitMs < 1000 || q.timeLimitMs > 10000) {
    addIssue(
      errors,
      `${path}.timeLimitMs`,
      'INVALID_TIME_LIMIT',
      'timeLimitMs must be an integer between 1000 and 10000.'
    );
  }

  if (!Number.isInteger(q.memoryLimitMb) || q.memoryLimitMb < 16 || q.memoryLimitMb > 2048) {
    addIssue(
      errors,
      `${path}.memoryLimitMb`,
      'INVALID_MEMORY_LIMIT',
      'memoryLimitMb must be a positive integer.'
    );
  }

  if (!Array.isArray(q.samples) || q.samples.length < 2) {
    addIssue(
      errors,
      `${path}.samples`,
      'INSUFFICIENT_SAMPLES',
      'Every coding problem must have at least 2 sample cases.'
    );
  } else {
    q.samples.forEach((s, sIdx) => {
      const sPath = `${path}.samples[${sIdx}]`;
      if (!isPlainObject(s)) {
        addIssue(errors, sPath, 'INVALID_SAMPLE', 'Sample entry must be an object.');
        return;
      }
      if (typeof s.input !== 'string') {
        addIssue(errors, `${sPath}.input`, 'INVALID_SAMPLE', 'Sample input must be a string.');
      }
      if (typeof s.output !== 'string') {
        addIssue(errors, `${sPath}.output`, 'INVALID_SAMPLE', 'Sample output must be a string.');
      }
      if (!isNonEmptyString(s.explanation)) {
        addIssue(
          errors,
          `${sPath}.explanation`,
          'INVALID_SAMPLE',
          'Sample must include a non-empty explanation.'
        );
      }
    });
  }

  if (!Array.isArray(q.tests) || q.tests.length < 10) {
    addIssue(
      errors,
      `${path}.tests`,
      'INSUFFICIENT_TESTS',
      `Every coding problem must have at least 10 hidden tests, found ${Array.isArray(q.tests) ? q.tests.length : 0}.`
    );
  } else {
    const testIds = new Set();
    let testMarksSum = 0;
    let boundaryOrCornerCount = 0;
    let maxCount = 0;

    q.tests.forEach((t, tIdx) => {
      const tPath = `${path}.tests[${tIdx}]`;
      if (!isPlainObject(t)) {
        addIssue(errors, tPath, 'INVALID_TEST', 'Test entry must be an object.');
        return;
      }

      if (!isNonEmptyString(t.id)) {
        addIssue(errors, `${tPath}.id`, 'MISSING_TEST_ID', 'Test case must have a non-empty id.');
      } else if (testIds.has(t.id)) {
        addIssue(
          errors,
          `${tPath}.id`,
          'DUPLICATE_TEST_ID',
          `Duplicate test id "${t.id}" inside coding question.`
        );
      } else {
        testIds.add(t.id);
      }

      const hasLiteralInput = typeof t.input === 'string';
      const hasGenerator =
        isPlainObject(t.inputGenerator) &&
        t.inputGenerator.language === 'python' &&
        isNonEmptyString(t.inputGenerator.code);

      if ((hasLiteralInput && hasGenerator) || (!hasLiteralInput && !hasGenerator)) {
        addIssue(
          errors,
          tPath,
          'INVALID_TEST_INPUT',
          `Test ${t.id || tPath} must provide either literal "input" or a Python "inputGenerator" (not both or neither).`
        );
      }

      if (typeof t.expectedOutput !== 'string') {
        addIssue(
          errors,
          `${tPath}.expectedOutput`,
          'MISSING_EXPECTED_OUTPUT',
          `Test ${t.id || tPath} must specify expectedOutput as a string.`
        );
      } else if (t.expectedOutput === 'AUTO' && !hasGenerator) {
        addIssue(
          errors,
          `${tPath}.expectedOutput`,
          'INVALID_AUTO_EXPECTED_OUTPUT',
          `Test ${t.id || tPath} uses expectedOutput "AUTO" without an inputGenerator.`
        );
      }

      if (!CODING_TEST_KINDS.includes(t.kind)) {
        addIssue(
          errors,
          `${tPath}.kind`,
          'INVALID_TEST_KIND',
          `Test kind must be one of ${CODING_TEST_KINDS.join(', ')}.`
        );
      } else {
        if (t.kind === 'boundary' || t.kind === 'corner') boundaryOrCornerCount += 1;
        if (t.kind === 'max') maxCount += 1;
      }

      if (
        typeof t.marks !== 'number' ||
        !Number.isFinite(t.marks) ||
        t.marks <= 0 ||
        Math.abs(t.marks * 2 - Math.round(t.marks * 2)) > 1e-9
      ) {
        addIssue(
          errors,
          `${tPath}.marks`,
          'INVALID_TEST_MARKS',
          `Test ${t.id || tPath} marks must be a positive multiple of 0.5.`
        );
      } else {
        testMarksSum += t.marks;
      }
    });

    if (Math.abs(testMarksSum - 10) > 1e-6) {
      addIssue(
        errors,
        `${path}.tests`,
        'CODING_TEST_MARKS_SUM_MISMATCH',
        `Hidden test marks for ${q.id || path} must sum to 10, found ${testMarksSum}.`
      );
    }

    if (boundaryOrCornerCount < 2) {
      addIssue(
        errors,
        `${path}.tests`,
        'INSUFFICIENT_BOUNDARY_OR_CORNER_TESTS',
        `Coding question ${q.id || path} must have at least 2 boundary or corner tests, found ${boundaryOrCornerCount}.`
      );
    }

    if (maxCount < 1) {
      addIssue(
        errors,
        `${path}.tests`,
        'MISSING_MAX_TEST',
        `Coding question ${q.id || path} must have at least 1 max-size test.`
      );
    }
  }

  if (!isPlainObject(q.referenceSolution)) {
    addIssue(
      errors,
      `${path}.referenceSolution`,
      'MISSING_REFERENCE_SOLUTION',
      'Every coding problem must include a referenceSolution.'
    );
  } else {
    if (!REFERENCE_LANGUAGES.includes(q.referenceSolution.language)) {
      addIssue(
        errors,
        `${path}.referenceSolution.language`,
        'INVALID_REFERENCE_SOLUTION_LANGUAGE',
        'referenceSolution.language must be "cpp" or "python".'
      );
    }
    if (!isNonEmptyString(q.referenceSolution.code)) {
      addIssue(
        errors,
        `${path}.referenceSolution.code`,
        'MISSING_REFERENCE_SOLUTION',
        'referenceSolution.code cannot be empty.'
      );
    }
  }
}

function validateSection2a(section2a, errors, warnings) {
  if (!isPlainObject(section2a)) {
    addIssue(errors, 'section2a', 'MISSING_SECTION', 'Section 2a is missing.');
    return { questions: [], marks: 0 };
  }

  if (!Array.isArray(section2a.questions)) {
    addIssue(
      errors,
      'section2a.questions',
      'INVALID_STRUCTURE',
      'section2a.questions must be an array.'
    );
    return { questions: [], marks: 0 };
  }

  const questions = section2a.questions;
  if (questions.length !== 2) {
    addIssue(
      errors,
      'section2a.questions',
      'SECTION2A_COUNT_MISMATCH',
      `Section 2a must contain 2 coding questions, found ${questions.length}.`
    );
  }

  let totalMarks = 0;
  questions.forEach((q, idx) => {
    validateCodingQuestion(q, `section2a.questions[${idx}]`, idx, errors);
    if (isPlainObject(q) && typeof q.marks === 'number') {
      totalMarks += q.marks;
    }
  });

  if (questions.length === 2 && isPlainObject(questions[0]) && isPlainObject(questions[1])) {
    const [q1, q2] = questions;
    const diffs = [q1.difficulty, q2.difficulty].sort();
    if (diffs[0] !== 'hard' || diffs[1] !== 'medium') {
      addIssue(
        errors,
        'section2a.questions',
        'CODING_DIFFICULTY_MISMATCH',
        'Section 2a must have exactly one "medium" and one "hard" coding problem.'
      );
    }

    if (
      isNonEmptyString(q1.domain) &&
      isNonEmptyString(q2.domain) &&
      q1.domain.trim().toLowerCase() === q2.domain.trim().toLowerCase()
    ) {
      addIssue(
        errors,
        'section2a.questions',
        'SAME_CODING_DOMAIN',
        `The two coding problems must be in different algorithmic domains (both used "${q1.domain}").`
      );
    }

    const treeGraphQuestions = questions.filter((q) => q.isTreeOrGraph === true);
    if (treeGraphQuestions.length === 0) {
      addIssue(
        errors,
        'section2a.questions',
        'MISSING_TREE_OR_GRAPH',
        'At least one coding problem must have isTreeOrGraph set to true.'
      );
    } else {
      treeGraphQuestions.forEach((tg) => {
        const idx = questions.indexOf(tg);
        const text = `${tg.title || ''} ${tg.statement || ''}`;
        if (!TREE_OR_GRAPH_KEYWORD_REGEX.test(text)) {
          addIssue(
            errors,
            `section2a.questions[${idx}].statement`,
            'TREE_OR_GRAPH_STATEMENT_MISMATCH',
            `Question ${tg.id || idx + 1} has isTreeOrGraph=true but its statement does not mention tree, graph, node, vertex, or edge.`
          );
        }
      });

      const hardProblem = questions.find((q) => q.difficulty === 'hard');
      if (hardProblem && hardProblem.isTreeOrGraph !== true) {
        addIssue(
          warnings,
          'section2a.questions',
          'HARD_NOT_TREE_OR_GRAPH',
          'Recommendation: the Hard coding problem is normally the tree or graph problem.'
        );
      }
    }
  }

  if (totalMarks !== 20) {
    addIssue(
      errors,
      'section2a.questions',
      'SECTION2A_MARKS_MISMATCH',
      `Section 2a marks must sum to 20, found ${totalMarks}.`
    );
  }

  return { questions, marks: totalMarks };
}

function getCanonicalQuestionText(q) {
  if (q.type === 'snippet') {
    return `${q.text || ''} ${q.code || ''}`;
  }
  if (q.type === 'coding') {
    return `${q.title || ''} ${q.statement || ''}`;
  }
  return q.text || '';
}

function validateCrossPaperUniqueness(allEntries, errors) {
  const seenIds = new Map();
  const seenNormalized = new Map();
  const wordEntries = [];

  for (const { question: q, path } of allEntries) {
    if (!isPlainObject(q)) continue;

    if (isNonEmptyString(q.id)) {
      if (seenIds.has(q.id)) {
        addIssue(
          errors,
          `${path}.id`,
          'DUPLICATE_QUESTION_ID',
          `Duplicate question id "${q.id}" (already used at ${seenIds.get(q.id)}).`
        );
      } else {
        seenIds.set(q.id, path);
      }
    }

    const rawText = getCanonicalQuestionText(q);
    const normalized = normalizeQuestionText(rawText);
    if (!normalized) continue;

    if (seenNormalized.has(normalized)) {
      const prior = seenNormalized.get(normalized);
      addIssue(
        errors,
        path,
        'DUPLICATE_QUESTION_TEXT',
        `Question ${q.id || path} duplicates the text of ${prior.id || prior.path}.`
      );
      continue;
    }

    seenNormalized.set(normalized, { id: q.id, path });

    const words = getWordSet(normalized);
    if (words.size >= 4) {
      for (const prior of wordEntries) {
        const sim = jaccardSimilarity(words, prior.words);
        if (sim >= 0.85) {
          addIssue(
            errors,
            path,
            'NEAR_DUPLICATE_QUESTION_TEXT',
            `Question ${q.id || path} is too similar (${Math.round(sim * 100)}% word overlap) to ${prior.id || prior.path}.`
          );
          break;
        }
      }
      wordEntries.push({ id: q.id, path, words });
    }
  }
}

export function mergeParts(parts) {
  const errors = [];

  if (!Array.isArray(parts) || parts.length === 0) {
    addIssue(errors, '$', 'INVALID_PARTS', 'Expected 1 full paper or 3 parts (A, B, C).');
    return { valid: false, errors, paper: null };
  }

  const parsedParts = [];
  for (let i = 0; i < parts.length; i += 1) {
    let item = parts[i];
    if (typeof item === 'string') {
      try {
        item = JSON.parse(item);
      } catch (err) {
        addIssue(
          errors,
          `[${i}]`,
          'INVALID_JSON',
          `Part ${i + 1} is not valid JSON: ${err.message}`
        );
        continue;
      }
    }
    if (!isPlainObject(item)) {
      addIssue(errors, `[${i}]`, 'INVALID_STRUCTURE', `Part ${i + 1} must be a JSON object.`);
      continue;
    }
    parsedParts.push(item);
  }

  if (errors.length > 0) {
    return { valid: false, errors, paper: null };
  }

  if (parsedParts.length === 1 && parsedParts[0].part === 'full') {
    const check = fullPaperSchema.safeParse(parsedParts[0]);
    if (!check.success) {
      const validation = validatePaper(parsedParts[0]);
      return { valid: validation.valid, errors: validation.errors, paper: parsedParts[0] };
    }
    return { valid: true, errors: [], paper: parsedParts[0] };
  }

  if (parsedParts.some((p) => p.part === 'full')) {
    addIssue(
      errors,
      '$',
      'MIXED_FULL_AND_PART',
      'Cannot combine a "full" paper with partial parts.'
    );
    return { valid: false, errors, paper: null };
  }

  const partMap = new Map();
  const paperIds = new Set();

  parsedParts.forEach((p, idx) => {
    const partLabel = p.part;
    const pPath = `[${idx}]`;

    if (p.format !== 'PETDRAFT') {
      addIssue(errors, `${pPath}.format`, 'INVALID_FORMAT', 'format must be "PETDRAFT".');
    }
    if (p.version !== 1) {
      addIssue(errors, `${pPath}.version`, 'UNSUPPORTED_VERSION', 'version must be 1.');
    }
    if (!isNonEmptyString(p.paperId)) {
      addIssue(errors, `${pPath}.paperId`, 'MISSING_METADATA', 'Each part must include paperId.');
    } else {
      paperIds.add(p.paperId);
    }

    if (partLabel !== 'A' && partLabel !== 'B' && partLabel !== 'C') {
      addIssue(
        errors,
        `${pPath}.part`,
        'INVALID_PART',
        `Part must be "A", "B", or "C"; found "${String(partLabel)}".`
      );
      return;
    }

    if (partMap.has(partLabel)) {
      addIssue(
        errors,
        `${pPath}.part`,
        'DUPLICATE_PART',
        `Part "${partLabel}" was provided more than once.`
      );
      return;
    }

    const schema = partLabel === 'A' ? partASchema : partLabel === 'B' ? partBSchema : partCSchema;
    const result = schema.safeParse(p);
    if (!result.success) {
      for (const issue of result.error.issues) {
        addIssue(
          errors,
          `${pPath}.${issue.path.join('.')}`,
          'INVALID_PART_SCHEMA',
          `Part ${partLabel}: ${issue.message}`
        );
      }
    }

    partMap.set(partLabel, p);
  });

  if (paperIds.size > 1) {
    addIssue(
      errors,
      '$.paperId',
      'MIXED_PAPER_IDS',
      `All parts must share the same paperId (found: ${Array.from(paperIds).join(', ')}).`
    );
  }

  for (const requiredPart of ['A', 'B', 'C']) {
    if (!partMap.has(requiredPart)) {
      addIssue(
        errors,
        '$',
        'MISSING_PART',
        `Missing Part ${requiredPart}. Upload all three parts (A, B, and C) or one full paper.`
      );
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, paper: null };
  }

  const partA = partMap.get('A');
  const partB = partMap.get('B');
  const partC = partMap.get('C');

  const merged = {
    format: 'PETDRAFT',
    version: 1,
    part: 'full',
    paperId: partA.paperId,
    title: partA.title || partB.title || partC.title,
    generatedBy: partA.generatedBy || partB.generatedBy || partC.generatedBy,
    createdOn: partA.createdOn || partB.createdOn || partC.createdOn,
    section1: partA.section1,
    section2: partB.section2,
    section2a: partC.section2a,
  };

  return { valid: true, errors: [], paper: merged };
}

export function validatePaper(input) {
  const errors = [];
  const warnings = [];

  let paper = input;
  if (typeof input === 'string') {
    try {
      paper = JSON.parse(input);
    } catch (err) {
      addIssue(errors, '$', 'INVALID_JSON', `Malformed JSON: ${err.message}`);
      return { valid: false, errors, warnings };
    }
  }

  if (!isPlainObject(paper)) {
    addIssue(errors, '$', 'INVALID_STRUCTURE', 'Paper payload must be a JSON object.');
    return { valid: false, errors, warnings };
  }

  if (paper.format !== 'PETDRAFT') {
    addIssue(
      errors,
      'format',
      'INVALID_FORMAT',
      `format must be "PETDRAFT", found "${String(paper.format)}".`
    );
  }

  if (paper.version !== 1) {
    addIssue(
      errors,
      'version',
      'UNSUPPORTED_VERSION',
      `Only version 1 is supported, found "${String(paper.version)}".`
    );
  }

  if (paper.part !== 'full') {
    addIssue(
      errors,
      'part',
      'INVALID_PART',
      `Complete paper must have part "full", found "${String(paper.part)}".`
    );
  }

  if (!isNonEmptyString(paper.paperId)) {
    addIssue(errors, 'paperId', 'MISSING_METADATA', 'paperId is required.');
  }
  if (!isNonEmptyString(paper.title)) {
    addIssue(errors, 'title', 'MISSING_METADATA', 'title is required.');
  }
  if (!isNonEmptyString(paper.generatedBy)) {
    addIssue(errors, 'generatedBy', 'MISSING_METADATA', 'generatedBy is required.');
  }
  if (!isValidDateString(paper.createdOn)) {
    addIssue(errors, 'createdOn', 'INVALID_DATE', 'createdOn must be a valid YYYY-MM-DD date.');
  }

  const s1 = validateSection1(paper.section1, errors, warnings);
  const s2 = validateSection2(paper.section2, errors, warnings);
  const s2a = validateSection2a(paper.section2a, errors, warnings);

  const totalMarks = s1.marks + s2.marks + s2a.marks;
  if (totalMarks !== 100) {
    addIssue(
      errors,
      '$',
      'TOTAL_MARKS_MISMATCH',
      `Total marks across all sections must equal 100, found ${totalMarks}.`
    );
  }

  const allEntries = [
    ...(Array.isArray(paper.section1?.questions)
      ? paper.section1.questions.map((question, idx) => ({
          question,
          path: `section1.questions[${idx}]`,
        }))
      : []),
    ...(Array.isArray(paper.section2?.departmentMcqs)
      ? paper.section2.departmentMcqs.map((question, idx) => ({
          question,
          path: `section2.departmentMcqs[${idx}]`,
        }))
      : []),
    ...(Array.isArray(paper.section2?.snippets)
      ? paper.section2.snippets.map((question, idx) => ({
          question,
          path: `section2.snippets[${idx}]`,
        }))
      : []),
    ...(Array.isArray(paper.section2a?.questions)
      ? paper.section2a.questions.map((question, idx) => ({
          question,
          path: `section2a.questions[${idx}]`,
        }))
      : []),
  ];

  validateCrossPaperUniqueness(allEntries, errors);

  // Run Zod structural check to catch any unhandled schema mismatches
  if (errors.length === 0) {
    const zodRes = fullPaperSchema.safeParse(paper);
    if (!zodRes.success) {
      for (const issue of zodRes.error.issues) {
        addIssue(errors, issue.path.join('.') || '$', 'SCHEMA_VALIDATION_FAILED', issue.message);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
