import { describe, expect, it } from 'vitest';
import { mergeParts, validatePaper } from '../services/questionValidator.js';
import { createValidFullPaper, splitIntoParts } from './fixtures/paperFixtures.js';

function cloneValid() {
  return structuredClone(createValidFullPaper());
}

describe('M1 questionValidator and mergeParts', () => {
  it('accepts a valid 67-question full paper with zero errors or warnings', () => {
    const result = validatePaper(cloneValid());
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('merges valid Parts A, B, and C with matching paperId into a valid full paper', () => {
    const parts = splitIntoParts(cloneValid());
    const merged = mergeParts([parts[2], parts[0], parts[1]]);

    expect(merged.valid).toBe(true);
    expect(merged.errors).toEqual([]);
    expect(merged.paper.part).toBe('full');

    const validation = validatePaper(merged.paper);
    expect(validation.valid).toBe(true);
  });

  it('rejects mergeParts with mixed paperIds, duplicate parts, and missing parts', () => {
    const parts = splitIntoParts(cloneValid());

    const mixed = mergeParts([parts[0], { ...parts[1], paperId: 'PET-OTHER' }, parts[2]]);
    expect(mixed.valid).toBe(false);
    expect(mixed.errors.some((e) => e.code === 'MIXED_PAPER_IDS')).toBe(true);

    const dup = mergeParts([parts[0], parts[0], parts[2]]);
    expect(dup.valid).toBe(false);
    expect(dup.errors.some((e) => e.code === 'DUPLICATE_PART')).toBe(true);
    expect(dup.errors.some((e) => e.code === 'MISSING_PART')).toBe(true);

    const missing = mergeParts([parts[0], parts[1]]);
    expect(missing.valid).toBe(false);
    expect(missing.errors.some((e) => e.code === 'MISSING_PART')).toBe(true);
  });

  it('never throws on malformed JSON strings or non-object inputs', () => {
    const malformed = validatePaper('{ "format": "PETDRAFT", ');
    expect(malformed.valid).toBe(false);
    expect(malformed.errors[0].code).toBe('INVALID_JSON');

    const arrayInput = validatePaper([]);
    expect(arrayInput.valid).toBe(false);
    expect(arrayInput.errors[0].code).toBe('INVALID_STRUCTURE');
  });

  const invalidCases = [
    [
      'invalid format',
      (p) => {
        p.format = 'WRONG';
      },
      'INVALID_FORMAT',
    ],
    [
      'unsupported version',
      (p) => {
        p.version = 2;
      },
      'UNSUPPORTED_VERSION',
    ],
    [
      'invalid createdOn date',
      (p) => {
        p.createdOn = '2026-02-31';
      },
      'INVALID_DATE',
    ],
    [
      'missing section1',
      (p) => {
        delete p.section1;
      },
      'MISSING_SECTION',
    ],
    [
      'section1 total count mismatch',
      (p) => {
        p.section1.questions.pop();
      },
      'SECTION1_COUNT_MISMATCH',
    ],
    [
      'section1 aptitude count mismatch',
      (p) => {
        p.section1.questions[0].category = 'reasoning';
      },
      'APTITUDE_COUNT_MISMATCH',
    ],
    [
      'section1 reasoning count mismatch',
      (p) => {
        p.section1.questions[15].category = 'aptitude';
      },
      'REASONING_COUNT_MISMATCH',
    ],
    [
      'section1 verbal count mismatch',
      (p) => {
        p.section1.questions[30].category = 'reasoning';
      },
      'VERBAL_COUNT_MISMATCH',
    ],
    [
      'section2 departmentMcqs count mismatch',
      (p) => {
        p.section2.departmentMcqs.pop();
      },
      'SECTION2_MCQ_COUNT_MISMATCH',
    ],
    [
      'section2 snippets count mismatch',
      (p) => {
        p.section2.snippets.pop();
      },
      'SECTION2_SNIPPET_COUNT_MISMATCH',
    ],
    [
      'section2 subject count mismatch',
      (p) => {
        p.section2.departmentMcqs[0].category = 'CC02';
      },
      'SUBJECT_COUNT_MISMATCH',
    ],
    [
      'section2 subject 1-mark / 2-mark distribution invalid',
      (p) => {
        p.section2.departmentMcqs[0].marks = 2;
      },
      'SUBJECT_MARKS_DISTRIBUTION_INVALID',
    ],
    [
      'section2a coding count mismatch',
      (p) => {
        p.section2a.questions.pop();
      },
      'SECTION2A_COUNT_MISMATCH',
    ],
    [
      'section2a requires one medium and one hard problem',
      (p) => {
        p.section2a.questions[1].difficulty = 'medium';
      },
      'CODING_DIFFICULTY_MISMATCH',
    ],
    [
      'section2a problems share the same domain',
      (p) => {
        p.section2a.questions[0].domain = 'graph';
      },
      'SAME_CODING_DOMAIN',
    ],
    [
      'section2a missing tree or graph problem',
      (p) => {
        p.section2a.questions[1].isTreeOrGraph = false;
      },
      'MISSING_TREE_OR_GRAPH',
    ],
    [
      'section2a tree/graph flag true without tree/graph keywords in statement',
      (p) => {
        p.section2a.questions[1].title = 'Matrix Sum Challenge';
        p.section2a.questions[1].statement = 'Compute the prefix sums of an integer grid.';
      },
      'TREE_OR_GRAPH_STATEMENT_MISMATCH',
    ],
    [
      'duplicate question id across paper',
      (p) => {
        p.section1.questions[1].id = 'S1-APT-01';
      },
      'DUPLICATE_QUESTION_ID',
    ],
    [
      'invalid question id pattern',
      (p) => {
        p.section1.questions[0].id = 'BAD-ID-01';
      },
      'INVALID_QUESTION_ID',
    ],
    [
      'MCQ options count != 4',
      (p) => {
        p.section1.questions[0].options.pop();
      },
      'INVALID_OPTIONS_COUNT',
    ],
    [
      'MCQ duplicate options',
      (p) => {
        p.section1.questions[0].options[1] = p.section1.questions[0].options[0];
      },
      'DUPLICATE_OPTIONS',
    ],
    [
      'MCQ empty option',
      (p) => {
        p.section1.questions[0].options[2] = '   ';
      },
      'EMPTY_OPTION',
    ],
    [
      'MCQ invalid answerIndex',
      (p) => {
        p.section1.questions[0].answerIndex = 4;
      },
      'INVALID_ANSWER_INDEX',
    ],
    [
      'MCQ missing explanation',
      (p) => {
        p.section1.questions[0].explanation = '';
      },
      'MISSING_EXPLANATION',
    ],
    [
      'snippet invalid language',
      (p) => {
        p.section2.snippets[0].language = 'rust';
      },
      'INVALID_SNIPPET_LANGUAGE',
    ],
    [
      'snippet empty code',
      (p) => {
        p.section2.snippets[0].code = '  ';
      },
      'MISSING_SNIPPET_CODE',
    ],
    [
      'coding fewer than 2 samples',
      (p) => {
        p.section2a.questions[0].samples.pop();
      },
      'INSUFFICIENT_SAMPLES',
    ],
    [
      'coding fewer than 10 tests',
      (p) => {
        p.section2a.questions[0].tests.pop();
      },
      'INSUFFICIENT_TESTS',
    ],
    [
      'coding test marks sum != 10',
      (p) => {
        p.section2a.questions[0].tests[0].marks = 2.0;
      },
      'CODING_TEST_MARKS_SUM_MISMATCH',
    ],
    [
      'coding test marks not multiple of 0.5',
      (p) => {
        p.section2a.questions[0].tests[0].marks = 0.25;
      },
      'INVALID_TEST_MARKS',
    ],
    [
      'coding AUTO expectedOutput without inputGenerator',
      (p) => {
        p.section2a.questions[0].tests[1].expectedOutput = 'AUTO';
      },
      'INVALID_AUTO_EXPECTED_OUTPUT',
    ],
    [
      'coding fewer than 2 boundary or corner tests',
      (p) => {
        p.section2a.questions[0].tests[3].kind = 'general';
      },
      'INSUFFICIENT_BOUNDARY_OR_CORNER_TESTS',
    ],
    [
      'coding missing max test',
      (p) => {
        p.section2a.questions[0].tests[9].kind = 'general';
      },
      'MISSING_MAX_TEST',
    ],
    [
      'coding timeLimitMs out of 1000..10000 range',
      (p) => {
        p.section2a.questions[0].timeLimitMs = 15000;
      },
      'INVALID_TIME_LIMIT',
    ],
    [
      'coding invalid referenceSolution language',
      (p) => {
        p.section2a.questions[0].referenceSolution.language = 'java';
      },
      'INVALID_REFERENCE_SOLUTION_LANGUAGE',
    ],
    [
      'duplicate normalized question text',
      (p) => {
        p.section1.questions[1].text = `  ${p.section1.questions[0].text.toUpperCase()}!!!  `;
      },
      'DUPLICATE_QUESTION_TEXT',
    ],
    [
      'near-duplicate question text (Jaccard >= 0.85)',
      (p) => {
        p.section1.questions[1].text = `${p.section1.questions[0].text} extra`;
      },
      'NEAR_DUPLICATE_QUESTION_TEXT',
    ],
  ];

  it.each(invalidCases)('rejects %s with error code %s', (_label, mutate, expectedCode) => {
    const paper = cloneValid();
    mutate(paper);
    const result = validatePaper(paper);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === expectedCode)).toBe(true);
  });

  it('collects multiple errors across sections without stopping at the first', () => {
    const paper = cloneValid();
    paper.format = 'BAD';
    paper.section1.questions[0].options.pop();
    paper.section2a.questions[0].timeLimitMs = 500;

    const result = validatePaper(paper);
    const codes = new Set(result.errors.map((e) => e.code));
    expect(codes.has('INVALID_FORMAT')).toBe(true);
    expect(codes.has('INVALID_OPTIONS_COUNT')).toBe(true);
    expect(codes.has('INVALID_TIME_LIMIT')).toBe(true);
  });

  it('emits warnings (without failing) when hard problem is not tree/graph or answer distribution > 60%', () => {
    const paper = cloneValid();
    paper.section2a.questions[0].isTreeOrGraph = true;
    paper.section2a.questions[0].statement = 'Find shortest path on a graph with n nodes.';
    paper.section2a.questions[1].isTreeOrGraph = false;
    paper.section2a.questions[1].statement = 'Compute optimal DP score for array items.';

    paper.section1.questions.forEach((q, idx) => {
      q.answerIndex = idx < 28 ? 0 : 1;
    });

    const result = validatePaper(paper);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.code === 'HARD_NOT_TREE_OR_GRAPH')).toBe(true);
    expect(result.warnings.some((w) => w.code === 'DEGENERATE_ANSWER_DISTRIBUTION')).toBe(true);
  });
});
