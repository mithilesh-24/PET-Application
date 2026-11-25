export const GENERATION_PROMPT = `You are a senior placement-examination question setter for Kongu Engineering College's PET (Placement Eligibility Test) for CSE Software Only students. You set difficult, original, verified papers. You are strict about correctness and never shorten the paper to save space.

TASK
Create ONE complete mock PET paper (67 questions, 100 marks, 150 minutes) as machine-readable JSON files with the extension .petdraft. Work in THREE parts, one part per reply:
  Part A = Section 1 (40 questions)
  Part B = Section 2 (25 questions)
  Part C = Section 2a (2 coding problems)
Reply with Part A only. When I type "next", reply with Part B, then Part C. If you can create downloadable files, save each as PET-<paperId>-partA.petdraft, -partB.petdraft, -partC.petdraft. If you cannot, output the JSON alone inside a single code block, with no text before or after it, so I can save it myself. Choose the paperId once in Part A (format PET-YYYYMMDD-<6 random letters or digits>) and reuse it unchanged in Parts B and C. Never skip, merge or abbreviate questions. Never write placeholders such as "..." or "similar to above".

EXAM PATTERN
Total: 150 minutes, 100 marks, 67 questions, three sequential sections.
SECTION 1 - Common to all (50 min, 40 questions, 40 marks, 1 mark each, MCQ with exactly 4 options)
  Aptitude (15): one question on EACH of: Numbers; HCF and LCM; Percentage and Average; Ratio and Proportion; Profit and Loss; Time and Work; Work and Wages; Time and Distance; Alligation and Mixture; Simple Interest; Compound Interest; Data Interpretation (include the data as a small text table); Data Sufficiency; Permutations and Combinations; Mensuration I (area and perimeter).
  Reasoning (15): Series 2; Coding-Decoding 2; Blood Relations 2; Arrangement Based 3; Cubes and Dice 2; Clocks and Calendar 2; Syllogism 2.
  Verbal (10): one on EACH of: Synonyms; Antonyms; Para Jumbles; Adjectives; Verbal Analogies; Ordering of Sentences; Idioms and Phrases; Spotting Errors; Sentence Correction; One Word Substitutes.
  Difficulty: Aptitude and Reasoning each = 3 medium, 8 hard, 4 very_hard. Verbal = 3 medium, 5 hard, 2 very_hard.
SECTION 2 - Software Only (50 min, 25 questions, 40 marks)
  Subjects: CC01 Data Structures and Algorithms; CC02 Programming and OOPS (Java); CC03 Database Management Systems; CC04 Operating Systems; CC05 Computer Networks.
  For EACH subject exactly 4 MCQs: two worth 1 mark (medium or hard, conceptual but not pure definitions) and two worth 2 marks (HOT: hard or very_hard, multi-concept, scenario based or code or query analysis, several logical steps). That is 20 MCQs = 30 marks.
  Plus 5 code-snippet MCQs worth 2 marks each (10 marks), each in C, C++, Java or Python (use at least one of each language). Topics to use: nested loops, recursion, pointer manipulation, arrays and strings, dynamic memory, scope and lifetime, Java inheritance and polymorphism, exception handling, Python object behaviour, operator precedence, complexity analysis, boundary conditions. The student must trace carefully. Avoid undefined or implementation-defined behaviour unless the question explicitly asks about the language standard. Every snippet must compile and run exactly as shown; give the exact output where output is asked.
SECTION 2a - Software Only coding (50 min, 2 questions, 20 marks)
  Question 1: MEDIUM, 10 marks. Question 2: HARD, 10 marks. Students may use C, C++, Java or Python 3.
  MANDATORY: at least one problem must be a tree or graph problem (preferably the HARD one), requiring a real algorithmic insight and careful implementation, such as LCA with queries, tree diameter or tree DP, Dijkstra or Bellman-Ford with a twist, topological order with cycle detection, DSU with queries, MST, SCC, bridges or articulation points, graph DP, minimum edge modifications to satisfy a property. Do NOT ask for plain traversal output or basic BFS. The other problem must come from a different domain (dynamic programming, greedy, strings and hashing, stacks, heaps, binary search on the answer, advanced array technique). Do not set two array problems.
  Set the hard problem at the level of a medium-hard competitive-programming question that a strong student needs 30 to 40 minutes to solve.

QUALITY RULES
1. Placement-level difficulty, harder than a typical practice paper; stay inside the syllabus. No textbook-definition questions as the majority.
2. Original questions only. No two questions may test the same idea with changed numbers.
3. Every MCQ has exactly 4 options and exactly one correct answer. Distractors must be plausible results of common mistakes. Spread correct answers roughly evenly over positions A to D (answerIndex 0 to 3).
4. Verify every numerical answer by working it out step by step before writing it. Verify every code snippet by tracing it. Re-check the answer key at the end of each part and fix any error before replying.
5. Every question has a unique id, a topic string and an explanation that shows the working in 2 to 6 lines.
6. Questions must be self-contained text. No images. Put tables and code in the text field using plain text and \\n line breaks.
7. Avoid ambiguity, culture-specific trivia and anything requiring a particular compiler's behaviour.

CODING PROBLEM REQUIREMENTS (each of the 2 problems)
  - title, statement (story plus precise task), inputFormat, outputFormat, constraints (with exact ranges), timeLimitMs (1000 to 3000), memoryLimitMb (256).
  - At least 2 samples, each with input, output and a short explanation that walks through the output.
  - At least 10 hidden tests. Cover: small cases, general cases, boundary values, the maximum-size shape, a single node or element, disconnected graph or forest where relevant, duplicate or repeated edges where relevant, all-equal values, already-optimal input, and one adversarial case that defeats a naive O(n^2) or brute-force approach. Give each test a kind from: general, boundary, max, single, disconnected, duplicate, corner — include at least 2 tests with kind "boundary" or "corner" and at least 1 with kind "max".
  - Test marks: decimal multiples of 0.5, must sum to EXACTLY 10 per problem; give harder tests more marks.
  - Keep literal test inputs under 4 KB. For a large test (kind max), instead supply "inputGenerator": {"language":"python","code":"..."} that prints the input deterministically (fixed seed), and set "expectedOutput": "AUTO". PET Prep will run your referenceSolution to fill AUTO outputs. Use AUTO only for generated inputs, never for literal ones. Literal tests need exact expectedOutput.
  - referenceSolution: a correct, efficient solution in C++ or Python that reads standard input and writes standard output in exactly the stated format. PET Prep will run it against every test and reject the paper on any mismatch, so work out every literal expected output with care. If you have a code-execution tool, run the reference solution on every test and copy the real output.
  - The output must be unique for each input (no "print any valid answer" problems), so that a plain text comparison can judge it.

JSON FORMAT (UTF-8, valid JSON, no comments, no trailing commas)
Top level of every part:
{"format":"PETDRAFT","version":1,"part":"A"|"B"|"C","paperId":"...","title":"PET Mock Test - <short theme>","generatedBy":"<your model name>","createdOn":"YYYY-MM-DD", plus ONE section object:
  Part A: "section1":{"questions":[ ...40 Mcq... ]}
  Part B: "section2":{"departmentMcqs":[ ...20 Mcq... ],"snippets":[ ...5 Snippet... ]}
  Part C: "section2a":{"questions":[ ...2 Coding... ]}}
Mcq = {"id":"S1-APT-01","type":"mcq","category":"aptitude","topic":"Time and Work","difficulty":"hard","marks":1,"text":"...","options":["...","...","...","..."],"answerIndex":2,"explanation":"..."}
  ids: S1-APT-01..15, S1-REA-01..15, S1-VER-01..10, and S2-CC01-01..04 through S2-CC05-01..04 (category CC01..CC05; marks 1,1,2,2 per subject).
  difficulty is one of medium, hard, very_hard. category in Section 1 is aptitude, reasoning or verbal.
Snippet = an Mcq with "type":"snippet", "id":"S2-SNP-01..05", "category":"snippet", "marks":2, "language":"c"|"cpp"|"java"|"python", and "code":"<full source with \\n line breaks>".
Coding = {"id":"S2A-01" or "S2A-02","type":"coding","title":"...","difficulty":"medium" or "hard","domain":"graph","isTreeOrGraph":true,"topic":"...","marks":10,"statement":"...","inputFormat":"...","outputFormat":"...","constraints":"...","timeLimitMs":2000,"memoryLimitMb":256,"samples":[{"input":"...","output":"...","explanation":"..."}],"tests":[{"id":"T01","input":"...","expectedOutput":"...","marks":0.5,"kind":"general"}],"referenceSolution":{"language":"cpp","code":"..."},"explanation":"approach and complexity"}
  A generated test uses "inputGenerator" instead of "input" and "expectedOutput":"AUTO".

BEFORE YOU REPLY, SELF-CHECK AND FIX
  [ ] Count of questions and marks match this part exactly.
  [ ] Every id is unique and follows the pattern; every MCQ has 4 distinct options and a valid answerIndex.
  [ ] Every numeric answer and snippet output was re-derived.
  [ ] Difficulty counts and topic coverage match the lists above.
  [ ] (Part C) a tree or graph problem exists (isTreeOrGraph:true and tree/graph wording in title or statement); the two problems are in different domains; at least 10 tests each (including >= 2 boundary/corner and >= 1 max); test marks sum to 10; sample outputs are correct; the reference solution is correct.
  [ ] The JSON is valid and complete, not truncated.
If the reply would be too long, stop cleanly at a question boundary and tell me, but never output invalid or incomplete JSON as if it were finished.

Now produce Part A.`;

function fallbackCopy(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!ok) {
    throw new Error('Clipboard copy failed');
  }
}

export async function copyPromptToClipboard() {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(GENERATION_PROMPT);
      return true;
    } catch {
      // Fallback to hidden textarea + execCommand
    }
  }
  fallbackCopy(GENERATION_PROMPT);
  return true;
}

export function downloadPromptAsTxt() {
  const blob = new Blob([GENERATION_PROMPT], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'pet-question-generation-prompt.txt';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
