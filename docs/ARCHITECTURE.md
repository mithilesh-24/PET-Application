# Architecture

## System Overview

PET Prep uses a split client-server local architecture where the Express backend is the single source of truth for paper decryption, timers, navigation state, violation limits, sandboxed code execution, and scoring.

```mermaid
flowchart LR
  Browser["React SPA + Monaco Editor<br/>(frontend/src, localhost:5173 or dist)"] -->|/api/* JSON & Multipart| API["Express 4 Server<br/>(backend/server.js, :4000)"]
  API --> Services["Services Layer<br/>(paperImport, examEngine, judge, eval, history)"]
  Services --> Crypto["AES-256-GCM Crypto + KeyStore<br/>(question-banks/encrypted/*.pet, ~/.pet-prep/keys)"]
  Services --> DB[("SQLite WAL<br/>database/pet-history.db")]
  Services --> Engine["ExecutionEngine + Concurrency Queue<br/>(backend/compiler/executionEngine.js)"]
  Engine --> Runners["LanguageRunner<br/>(c, cpp, java, python)"]
  Engine --> Drivers["OS SandboxDriver<br/>(Windows / Linux / macOS)"]
  Drivers --> Temp["Isolated Temp Workspace<br/>(execution/temporary/run-uuid)"]
```

## Component Responsibilities

| Layer | Modules | Responsibilities |
| --- | --- | --- |
| **Frontend UI** | `frontend/src/pages/`, `frontend/src/components/`, `frontend/src/services/` | Landing/prompt copy, `.petdraft`/`.pet` upload UI, exam rules & fullscreen gate, forward-only MCQ/snippet/coding exam workspace, client timer synced from `serverNow`, results/review dashboard, history/analytics/exports, settings, syllabus. |
| **API Middleware & Validation** | `server.js`, `errorHandler.js`, `rateLimit.js`, `routeParams.js` | Helmet CSP (`'self' blob:` workers), origin-restricted CORS, 2 MB JSON limit, 25 MB multipart limit, Zod param/body checks, sliding-window rate limiter on `/api/attempts/:id/code/*`. |
| **Paper Import & Crypto** | `questionValidator.js`, `paperImportService.js`, `codingVerifier.js`, `encryptionService.js`, `decryptionService.js`, `keyStore.js` | Merges full or A/B/C `.petdraft` files, enforces 67-Q / 100-mark rules, verifies `referenceSolution` and `"AUTO"` tests inside the sandbox, encrypts with AES-256-GCM (`PET1` header + 96-bit nonce). |
| **Exam Engine & Judge** | `examEngine.js`, `judgeService.js` | Enforces sequential `S1` -> `S2` -> `S2A` locking, server deadlines, forward-only index updates, violation tracking, draft autosave, and coding grading. |
| **Scoring & History** | `evaluationService.js`, `resultService.js`, `historyService.js` | Computes golden breakdowns, enforces post-completion review gating, aggregates weak-topic analytics (`>= 3` attempted threshold), compares 2–4 attempts, and exports sanitized JSON/CSV. |
| **Database Layer** | `database.js`, `repositories.js`, `schema.sql` | Manages SQLite connections (WAL, `foreign_keys=ON`), migrations, online `.backup()` snapshots, and parameterized repositories. |
| **Execution Engine** | `executionConfig.js`, `executionEngine.js`, `languageRunner.js`, `compilerDetector.js`, `sandbox/*` | Validates env caps, queues jobs, compiles once per submission, feeds test `stdin` into OS-native sandboxes, tracks runtime/memory, kills process trees, and cleans temp workspaces. |

## Request Flow: Student Submits Code

```mermaid
sequenceDiagram
  actor Student
  participant UI as CodingWorkspace.jsx
  participant API as examRoutes.js
  participant Judge as judgeService.js
  participant Engine as executionEngine.js
  participant Sandbox as OS SandboxDriver
  participant DB as SQLite Repositories

  Student->>UI: Click "Submit Code"
  UI->>API: POST /api/attempts/:id/code/submit {questionId, language, source}
  API->>API: rateLimit + safeId + Zod schema
  API->>Judge: submitCode(...)
  Judge->>DB: Check attempt running, S2A open, deadline not passed, current_index matches
  Judge->>DB: Decrypt paper -> load samples + hidden tests
  Note over Judge,Engine: Build tests[] with stdin ONLY (expectedOutput stripped!)
  Judge->>Engine: runSubmissionBatch({language, source, tests: [samples..., hidden...], limits})
  Engine->>Engine: Acquire semaphore slot (EXEC_MAX_CONCURRENT) & create random workspace
  Engine->>Sandbox: prepare(workDir) + compile once (writableWorkDir: true)
  loop Each sample & hidden test
    Engine->>Sandbox: run(runCmd, test.stdin, limits, writableWorkDir: false)
    Sandbox-->>Engine: {stdout, stderr, exitCode, timeMs, timedOut, memoryExceeded}
  end
  Engine->>Engine: Delete workspace & sandbox profile in finally
  Engine-->>Judge: {compile, runs[]}
  Judge->>Judge: Compare each stdout via outputsMatch() in Node process
  Judge->>DB: Insert final coding_submissions + coding_test_results
  Judge-->>UI: Sample IO/status + hidden pass/fail & marks ONLY (no hidden IO)
```

## Execution Engine & Hidden Test Isolation

1. **Public interface preserved:** Both `judgeService.js` and `codingVerifier.js` call `runSubmission` and `runSubmissionBatch`.
2. **Bounded Concurrency Queue:** `createConcurrencyQueue(EXEC_MAX_CONCURRENT)` limits active OS sandbox runs so simultaneous submissions queue cleanly without exhausting CPU/RAM.
3. **Hidden Test Privacy:** Expected outputs (`t.expectedOutput`) and input metadata (`t.id`, `t.marks`) stay strictly inside `judgeService.js` (server Node memory). `runSubmissionBatch` receives only `{ stdin }`, feeds it exclusively over standard input pipes (`stdio: ['pipe', 'pipe', 'pipe']`), and never passes tests via workspace files, CLI arguments, or environment variables.
4. **Workspace Lifecycle & Sweeper:** Each batch gets an isolated directory (`execution/temporary/run-<uuid>/`). `finally` always calls `driver.cleanup()` and removes the workspace directory; startup cleanup (`cleanupStaleWorkspaces`) and a 5-minute periodic sweeper prune stale workspaces older than 10 minutes.
5. **Diagnostics & Fail-Closed Design:** `detectCompilers()` probes host compilers plus `resolveActiveSandbox()` at startup and on demand via `GET /api/health/diagnostics` and `GET /api/settings/compilers`. If the host OS sandbox fails detection and `PET_ALLOW_INSECURE_EXECUTION` is `false` (default), execution refuses with `503 SANDBOX_UNAVAILABLE`.
