# PET Prep - Module-by-Module Build Prompts

Nov 25, 2026 · @mithilesh

## How to use this pack

Your single 21-section prompt is split into one Master Context Prompt, one shared-contracts block, 13 build modules (M0 to M12) and the full in-app question-generation prompt. Paste the Master Context and Shared Contracts once at the start of a session in Claude Code (or any coding agent), then give it one module at a time. Do not move to the next module until the current module's acceptance checks pass and the work is committed to git.

| Module | Builds | Depends on |
| --- | --- | --- |
| M0 | Scaffold, config, error format | none |
| M1 | Paper schema and validator | M0 |
| M2 | AES-256-GCM crypto and key storage | M0 |
| M3 | SQLite schema and repositories | M0 |
| M4 | Landing page, prompt copy, upload and import | M1, M2, M3 |
| M5 | Exam engine: timers, sections, next-only, autosave | M3, M4 |
| M6 | CodeTantra-style exam UI for MCQ and snippets | M5 |
| M7 | Fullscreen and violation monitoring | M5, M6 |
| M8 | Compiler detection and Docker sandbox | M0 |
| M9 | Monaco coding screen and hidden-test judge | M5, M6, M8 |
| M10 | Scoring and results dashboard | M5, M9 |
| M11 | Past tests, analytics, compare, export | M10 |
| M12 | Hardening, scripts, README, end-to-end tests | all |

M1, M2, M3 and M8 are independent of each other, so they can be built in parallel if you run several agents.

### Changes made to your original spec

These are deliberate. Each fixes a problem that would otherwise surface late in the build.

1. **The AI never produces .pet files.** A language model cannot run AES-GCM reliably. The external AI outputs a plain `.petdraft` JSON file; the backend validates it and encrypts it into a `.pet` package at import. This matches your own fallback path, but makes it the only path.
2. **Reference-solution verification at import.** LLMs get hidden-test expected outputs wrong often. Each coding question must include a reference solution in C++ or Python; M9 runs it in the sandbox against every test and rejects the paper if any expected output differs. This is the biggest quality gain in the pack.
3. **Three-part generation.** 67 questions with 20+ test cases will often exceed one AI response. The prompt supports Part A (Section 1), Part B (Section 2) and Part C (Section 2a), each a separate `.petdraft`; M4 merges them. A single complete file is also accepted.
4. **Contracts defined once.** The file schema, database tables, API list and error shape are fixed in the Shared Contracts section so modules built in different sessions still fit together.
5. **Docker is required, with no silent fallback.** If Docker is missing, coding questions are blocked and Settings shows how to install it. A `PET_UNSAFE_LOCAL_EXEC=1` developer flag exists but is off by default and labelled as unsafe.
6. **Monaco bundled locally.** Monaco's default loader fetches from a CDN, which breaks the offline requirement. M9 configures it from the npm package.
7. **CodeTantra layout described, not copied.** The coding agent cannot browse a private CodeTantra exam. M6 contains a written layout spec; attach your own screenshot to the M6 session for closer matching.
8. **Proctoring honesty.** Browser checks catch tab switches and fullscreen exits only. The docs and UI say so; nothing claims OS-level lockdown.

## Master Context Prompt

Paste this once per session, before any module prompt. It replaces the repeated background in your original brief.

```text
ROLE
You are a senior full-stack engineer building PET Prep: a local-first, CodeTantra-style online placement examination platform for CSE Software Only students of Kongu Engineering College. It is a real exam system, not a demo. No mock data, no placeholder components, no dead buttons.

PRODUCT FLOW
1. Landing page has a button that copies a long AI question-generation prompt.
2. User pastes it into an external AI (ChatGPT, Gemini, Claude) and downloads the output as .petdraft (JSON).
3. User uploads it. Backend validates, verifies coding tests against reference solutions, then encrypts to a .pet package (AES-256-GCM) and stores it.
4. User takes a 150-minute, 3-section exam: Section 1 -> Section 2 -> Section 2a. Forward only.
5. Code runs on the local machine in Docker sandboxes. Results are stored in SQLite and reviewed later.

EXAM PATTERN (fixed, 67 questions, 100 marks, 150 minutes)
Section 1 (50 min, 40 marks, 40 Qs): Aptitude 15, Reasoning 15, Verbal 10; 1 mark each.
Section 2 (50 min, 40 marks, 25 Qs): 5 subjects x (2 one-mark MCQ + 2 two-mark HOT MCQ) = 20 Qs, 30 marks; plus 5 code-snippet MCQs at 2 marks = 10 marks. Subjects: CC01 DSA, CC02 Java/OOP, CC03 DBMS, CC04 OS, CC05 CN.
Section 2a (50 min, 20 marks, 2 Qs): 1 Medium + 1 Hard coding problem, 10 marks each. At least one must be a tree or graph problem (preferably the Hard one). The two problems must be in different algorithmic domains.
Languages for snippets and coding: C (gcc), C++ (g++), Java (JDK), Python 3.

STACK
Frontend: React + Vite + React Router + Monaco Editor (bundled locally, no CDN) + plain CSS or Tailwind.
Backend: Node.js (LTS) + Express + node:crypto + better-sqlite3 + Zod.
Sandbox: Docker. Database: SQLite file.
Must work fully offline after install. No online compiler API, no external AI API, no cloud storage.

REPO LAYOUT (exactly this)
pet-prep/
  frontend/src/{components,pages,services,styles}
  backend/{routes,services,compiler,database,middleware,schemas}
  database/  question-banks/encrypted/  results/  execution/temporary/  docker/
  package.json (root scripts)  README.md

HARD RULES (never violate)
1. The backend is the single source of truth. Answer keys, hidden test cases, explanations and reference solutions never reach the browser until the relevant section or exam is submitted. Never store them in localStorage or in API responses during an attempt.
2. Timers are server-authoritative. Persist section start and deadline in SQLite. The client only displays a countdown synced from the server. A refresh must not reset or extend time.
3. Navigation is forward-only. There is no Previous action, no question palette that jumps, and no way to reopen a submitted section. Enforce this on the server, not only in the UI.
4. Encryption: AES-256-GCM, random 32-byte key, unique 96-bit nonce per encryption, auth tag verified, magic bytes PET1, version byte. Keys never appear in frontend code or the repo. Base64 is not encryption. Do not claim protection against someone with admin access to the machine.
5. Never run untrusted code in the Express process. Use Docker with: no network, memory and CPU limits, pids limit, read-only root filesystem, a temp directory per run, non-root user, timeout (default 5 s, max 10 s), guaranteed cleanup.
6. Validate every request body with Zod. Use the single error format from Shared Contracts.
7. No claim of OS-level lockdown. Browser monitoring detects tab switches and fullscreen exits only; say so in the UI and README.
8. Do not reproduce CodeTantra logos, trademarks or private assets. Reproduce the layout and interaction style only.

WORKING METHOD FOR EVERY MODULE
- Read the Shared Contracts and the module prompt fully before writing code.
- Build only the current module; do not stub or rewrite other modules. If a contract needs changing, stop and say so.
- Write tests for the module's acceptance checks and run them. Run the app where relevant.
- Finish with: (a) files created or changed, (b) how to run, (c) acceptance checklist with pass or fail for each item, (d) known gaps. Do not claim a check passes unless you ran it.
- Prefer small, typed, well-named modules. Keep frontend and backend separate.
```

## Shared Contracts

Paste this after the Master Context. Every module builds against these shapes; none may change them without saying so.

```text
SHARED CONTRACTS v1

=== A. .petdraft FILE (UTF-8 JSON, produced by the external AI) ===
Top level:
{
  "format": "PETDRAFT", "version": 1,
  "part": "full" | "A" | "B" | "C",        // A=Section 1, B=Section 2, C=Section 2a
  "paperId": string,                        // same value in all parts of one paper
  "title": string, "generatedBy": string, "createdOn": "YYYY-MM-DD",
  "section1":  { "questions": [Mcq x40] }   // present when part is full or A
  "section2":  { "departmentMcqs": [Mcq x20], "snippets": [Snippet x5] }   // full or B
  "section2a": { "questions": [Coding x2] } // full or C
}

Mcq:     { id, type:"mcq", category, topic, difficulty:"medium"|"hard"|"very_hard", marks,
           text, options:[4 strings], answerIndex:0..3, explanation }
  Section 1 ids:  S1-APT-01..15, S1-REA-01..15, S1-VER-01..10 ; category in aptitude|reasoning|verbal ; marks 1
  Section 2 ids:  S2-CC01-01..04 ... S2-CC05-01..04 ; category in CC01..CC05 ; per subject: 2 with marks 1, 2 with marks 2 (HOT)
Snippet: Mcq fields + { type:"snippet", language:"c"|"cpp"|"java"|"python", code:string }   // id S2-SNP-01..05, marks 2
Coding:  { id:"S2A-01"|"S2A-02", type:"coding", title, difficulty:"medium"|"hard", domain, isTreeOrGraph:boolean,
           topic, marks:10, statement, inputFormat, outputFormat, constraints, timeLimitMs, memoryLimitMb,
           samples:[{input, output, explanation}] (2+),
           tests:[{id, input OR inputGenerator:{language:"python",code}, expectedOutput ("AUTO" allowed only with a generator), marks (multiples of 0.5), kind:"general"|"boundary"|"max"|"single"|"disconnected"|"duplicate"|"corner"}] (10+; marks sum to exactly 10),
           referenceSolution:{ language:"cpp"|"python", code },
           explanation }
Rules: ids unique across paper; exactly 4 options; answerIndex valid; marks totals per section = 40/40/20; one Medium and one Hard; at least one isTreeOrGraph true.

=== B. .pet PACKAGE (written only by the backend) ===
bytes: "PET1" (4) | version (1, =1) | nonce (12) | authTag (16) | ciphertext (rest)
plaintext = gzip(canonical JSON of the merged paper, with part="full")
AAD = "PET1" + version byte.  Key id stored in DB (papers.key_id); key material in the OS keychain (keytar) or fallback file with mode 0600 outside the repo.

=== C. SQLITE TABLES (better-sqlite3, WAL mode, foreign keys ON) ===
settings(key PK, value)
papers(id PK, paper_id UNIQUE, title, file_path, key_id, sha256, question_count, total_marks, created_at, verified_at)
attempts(id PK, paper_id FK, status[not_started|running|completed|terminated|abandoned], started_at, ended_at, violation_limit, termination_reason, current_section, current_index)
section_state(attempt_id FK, section[S1|S2|S2A], started_at, deadline_at, submitted_at, status[locked|open|submitted|expired], PK(attempt_id, section))
responses(attempt_id FK, question_id, section, selected_index, time_spent_ms, saved_at, PK(attempt_id, question_id))
coding_submissions(id PK, attempt_id FK, question_id, language, source, is_final, submitted_at)
coding_test_results(submission_id FK, test_id, passed, status[pass|fail|tle|rte|ce], runtime_ms, memory_kb, marks_awarded)
violations(id PK, attempt_id FK, type[tab_hidden|fullscreen_exit|window_blur|devtools|copy_paste], at, section, question_id)
results(attempt_id PK FK, total, section1, section2, section2a, breakdown_json, computed_at)

=== D. API (all JSON, prefix /api) ===
GET  /health, /settings/compilers            POST /settings
POST /papers/import (multipart: 1-3 files)    GET /papers    DELETE /papers/:id
POST /attempts (paperId, violationLimit)      GET /attempts/:id/state     POST /attempts/:id/start-section
GET  /attempts/:id/question                   // ONLY the current question, answers stripped
POST /attempts/:id/answer  (questionId, selectedIndex)
POST /attempts/:id/next                       POST /attempts/:id/submit-section
POST /attempts/:id/violation                  POST /attempts/:id/terminate
POST /attempts/:id/code/run (questionId, language, source, stdin?)   // samples only
POST /attempts/:id/code/submit (questionId, language, source)        // hidden tests, returns counts only
GET  /attempts/:id/result    GET /attempts/:id/review (only after completion)
GET  /history  GET /history/analytics  GET /history/compare?ids=  GET /attempts/:id/export?format=json|csv  DELETE /attempts/:id

=== E. ERROR FORMAT (every non-2xx) ===
{ "error": { "code": "UPPER_SNAKE", "message": "human readable", "details": optional } }
Codes include: VALIDATION_FAILED, PAPER_INVALID, PAPER_CORRUPT, PAPER_VERSION_UNSUPPORTED, SECTION_LOCKED, SECTION_EXPIRED,
BACKWARD_NAVIGATION_FORBIDDEN, ATTEMPT_TERMINATED, COMPILER_MISSING, DOCKER_UNAVAILABLE, EXECUTION_TIMEOUT, NOT_FOUND.
```

## Foundation modules (M0 to M4)

### M0 – Scaffold

```text
MODULE M0 - SCAFFOLD
GOAL: A runnable empty shell with the exact repo layout, tooling and conventions.
BUILD:
- Root package.json with npm workspaces (frontend, backend). Scripts: dev (runs both with concurrently), build, start, test, lint, setup (checks Node version, installs deps, runs M8 doctor if present).
- backend: Express app in server.js on port 4000, JSON body limit 2 MB, multipart limit 25 MB, CORS only for the Vite origin, helmet, request logging, central errorHandler middleware producing Contract E, GET /api/health.
- frontend: Vite + React + React Router with routes: / (Home), /upload, /instructions/:paperId, /exam/:attemptId, /results/:attemptId, /history, /settings, /syllabus. Each page renders a titled placeholder ONLY in this module (later modules fill them). Vite proxies /api to 4000.
- Config module reading env with defaults (PORT, DATA_DIR, VIOLATION_LIMIT=3). All data lives under DATA_DIR (default ./), never inside src folders.
- ESLint, Prettier, Vitest (backend and frontend), .gitignore (excludes database/*.db, question-banks, results, execution/temporary, keys).
ACCEPTANCE:
- npm run dev starts both servers; /api/health returns {ok:true,version}.
- A thrown error in a route returns Contract E JSON, not an HTML stack trace.
- npm test and npm run lint pass on the empty shell.
OUT OF SCOPE: any exam, crypto or database logic.
```

### M1 – Paper schema and validator

```text
MODULE M1 - PAPER SCHEMA AND VALIDATOR
GOAL: Pure, well-tested logic that accepts or rejects a .petdraft payload (Contract A).
BUILD (backend/schemas and backend/services/questionValidator.js):
- Zod schemas for Mcq, Snippet, Coding, each part (A, B, C) and the full paper.
- mergeParts(parts[]): combines up to three parts with the same paperId into one full paper; rejects mixed paperIds, duplicate parts, missing parts.
- validatePaper(paper): returns {valid, errors[]} where each error has path, code, message a student can understand. Collect ALL errors, do not stop at the first.
CHECKS (all required):
- Counts: Section 1 = 40 (15 aptitude, 15 reasoning, 10 verbal); Section 2 = 20 department MCQs (exactly 4 per subject CC01..CC05: two 1-mark, two 2-mark) + 5 snippets; Section 2a = 2 coding (one medium, one hard). Total 67.
- Marks: 40 / 40 / 20, total 100. Coding test marks sum to exactly 10 per question.
- IDs unique across the paper and match the naming pattern for their section.
- Every MCQ and snippet: exactly 4 non-empty, pairwise-distinct options; answerIndex integer 0..3; non-empty explanation; snippet language in c|cpp|java|python and code non-empty.
- Coding: statement, inputFormat, outputFormat, constraints present; 2+ samples; 10+ tests, each with either input or inputGenerator (expectedOutput AUTO is valid only alongside a generator); at least 2 tests of kind boundary or corner and 1 of kind max; timeLimitMs 1000..10000; referenceSolution present with language cpp or python.
- At least one coding question has isTreeOrGraph = true and its statement mentions tree, graph, node, vertex or edge (heuristic sanity check). Warn (not error) if the Hard problem is not the tree/graph one.
- Duplicate detection: normalised question text (lowercase, collapse whitespace, strip punctuation) must be unique; flag near-duplicates by Jaccard similarity >= 0.85 on word sets as errors.
- Reject answer distributions that look degenerate: any single answerIndex used for more than 60 percent of MCQs in a section is a warning.
TESTS: build fixtures of one valid full paper and at least 25 invalid variants (one defect each) and assert the exact error code for each.
ACCEPTANCE: all fixtures behave as expected; validator never throws on malformed JSON, it returns errors.
```

### M2 – Crypto and key storage

```text
MODULE M2 - ENCRYPTION AND KEY MANAGEMENT
GOAL: Store question papers encrypted at rest; reject tampered files.
BUILD (backend/services/encryptionService.js, decryptionService.js, keyStore.js):
- encryptPaper(paperObject) -> Buffer in Contract B format. gzip canonical JSON, AES-256-GCM, fresh 12-byte random nonce per call, AAD = magic+version.
- decryptPaper(buffer) -> paperObject. Throw typed errors: PAPER_CORRUPT (bad magic, truncated, auth failure, bad gzip), PAPER_VERSION_UNSUPPORTED.
- keyStore: generate a random 32-byte key on first run. Prefer the OS keychain (keytar). If unavailable, write DATA_DIR-external file (for example ~/.pet-prep/keys/<keyId>.key) with mode 0600 and log one clear warning. Support key ids so a new key can be added later without breaking old papers.
- Never log keys or plaintext. Never send them over the API.
- Write files atomically (temp file then rename). Compute sha256 of the ciphertext for the papers table.
TESTS: round-trip; flip one byte in each region (magic, version, nonce, tag, ciphertext) and assert rejection; truncated files; two encryptions of the same paper differ; wrong key fails; 10,000 nonces have no collision.
ACCEPTANCE: all tests pass. Document in README what this protects (files at rest, casual inspection) and what it does not (a person with admin access to the machine).
```

### M3 – SQLite layer

```text
MODULE M3 - DATABASE
GOAL: Persistent store implementing Contract C with a clean repository API.
BUILD (backend/database):
- schema.sql exactly per Contract C, plus indexes on attempts(paper_id), responses(attempt_id), violations(attempt_id).
- database.js opens DATA_DIR/database/pet-history.db with WAL and foreign_keys=ON, runs versioned migrations (a migrations table), supports a test mode with :memory:.
- Repositories: settingsRepo, papersRepo, attemptsRepo, sectionStateRepo, responsesRepo, codingRepo, violationsRepo, resultsRepo. All functions use prepared statements and return plain objects; multi-step writes use transactions.
- Backup: backupDatabase() copies the DB using SQLite's online backup API into DATA_DIR/database/backups/ with a timestamp, keeping the latest 10; called on startup and after each completed attempt.
TESTS: migration is idempotent; foreign-key cascade on delete attempt; a transaction failure rolls back; backup file opens and has the same row counts.
ACCEPTANCE: all repo tests pass against :memory: and a temp file.
```

### M4 – Landing page, prompt copy, upload and import

```text
MODULE M4 - LANDING, PROMPT, UPLOAD, IMPORT
GOAL: The complete front door. A user can copy the prompt, upload 1 to 3 .petdraft files, and see a stored, verified paper ready to start.
LANDING PAGE (Home.jsx): professional, light, academic. Header "PET PREP", subtitle "Your Personal PET Examination Preparation Platform". Main card "Generate Your PET Mock Test" with the 6-step instructions (copy prompt, open external AI, paste, download file, upload here, start exam), supported AI suggestions (ChatGPT, Gemini, Claude), accepted extensions (.petdraft, and .pet for packages exported from this app), and a note that all exam data and code execution stay on this computer. Stat strip: 3 Sections, 67 Questions, 100 Marks, 150 Minutes, 4 Languages. Buttons: Copy AI Question Generation Prompt, Upload Question Paper, Past Tests, View Syllabus, Settings. Every button works.
PROMPT COPY: frontend/src/services/promptService.js exports the full generation prompt as a constant (use the text from the section "The in-app AI question-generation prompt" verbatim). The button copies the ENTIRE constant with navigator.clipboard.writeText, falling back to a hidden textarea and execCommand if the Clipboard API is blocked. Show toast "PET question-generation prompt copied successfully." Also offer a collapsible read-only preview of the prompt and a Download as .txt link. Do not navigate away. Add a unit test asserting the copied text contains every required section keyword.
UPLOAD (/upload and a modal from Home): drag and drop plus file picker, 1 to 3 files, max 10 MB each. Client checks extension only; server decides validity.
IMPORT PIPELINE (POST /api/papers/import):
1. Parse JSON (strip a UTF-8 BOM, tolerate a single wrapping markdown code fence, reject anything else with a clear message).
2. mergeParts if several files, then validatePaper (M1). On failure return PAPER_INVALID with all errors; the UI shows them grouped by section with the question id.
3. If M8/M9 is available: run the coding verification hook (stub returns ok until M9 replaces it) - the extension point must exist now: verifyCodingTests(paper) -> {ok, failures[]}.
4. Encrypt (M2), write to question-banks/encrypted/<paperId>.pet, insert into papers (M3).
5. Return summary: title, counts, total marks, whether tree/graph requirement is satisfied.
INSTRUCTIONS PAGE (/instructions/:paperId): lists the exam rules (sections, timings, forward-only, violation limit selectable 3 or 5, fullscreen requirement, honest note on browser-monitoring limits), a required checkbox, and a Start Exam button that creates the attempt (POST /api/attempts) - the exam itself arrives in M5/M6.
TESTS: valid file imports; each of 10 corrupt or invalid files returns the right code; prompt-copy unit test; Playwright smoke test of copy button using clipboard permission.
ACCEPTANCE: import a valid paper, restart the server, the paper is still listed; an invalid paper never reaches disk or DB.
```

## Exam modules (M5 to M7)

### M5 – Exam engine (backend)

```text
MODULE M5 - EXAM ENGINE
GOAL: A server-side state machine that makes cheating by manipulating the client impossible for time, order and answers.
BUILD (backend/services/examEngine.js, routes/examRoutes.js):
- Question order inside each section is fixed by the paper: Section 1 (aptitude, reasoning, verbal in that order), Section 2 (department MCQs grouped by subject, then snippets), Section 2a (medium then hard).
- State machine per attempt: S1 -> S2 -> S2A -> completed. States per section: locked, open, submitted, expired. Only one section is open at a time. If a submitted section is followed by a locked one and 60 seconds pass without a start call, the server starts the next section itself.
- POST /attempts creates the attempt and the three section_state rows (all locked). POST /start-section opens ONLY the next locked section in order, sets started_at = now and deadline_at = now + 50 minutes, and refuses any other section (SECTION_LOCKED).
- GET /question returns exactly the current question with answer key, explanation and hidden tests removed. Include: index, total in section, marks, type, text/options/code or coding statement, seconds remaining from the SERVER clock.
- POST /answer upserts a response for the CURRENT question only (reject other ids with BACKWARD_NAVIGATION_FORBIDDEN). Reject if section is not open or past deadline.
- POST /next advances current_index only if the current question has a saved response or the client sent an explicit unanswered:true confirmation (stored as an unanswered response). It never moves backwards. After the last question of a section it requires submit-section.
- POST /submit-section locks the section, marks it submitted, and when the section is S1 or S2 returns the transition info for the next section. After S2A it marks the attempt completed and triggers scoring (M10).
- Expiry: a lazy check on every request PLUS a server interval (every 5 s) that auto-submits any open section past its deadline, scores what exists, and opens the transition. A client that is closed must not extend time.
- Recovery: after a refresh or server restart, GET /state returns section, index and remaining time; the exam resumes at the same question. Time spent while the server was down still counts (deadline is absolute).
- Time stored as UTC epoch ms. Add a clock-skew-safe client sync: server sends serverNow with each response so the client can display an accurate countdown.
- Violation hooks: POST /violation and /terminate are implemented in M7, but the engine exposes terminateAttempt(reason) now, which submits nothing further, sets status terminated and locks all sections.
TESTS (fake clock injected): cannot start S2 before S1 submitted; cannot answer a question other than the current one; cannot go back; deadline auto-submit with 0 responses and with partial responses; restart mid-section resumes with correct remaining time; answer after deadline rejected; two concurrent next calls advance only once.
ACCEPTANCE: a scripted run through all 67 questions via the API completes with correct section transitions.
```

### M6 – CodeTantra-style exam UI (MCQ and snippets)

```text
MODULE M6 - EXAM UI FOR MCQ AND SNIPPET SCREENS
GOAL: A serious, dense, academic online-assessment interface. NOT a dashboard, NOT cards, NOT gradients.
If the user attached a CodeTantra screenshot, match its proportions and placement; otherwise follow this spec. Never copy logos or proprietary assets.
GLOBAL LAYOUT (desktop first, min width 1100px; below that show a readable stacked layout, not a broken one):
- Top bar (48px, white, 1px #d0d0d0 bottom border): left = exam title and candidate label; centre = current section name ("Section 1 - Common to All"); right = countdown timer HH:MM:SS (monospace, turns red under 5 minutes), fullscreen indicator, exam status.
- Sub bar (36px, light grey #f3f3f3): question number "Question 7 of 40", category and topic chip, marks badge "1 Mark" or "2 Marks", question type badge.
- Body: two columns. Left 72 percent = question panel with 1px border and 16px padding. Right 28 percent = information panel (NOT a navigator): current question, section progress bar with "7 of 40 answered/seen", counts of answered and unanswered so far, section time remaining, violations used "1 / 3". Question numbers in the right panel are display-only: no click handlers, no hover affordance, aria-disabled.
- Bottom action bar (56px, fixed, light grey, top border): Clear Response (left), Previous (always rendered, always disabled, with title "Not allowed in this examination"), Save and Next (primary, right), and on the last question of a section Save and Submit Section with a confirmation dialog.
STYLE: white and #f7f7f7 backgrounds, #222 text, one accent colour (#1a73e8 or similar) used only for primary action and selected option, 14-15px system font, 4px max radius, no shadows except the dialog, no animation beyond a 150ms colour transition. Put the layout in styles/codetantra-layout.css and exam.css.
MCQ SCREEN: question text with preserved line breaks and a safe renderer for inline code; four options as radio rows lettered A to D with a clear selected state; selecting saves via POST /answer immediately (optimistic UI with retry and a visible "Saved" or "Not saved - retry" indicator). Save and Next calls /answer then /next.
SNIPPET SCREEN: language badge, read-only code block with syntax highlighting (use Monaco in read-only mode or Prism, bundled locally), line numbers, then the question and four options as above. Code area scrolls independently.
TRANSITION SCREEN between sections: shows the score-free summary ("Section 1 submitted. 38 of 40 answered."), the rules for the next section, and a Start Section button that calls /start-section. The next section starts when Start Section is pressed or automatically after a 60-second countdown shown on this screen, whichever comes first; the server enforces the same 60-second limit (M5 auto-starts the next section), so the transition cannot be used to delay or gain time.
TIMER COMPONENT: displays server-synced remaining time, re-syncs every 15 seconds and on tab focus, at zero calls /state and navigates to the transition screen.
ACCESSIBILITY: keyboard shortcuts 1-4 select option, Enter = Save and Next; focus management after navigation; sufficient contrast.
TESTS: component tests for MCQOptions, Timer, ProgressIndicator; Playwright run through 3 questions asserting Previous is disabled and a forged click on a numbered item does nothing; screenshot comparison at 1366x768 and 1920x1080.
ACCEPTANCE: a full Section 1 can be completed in the browser; refresh mid-question returns to the same question with the correct time left.
```

### M7 – Fullscreen and violation monitoring

```text
MODULE M7 - FULLSCREEN AND VIOLATIONS
GOAL: Honest, reliable browser-level exam monitoring.
BUILD:
- Start-of-exam gate: rules recap, required checkbox, a button that calls document.documentElement.requestFullscreen() (must be a user gesture). The exam does not render until fullscreen is active.
- Detectors in a useExamMonitor hook: document visibilitychange (hidden), fullscreenchange (exited), window blur (debounced 500 ms and only when it is not caused by our own dialogs), optional copy/cut/paste/contextmenu blocking on question text (not in the code editor, where paste must work). Each detection sends POST /violation {type, section, questionId}.
- Server rules: record in violations table; return {count, limit, remaining}. Violation limit comes from the attempt (3 default, selectable 5). When count > limit (the 4th violation if limit is 3) the server terminates the attempt with reason, locks sections and returns ATTEMPT_TERMINATED to every further call. Ignore duplicate events of the same type within 1 second (one real action often fires two events).
- UI: a blocking warning dialog after each violation: "Warning 2 of 3. Return to fullscreen to continue." with a Return to Fullscreen button. The exam timer keeps running behind the dialog (do not pause time). Termination screen shows reason and a link to results/review of what was submitted.
- Do NOT count the legitimate fullscreen exit that happens when the exam is finished or the user is navigated to results.
- Settings: violation limit 3 or 5 (applies to new attempts only).
DOCUMENT honestly in README and on the instructions page: this cannot stop OS-level app switching, a second device, screenshots, virtual machines or someone helping the student. It only records browser-visible events.
TESTS: Playwright dispatching visibilitychange and fullscreenchange events; server test that the 4th violation terminates when the limit is 3 and the 6th when it is 5; duplicates within 1 s counted once; terminated attempt rejects /answer.
ACCEPTANCE: all of the above pass; violation rows contain type, timestamp, section and question id.
```

## Coding modules (M8 and M9)

### M8 – Compiler detection and Docker sandbox

```text
MODULE M8 - COMPILERS AND SANDBOX
GOAL: Run C, C++, Java and Python submissions safely on the local machine and report precise results.
BUILD (backend/compiler/compilerDetector.js, dockerRunner.js, languageRunner.js; docker/):
- Detector: run gcc --version, g++ --version, javac -version, java -version, python3 --version (python on Windows), docker version. Return {tool, available, version, path, installHint}. Expose via GET /api/settings/compilers and a CLI script npm run doctor. Provide OS-specific install hints (Windows, macOS, Ubuntu) for anything missing.
- Images: docker/Dockerfile.runner builds ONE small image (pet-runner:1) containing gcc, g++, OpenJDK, Python 3, a non-root user, and a tiny supervisor script. npm run setup:docker builds it. Offline use after the first build.
- runSubmission({language, source, stdin, timeLimitMs, memoryLimitMb}) -> {compile:{ok,stderr,ms}, run:{exitCode,signal,stdout,stderr,ms,memoryKb,status}} where status is one of ok, tle, rte, mle, ce.
- Sandbox flags (all required): --network none, --memory <limit> --memory-swap same, --cpus 1, --pids-limit 64, --read-only, --tmpfs /tmp with size and noexec disabled only for the compile output directory, --cap-drop ALL, --security-opt no-new-privileges, --user non-root, workdir mounted from a unique temp directory under execution/temporary/<uuid>, container name unique, killed on timeout, directory removed in a finally block. Also remove stale containers and directories on startup.
- Limits: default timeout 5 s, hard cap 10 s, stdout and stderr each truncated at 1 MB with a note, source size cap 100 KB. Compile once per submission then run each test with the compiled artefact; do not recompile per test.
- Languages: c (gcc -O2 -std=c17 -lm), cpp (g++ -O2 -std=c++17), java (javac then java with -Xmx set from memory limit; entry class must be Main), python (python3 -u, no pip).
- Output normalisation helper: compare after converting CRLF to LF, trimming trailing whitespace on each line and trailing blank lines at the end only. Never ignore differences in inner whitespace or letter case.
- If Docker is unavailable return DOCKER_UNAVAILABLE with install steps. The ONLY fallback is the developer flag PET_UNSAFE_LOCAL_EXEC=1, which must print a loud warning, never be the default and never be mentioned as a normal option in the UI.
TESTS (run against real Docker): hello world in each language; compile error captured; runtime error exit code; infinite loop killed at the limit; memory bomb killed; fork bomb contained; network call fails; file write outside tmp fails; reading host files fails; leftover containers and directories are zero after 20 runs.
ACCEPTANCE: all tests pass; npm run doctor prints a clear table.
```

### M9 – Coding screen, hidden-test judge and import verification

```text
MODULE M9 - CODING SCREEN AND JUDGE
GOAL: A professional coding-assessment screen plus a trustworthy judge.
BACKEND (services/judgeService.js, routes in examRoutes and compilerRoutes):
- POST /code/run: compile and run the student's code on ONE input (a sample test or custom stdin, max 8 KB). Returns compile result, stdout, stderr, status and time. Never touches hidden tests. Rate-limit to 1 run per 3 seconds per attempt.
- POST /code/submit: compile once, run against ALL hidden tests plus samples, award marks per passed test using the tests[].marks field, store the submission and one coding_test_results row per test. Response contains only: compile status and message, total tests, passed count, per-test status in order (pass, fail, tle, rte, ce) WITHOUT inputs or expected outputs, runtime, marks so far. A later submit replaces the earlier one for that question; the last successful submit is final. Submissions accepted only while Section 2a is open; autosave the editor draft (POST /code/draft) every 10 seconds and on language switch.
- When the section deadline passes, auto-submit the last saved draft for each question that has no submission, then judge it.
- verifyCodingTests(paper) (replaces the M4 stub): first run every inputGenerator in the sandbox (Python, 5 s, output at most 1 MB) to produce inputs and fill every expectedOutput of AUTO from the reference solution, storing the resolved values in the encrypted paper; then, for each coding question, compile and run the referenceSolution on every sample and hidden test inside the sandbox; the output must equal expectedOutput under the normalisation helper. Also run it with a deliberately wrong trivial solution (print 0) and warn if it passes more than 30 percent of tests, meaning the tests are weak. Any mismatch rejects the import with the failing test id, the expected output and the reference output, so the user can regenerate just that question.
FRONTEND (Exam page, coding mode; components CodeEditor, CompilerOutput):
- Layout: left 40 percent problem panel (title, difficulty badge, marks, statement, input format, output format, constraints, samples with copy buttons and explanations, time and memory limits); right 60 percent editor panel. A vertical drag handle resizes the panels (persist width per attempt). Below the editor a resizable output panel with tabs: Custom Input, Run Output, Test Results.
- Toolbar above the editor: language selector (C, C++, Java, Python), Run Code, Submit Code, Reset to Template, font size. Per-language starter template with the correct main signature and fast IO hints. Switching language keeps a separate draft per language and asks before overwriting.
- Monaco Editor bundled from the npm package using @monaco-editor/react with loader.config({monaco}) so it works with NO network. Syntax highlighting, indentation, bracket matching, line numbers, Ctrl+Enter to run.
- Test Results tab: Compilation successful or failed (with compiler message), a row per test showing Sample 1..n, Hidden 1..N with pass or fail icon, runtime ms, memory if available, and the marks obtained so far. Never show hidden inputs or expected outputs. Sample tests may show input, expected and actual output.
- Right info panel keeps the same display-only question list from M6. Footer actions: Save Draft, and Save and Next (with an unanswered confirmation if nothing was submitted). Previous remains disabled.
TESTS: judge unit tests with correct, wrong-answer, TLE, RTE and compile-error solutions in all four languages; partial-mark calculation (for example 7 of 10 tests = the sum of those tests' marks); hidden data absent from every response and from the browser network log (Playwright asserts this); import verification catches a deliberately wrong expectedOutput; offline test with the network disabled.
ACCEPTANCE: solve a known tree problem in each of the four languages via the UI and receive full marks; a wrong solution receives partial marks.
```

## Closing modules (M10 to M12)

### M10 – Scoring and results dashboard

```text
MODULE M10 - SCORING AND RESULTS
GOAL: Correct, reproducible marks and a complete result and review experience.
BUILD (services/evaluationService.js, resultService.js; pages/Results.jsx):
- Scoring: MCQ and snippet = marks if selectedIndex equals answerIndex, else 0 (no negative marking). Coding = sum of marks of passed hidden tests (samples carry no marks unless also listed in tests). Unanswered = 0 and counted separately.
- Compute and store in results: total /100, percentage, section1, section2, section2a, aptitude, reasoning, verbal, per-subject CC01..CC05 (marks obtained and possible), snippets, coding, coding tests passed of total, correct, incorrect, unanswered counts, time used per section and total, plus per-topic accuracy (topic string from each question) for analytics.
- Scoring is idempotent: recomputing from stored responses always gives the same numbers. Terminated attempts are scored on what was submitted and flagged terminated.
- Dashboard: plain table layout consistent with the exam style: headline score and percentage, section table, category table, subject table, coding table, time table, violations list.
- Review (available only when the attempt is completed or terminated): question-wise list with the student's answer, correct answer, explanation, marks, time spent; filter by section, correct, incorrect, unanswered. For coding show the final submitted source, per-test status, and the reference solution plus explanation. GET /review returns 403-style NOT_FOUND until the attempt has ended.
TESTS: golden-file scoring on three crafted attempts (perfect, all wrong, mixed with partial coding); recompute idempotence; review blocked during a running attempt.
ACCEPTANCE: numbers on screen equal the golden values and survive a server restart.
```

### M11 – History, analytics, compare, export

```text
MODULE M11 - PAST TESTS AND PERFORMANCE
GOAL: Real, never fabricated, progress tracking.
BUILD (routes/historyRoutes.js; pages/History.jsx and a Past Tests panel on Home):
- Past Tests table: title, date, status (completed, terminated, abandoned), score /100, duration, per-section scores. Actions: View Result, Review Answers, Compare Attempts (select 2 to 4), Export, Delete (with confirmation; removes attempt rows only, keeps the paper).
- Compare: side-by-side table of every score field and a simple line chart of total score over attempts (inline SVG or a small bundled chart library).
- Weak-topic analytics: aggregate topic accuracy across attempts from stored question outcomes. Show topics ranked by lowest accuracy with attempts count, e.g. "Graph algorithms: 40% (2 of 5)". Only show a topic after at least 3 questions of it have been attempted; otherwise say "not enough data". Recommendation text is generated from these numbers only, for example "Practise Trees: 55% across 3 attempts". With zero attempts, show an empty state, no sample data.
- Export: JSON (full result and responses) and CSV (one row per question) downloads; exporting the question paper itself is not offered, to keep answers private.
TESTS: analytics against hand-computed fixtures; delete cascades; compare with 2, 3, 4 attempts; export files parse and match the DB.
ACCEPTANCE: after three seeded attempts (test fixtures only, not shipped), the weak-topic list matches a hand calculation.
```

### M12 – Hardening, scripts, docs, end-to-end

```text
MODULE M12 - HARDENING AND DELIVERY
GOAL: Something a student can install and trust.
BUILD:
- Security pass: Zod on every route; uploaded files never executed or served; path traversal tests on all file operations; helmet and strict CSP (allow Monaco workers via blob:); rate limits on /code/*; no answer keys, hidden tests, reference solutions or keys in any API response during an attempt (automated test greps every response of a full scripted attempt); no secrets in the frontend bundle (CI check greps the build for key material and for field names answerIndex and expectedOutput outside the review page).
- Reliability: graceful shutdown that cleans containers; crash-safe autosave; database backup verified; large-paper import under 3 seconds excluding Docker verification.
- Settings page: compiler and Docker status table with versions and install hints, violation limit, data folder path, Rebuild runner image button, Backup now, Open data folder instructions.
- Syllabus page: the complete syllabus lists from the exam pattern.
- Scripts: npm run setup (installs deps, runs doctor, offers to build the runner image), npm run dev, npm run build, npm run start (serves built frontend from Express on one port), start.bat and start.sh wrappers.
- Docs: README with prerequisites (Node LTS, Docker Desktop, compilers optional because compilation happens inside the image), install, first run, how to generate a paper step by step, folder layout, backup and restore, troubleshooting (Docker not running, port in use, clipboard blocked), a Security and Limitations section (encryption scope, proctoring limits), and the offline statement.
- End-to-end suite (Playwright): landing copy -> import valid fixture -> start -> finish Section 1 -> Section 2 -> Section 2a with a real solution in each language -> results -> history -> export. Plus negative runs: corrupt file, forged API calls to go backwards, timer expiry with a shortened test deadline (a test-only env var PET_TEST_SECTION_MINUTES), 4th violation termination.
- Walk the original acceptance list (landing, paper, exam, security, compiler, results, UI) and report each line as pass or fail with evidence.
ACCEPTANCE: a clean machine can go from git clone to a completed mock exam using only the README.
```

## The in-app AI question-generation prompt

M4 stores this text verbatim as the constant behind the Copy button. The student pastes it into an external AI and only types "next" between parts.

```text
You are a senior placement-examination question setter for Kongu Engineering College's PET (Placement Eligibility Test) for CSE Software Only students. You set difficult, original, verified papers. You are strict about correctness and never shorten the paper to save space.

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
6. Questions must be self-contained text. No images. Put tables and code in the text field using plain text and \n line breaks.
7. Avoid ambiguity, culture-specific trivia and anything requiring a particular compiler's behaviour.

CODING PROBLEM REQUIREMENTS (each of the 2 problems)
  - title, statement (story plus precise task), inputFormat, outputFormat, constraints (with exact ranges), timeLimitMs (1000 to 3000), memoryLimitMb (256).
  - At least 2 samples, each with input, output and a short explanation that walks through the output.
  - At least 10 hidden tests. Cover: small cases, general cases, boundary values, the maximum-size shape, a single node or element, disconnected graph or forest where relevant, duplicate or repeated edges where relevant, all-equal values, already-optimal input, and one adversarial case that defeats a naive O(n^2) or brute-force approach. Give each test a kind from: general, boundary, max, single, disconnected, duplicate, corner.
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
Snippet = an Mcq with "type":"snippet", "id":"S2-SNP-01..05", "category":"snippet", "marks":2, "language":"c"|"cpp"|"java"|"python", and "code":"<full source with \n line breaks>".
Coding = {"id":"S2A-01" or "S2A-02","type":"coding","title":"...","difficulty":"medium" or "hard","domain":"graph","isTreeOrGraph":true,"topic":"...","marks":10,"statement":"...","inputFormat":"...","outputFormat":"...","constraints":"...","timeLimitMs":2000,"memoryLimitMb":256,"samples":[{"input":"...","output":"...","explanation":"..."}],"tests":[{"id":"T01","input":"...","expectedOutput":"...","marks":0.5,"kind":"general"}],"referenceSolution":{"language":"cpp","code":"..."},"explanation":"approach and complexity"}
  A generated test uses "inputGenerator" instead of "input" and "expectedOutput":"AUTO".

BEFORE YOU REPLY, SELF-CHECK AND FIX
  [ ] Count of questions and marks match this part exactly.
  [ ] Every id is unique and follows the pattern; every MCQ has 4 distinct options and a valid answerIndex.
  [ ] Every numeric answer and snippet output was re-derived.
  [ ] Difficulty counts and topic coverage match the lists above.
  [ ] (Part C) a tree or graph problem exists; the two problems are in different domains; at least 10 tests each; test marks sum to 10; sample outputs are correct; the reference solution is correct.
  [ ] The JSON is valid and complete, not truncated.
If the reply would be too long, stop cleanly at a question boundary and tell me, but never output invalid or incomplete JSON as if it were finished.

Now produce Part A.
```
