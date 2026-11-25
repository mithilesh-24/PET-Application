# Contributing to PET Prep

## Coding Standards

Code formatting and linting rules are enforced from [.prettierrc](.prettierrc) and [eslint.config.js](eslint.config.js):

- **Formatting (Prettier):** 2-space indentation, single quotes (`'`), semicolons required (`semi: true`), ES5 trailing commas, `printWidth: 100`.
- **Linting (ESLint 9):** ESM modules (`"type": "module"`), unused variables disallowed unless prefixed with `_` (`argsIgnorePattern: '^_'`), React Hooks rules enforced, React Fast Refresh component export warnings enabled.
- **Security Invariants:**
  - Never send `answerIndex`, hidden test `input`/`expectedOutput`, or `referenceSolution` to the browser during an active attempt.
  - Keep `frontend/dist/assets` free of secrets and forbidden field names outside the lazy `Results` chunk (checked via `npm run verify:bundle`).
  - Never run untrusted code outside `SandboxDriver`.

Verify changes before opening a PR:

```bash
npm run lint
npm run format:check
npm test
npm run build && npm run verify:bundle
npm run test:e2e
```

## Branch & PR Workflow

1. Create a descriptive feature/fix branch from `master` (e.g., `feat/rust-runner`, `fix/java-timeout-msg`).
2. Keep changes focused on a single concern; include unit/integration tests in `backend/tests/` or `frontend/src/**/*.test.*`.
3. Update relevant files under `docs/` when changing API shapes, schema, or environment variables.
4. Confirm all checks above pass locally and include test evidence in your PR description.

---

## How to Add a New Language Runner

1. **Declare language limits & metadata ([languageRunner.js](file:///d:/CCC/Pet%20application/backend/compiler/languageRunner.js)):**
   - Add the language identifier to `SUPPORTED_LANGUAGES`.
   - Extend `getLanguageRunner(language, options)` to return `{ language, sourceFile, sourcePath, outDir, preparedSource, compileCmd, runCmd }`. Enforce any safe runtime flags (memory caps, isolated library flags, non-interactive execution).
2. **Add configuration override ([executionConfig.js](file:///d:/CCC/Pet%20application/backend/compiler/executionConfig.js)):**
   - Add `<LANG>_PATH` parsing via `resolveOptionalToolOverride()` and expose it on `execConfig.toolchains`.
3. **Register toolchain diagnostics ([compilerDetector.js](file:///d:/CCC/Pet%20application/backend/compiler/compilerDetector.js)):**
   - Add per-OS install hints to `INSTALL_HINTS` and probe `<LANG> --version` in `detectCompilers()`.
4. **Update validation schemas & routes (if student-selectable):**
   - [examRoutes.js](file:///d:/CCC/Pet%20application/backend/routes/examRoutes.js): Extend `language: z.enum([...])` on `codeRunSchema`, `codeSubmitSchema`, and `codeDraftSchema`.
   - [schema.sql](file:///d:/CCC/Pet%20application/backend/database/schema.sql): Extend `coding_submissions.language CHECK (...)` via a new migration in [database.js](file:///d:/CCC/Pet%20application/backend/database/database.js).
   - [paperSchema.js](file:///d:/CCC/Pet%20application/backend/schemas/paperSchema.js): Only update if snippets or `referenceSolution` also allow the new language.
   - Frontend: Add the language option to [CodingWorkspace.jsx](file:///d:/CCC/Pet%20application/frontend/src/components/CodingWorkspace.jsx) / [CodeEditor.jsx](file:///d:/CCC/Pet%20application/frontend/src/components/CodeEditor.jsx).
5. **Write tests & docs:**
   - Add functional (pass, compile error, runtime error, timeout) and sandbox containment tests in [compiler.test.js](file:///d:/CCC/Pet%20application/backend/tests/compiler.test.js).
   - Document toolchain installation and configuration in [docs/INSTALLATION.md](docs/INSTALLATION.md) and [docs/CONFIGURATION.md](docs/CONFIGURATION.md).
