function pad2(n) {
  return String(n).padStart(2, '0');
}

function makeMcq({ id, category, topic, difficulty, marks, text, answerIndex }) {
  return {
    id,
    type: 'mcq',
    category,
    topic,
    difficulty,
    marks,
    text,
    options: [
      `Option Alpha for ${id}`,
      `Option Beta for ${id}`,
      `Option Gamma for ${id}`,
      `Option Delta for ${id}`,
    ],
    answerIndex,
    explanation: `Step-by-step reasoning for ${id} shows why option ${answerIndex + 1} holds.`,
  };
}

export function createValidFullPaper(overrides = {}) {
  const s1Questions = [];
  const aptTopics = [
    'Numbers',
    'HCF and LCM',
    'Percentage and Average',
    'Ratio and Proportion',
    'Profit and Loss',
    'Time and Work',
    'Work and Wages',
    'Time and Distance',
    'Alligation and Mixture',
    'Simple Interest',
    'Compound Interest',
    'Data Interpretation',
    'Data Sufficiency',
    'Permutations and Combinations',
    'Mensuration I',
  ];

  for (let i = 1; i <= 15; i += 1) {
    s1Questions.push(
      makeMcq({
        id: `S1-APT-${pad2(i)}`,
        category: 'aptitude',
        topic: aptTopics[i - 1],
        difficulty: i <= 3 ? 'medium' : i <= 11 ? 'hard' : 'very_hard',
        marks: 1,
        text: `Aptitude challenge number ${i} regarding ${aptTopics[i - 1]} with distinct parameter ${i * 17 + 3} and rate ${i + 5}.`,
        answerIndex: (i - 1) % 4,
      })
    );
  }

  for (let i = 1; i <= 15; i += 1) {
    s1Questions.push(
      makeMcq({
        id: `S1-REA-${pad2(i)}`,
        category: 'reasoning',
        topic: `Reasoning Topic ${i}`,
        difficulty: i <= 3 ? 'medium' : i <= 11 ? 'hard' : 'very_hard',
        marks: 1,
        text: `Logical puzzle scenario ${i} involving sequence key ${i * 23 + 7} and seating constraint alpha-${i}.`,
        answerIndex: i % 4,
      })
    );
  }

  for (let i = 1; i <= 10; i += 1) {
    s1Questions.push(
      makeMcq({
        id: `S1-VER-${pad2(i)}`,
        category: 'verbal',
        topic: `Verbal Topic ${i}`,
        difficulty: i <= 3 ? 'medium' : i <= 8 ? 'hard' : 'very_hard',
        marks: 1,
        text: `Verbal grammar evaluation item ${i} inspecting sentence clause marker token-${i * 13}.`,
        answerIndex: (i + 1) % 4,
      })
    );
  }

  const subjects = ['CC01', 'CC02', 'CC03', 'CC04', 'CC05'];
  const deptMcqs = [];
  subjects.forEach((subj, sIdx) => {
    for (let i = 1; i <= 4; i += 1) {
      const marks = i <= 2 ? 1 : 2;
      deptMcqs.push(
        makeMcq({
          id: `S2-${subj}-${pad2(i)}`,
          category: subj,
          topic: `${subj} Topic ${i}`,
          difficulty: marks === 1 ? 'medium' : 'hard',
          marks,
          text: `Core subject ${subj} problem ${i} analyzing system property sigma-${sIdx * 10 + i} under bounded load.`,
          answerIndex: (sIdx + i) % 4,
        })
      );
    }
  });

  const snippetLangs = ['c', 'cpp', 'java', 'python', 'cpp'];
  const snippets = snippetLangs.map((lang, idx) => ({
    id: `S2-SNP-${pad2(idx + 1)}`,
    type: 'snippet',
    category: 'snippet',
    topic: `Snippet Tracing ${lang}`,
    difficulty: 'hard',
    marks: 2,
    language: lang,
    code:
      lang === 'python'
        ? `def f(x):\n    return x * ${idx + 2}\nprint(f(${idx + 5}))`
        : `int main() { int v = ${idx + 10}; return v - v; }`,
    text: `Trace the ${lang.toUpperCase()} program ${idx + 1} with multiplier ${idx + 2} and report exact stdout.`,
    options: [
      `Output ${idx * 10 + 1}`,
      `Output ${idx * 10 + 2}`,
      `Output ${idx * 10 + 3}`,
      `Output ${idx * 10 + 4}`,
    ],
    answerIndex: idx % 4,
    explanation: `Evaluating snippet ${idx + 1} line by line produces option ${(idx % 4) + 1}.`,
  }));

  const makeTests = (prefix) => [
    { id: `${prefix}-T01`, input: '1\n', expectedOutput: '1', marks: 0.5, kind: 'single' },
    { id: `${prefix}-T02`, input: '2\n', expectedOutput: '2', marks: 1.0, kind: 'general' },
    { id: `${prefix}-T03`, input: '3\n', expectedOutput: '3', marks: 1.0, kind: 'general' },
    { id: `${prefix}-T04`, input: '0\n', expectedOutput: '0', marks: 1.0, kind: 'boundary' },
    { id: `${prefix}-T05`, input: '100\n', expectedOutput: '100', marks: 1.0, kind: 'corner' },
    { id: `${prefix}-T06`, input: '5\n', expectedOutput: '5', marks: 1.0, kind: 'general' },
    { id: `${prefix}-T07`, input: '6\n', expectedOutput: '6', marks: 1.0, kind: 'duplicate' },
    { id: `${prefix}-T08`, input: '7\n', expectedOutput: '7', marks: 1.0, kind: 'disconnected' },
    { id: `${prefix}-T09`, input: '8\n', expectedOutput: '8', marks: 1.0, kind: 'general' },
    {
      id: `${prefix}-T10`,
      inputGenerator: { language: 'python', code: 'print(9)' },
      expectedOutput: 'AUTO',
      marks: 1.5,
      kind: 'max',
    },
  ];

  const codingQuestions = [
    {
      id: 'S2A-01',
      type: 'coding',
      title: 'Minimum Subarray Budget',
      difficulty: 'medium',
      domain: 'dynamic-programming',
      isTreeOrGraph: false,
      topic: 'Dynamic Programming',
      marks: 10,
      statement:
        'Given an integer n, compute the minimum subarray budget indicator equal to n for the calibration fixture.',
      inputFormat: 'Single integer n.',
      outputFormat: 'Single integer result.',
      constraints: '0 <= n <= 10^5',
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      samples: [
        { input: '4\n', output: '4', explanation: 'Direct value 4 gives 4.' },
        { input: '10\n', output: '10', explanation: 'Direct value 10 gives 10.' },
      ],
      tests: makeTests('Q1'),
      referenceSolution: {
        language: 'python',
        code: 'import sys\nprint(sys.stdin.read().strip())',
      },
      explanation: 'Reads integer and prints calibrated minimum budget.',
    },
    {
      id: 'S2A-02',
      type: 'coding',
      title: 'Weighted Tree Path Queries',
      difficulty: 'hard',
      domain: 'graph',
      isTreeOrGraph: true,
      topic: 'Trees and LCA',
      marks: 10,
      statement:
        'Given a weighted tree with n nodes and n-1 edges, answer the root calibration query for vertex 1.',
      inputFormat: 'Single integer n representing node count.',
      outputFormat: 'Single integer query output.',
      constraints: '0 <= n <= 10^5',
      timeLimitMs: 3000,
      memoryLimitMb: 256,
      samples: [
        { input: '3\n', output: '3', explanation: 'Tree with 3 nodes outputs 3.' },
        { input: '7\n', output: '7', explanation: 'Tree with 7 nodes outputs 7.' },
      ],
      tests: makeTests('Q2'),
      referenceSolution: {
        language: 'cpp',
        code: '#include <iostream>\nint main(){ long long n; if(std::cin>>n) std::cout<<n; return 0; }',
      },
      explanation: 'Uses binary lifting on the tree in O(log n) per query.',
    },
  ];

  return {
    format: 'PETDRAFT',
    version: 1,
    part: 'full',
    paperId: 'PET-20261125-ABC123',
    title: 'PET Mock Test - Sample Fixture',
    generatedBy: 'fixture-builder',
    createdOn: '2026-11-25',
    section1: { questions: s1Questions },
    section2: { departmentMcqs: deptMcqs, snippets },
    section2a: { questions: codingQuestions },
    ...overrides,
  };
}

export function splitIntoParts(fullPaper) {
  const base = {
    format: fullPaper.format,
    version: fullPaper.version,
    paperId: fullPaper.paperId,
    title: fullPaper.title,
    generatedBy: fullPaper.generatedBy,
    createdOn: fullPaper.createdOn,
  };

  return [
    { ...base, part: 'A', section1: structuredClone(fullPaper.section1) },
    { ...base, part: 'B', section2: structuredClone(fullPaper.section2) },
    { ...base, part: 'C', section2a: structuredClone(fullPaper.section2a) },
  ];
}
