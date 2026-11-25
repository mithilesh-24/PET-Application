# Project Structure

Annotated repository tree verified directly from the workspace filesystem:

```text
pet-prep/
├── package.json                          Root workspace scripts (dev, build, start, setup, setup:sandbox, doctor, test, test:e2e, lint, verify:bundle)
├── package-lock.json                     Exact dependency lockfile across workspaces
├── eslint.config.js                      ESLint 9 flat config for backend, frontend JSX, scripts, and tests
├── playwright.config.js                  Playwright configuration (1 worker, 120s timeout, Vite dev webServer)
├── start.bat / start.sh                  Single-port production launcher wrappers (Windows / POSIX)
├── README.md / CHANGELOG.md / CONTRIBUTING.md
├── docs/                                 Technical documentation suite
├── scripts/
│   ├── setup.mjs                         Workspace installer + Windows sandbox build + doctor check
│   ├── build-windows-sandbox.mjs         Compiles PetSandboxLauncher.cs via .NET csc.exe
│   └── check-bundle.mjs                  CI check scanning built assets for secrets & forbidden field names
├── backend/
│   ├── server.js                         Express app factory, Helmet/CSP, rate limiter, SPA static serving, graceful shutdown
│   ├── config.js                         Server port, CORS, DATA_DIR, payload caps, and storage paths
│   ├── package.json                      Backend dependencies & Vitest script
│   ├── compiler/
│   │   ├── executionConfig.js            Env parsing & startup bounds validation (EXEC_*)
│   │   ├── executionEngine.js            ExecutionEngine, bounded semaphore queue, workspace manager & sweeper
│   │   ├── languageRunner.js             C, C++, Java (Main.java normalization), Python (-I -B) command builders & output normalization
│   │   ├── compilerDetector.js           Host toolchain + OS sandbox capability probe
│   │   ├── doctor.js                     CLI diagnostics table (`npm run doctor`)
│   │   └── sandbox/
│   │       ├── sandboxDriver.js          OS driver selector, fail-closed DISABLED guard & dev insecure fallback
│   │       ├── linuxSandbox.js           Linux bubblewrap / nsjail / firejail + prlimit driver
│   │       ├── macosSandbox.js           macOS Seatbelt (sandbox-exec) + ulimit driver
│   │       ├── windowsSandbox.js         Windows AppContainer / WRITE_RESTRICTED driver
│   │       └── windows/
│   │           ├── PetSandboxLauncher.cs C# Win32 Job Object + AppContainer / Restricted Token launcher source
│   │           └── PetSandboxLauncher.exe Compiled Windows launcher binary (gitignored)
│   ├── database/
│   │   ├── schema.sql                    SQLite tables, CHECK constraints, cascades, and indexes
│   │   ├── database.js                   better-sqlite3 connection (WAL, FK ON), migrations, online backupDatabase()
│   │   └── repositories.js               8 domain repositories + results/attempt joins
│   ├── middleware/
│   │   ├── errorHandler.js               Contract E JSON formatter (AppError, ZodError, Multer, 404, 500)
│   │   ├── rateLimit.js                  Sliding-window rate limiter on /api/attempts/:id/code/*
│   │   └── upload.js                     Unused standalone Multer memory middleware (paperRoutes.js defines paperUpload)
│   ├── routes/
│   │   ├── healthRoutes.js               GET /api/health & GET /api/health/diagnostics
│   │   ├── compilerRoutes.js             GET /api/settings/compilers
│   │   ├── settingsRoutes.js             GET/POST /api/settings, POST /settings/backup, POST /settings/rebuild-runner
│   │   ├── paperRoutes.js                POST /papers/import, GET/DELETE /papers
│   │   ├── examRoutes.js                 Attempts, state, start/submit section, answer, next, violation, terminate, /code/*
│   │   ├── resultRoutes.js               GET /attempts/:id/result & /review
│   │   └── historyRoutes.js              GET /history, /analytics, /compare, /export, DELETE /attempts/:id
│   ├── schemas/
│   │   ├── paperSchema.js                Fixed 67-question / 100-mark KEC PET Zod & domain rules
│   │   └── routeParams.js                Path-traversal-safe ID validator & directory containment guard
│   ├── services/
│   │   ├── questionValidator.js          Part A/B/C merging and strict schema/difficulty/domain checks
│   │   ├── codingVerifier.js             Import-time sandbox verification of inputGenerators, AUTO outputs, and samples/hidden tests
│   │   ├── paperImportService.js         .petdraft / .pet parsing, verification, encryption & persistence
│   │   ├── encryptionService.js          AES-256-GCM PET1 encryption & ciphertext SHA-256
│   │   ├── decryptionService.js          PET1 header verification & authenticated decryption
│   │   ├── keyStore.js                   OS keychain (optional keytar) + 0600 file key fallback
│   │   ├── examEngine.js                 Server-authoritative timer, section locks, forward-only & violation termination
│   │   ├── judgeService.js               Run/Submit/Draft coding grader & hidden-test redaction
│   │   ├── evaluationService.js          Golden scoring engine across S1, S2, S2A & topics
│   │   ├── resultService.js              Ended-attempt gate for /result and /review
│   │   └── historyService.js             Past tests, weak-topic analytics (>=3 threshold), compare (2-4), JSON/CSV export
│   └── tests/                            12 Vitest suites + golden paperFixtures.js
├── frontend/
│   ├── index.html                        Vite HTML shell
│   ├── vite.config.js                    Vite proxy (/api -> localhost:4000) & jsdom test config
│   ├── package.json                      Frontend dependencies
│   └── src/
│       ├── main.jsx & App.jsx            Router setup with lazy Results route chunk
│       ├── components/                   CodeEditor (local Monaco), CodingWorkspace, CompilerOutput, MCQOptions, PaperUploader, ProgressIndicator, SafeQuestionText, SnippetBlock (PrismJS), Timer, TransitionScreen
│       ├── pages/                        Home, Upload, Instructions, Exam, Results, History, Settings, Syllabus
│       ├── services/                     apiClient, examApi, historyApi, paperApi, resultApi, promptService, timeFormat, useExamMonitor
│       └── styles/                       global.css, exam.css, codetantra-layout.css
├── e2e/                                  5 Playwright browser specs (m4, m6, m7, m9, m12)
├── Past pet question/                    Reference PET PDFs (not processed at runtime)
└── database/, question-banks/, execution/, results/   Runtime data directories (gitignored artifacts)
```
