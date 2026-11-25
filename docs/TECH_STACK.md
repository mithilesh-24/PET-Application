# Technology Stack

All versions below are verified directly against [package.json](package.json), [frontend/package.json](frontend/package.json), [backend/package.json](backend/package.json), and `package-lock.json`.

## Frontend

| Technology | Version | Purpose | Where Used | Why Chosen (from codebase) |
| --- | --- | --- | --- | --- |
| React | `19.3.1` (`^19.0.0`) | UI component rendering and state | `frontend/src/pages/`, `frontend/src/components/` | Standard SPA framework requested by project spec |
| React DOM | `19.3.1` (`^19.0.0`) | Browser DOM mounting | [main.jsx](frontend/src/main.jsx) | Pairs with React |
| React Router (`react-router-dom`) | `7.18.7` (`^7.4.0`) | Client-side routing (8 routes) with `lazy` Results route split | [App.jsx](frontend/src/App.jsx) | Route-based splitting keeps review fields isolated |
| Monaco Editor (`monaco-editor`) | `0.58.0` (`^0.58.0`) | Offline code editor with local web workers | [CodeEditor.jsx](frontend/src/components/CodeEditor.jsx) | Bundled locally (`?worker`) for 100% offline use (no CDN) |
| `@monaco-editor/react` | `4.7.0` (`^4.7.0`) | React wrapper configured with local `monaco` instance | [CodeEditor.jsx](frontend/src/components/CodeEditor.jsx) | Simplifies React integration via `loader.config({ monaco })` |
| PrismJS (`prismjs`) | `1.30.0` (`^1.30.0`) | Offline syntax highlighting for code snippets (`c`, `cpp`, `java`, `python`) | [SnippetBlock.jsx](frontend/src/components/SnippetBlock.jsx) | Lightweight local syntax highlighting |

## Backend

| Technology | Version | Purpose | Where Used | Why Chosen (from codebase) |
| --- | --- | --- | --- | --- |
| Node.js | `>=20.0.0` (verified host: `v24.12.0`) | Backend ESM JavaScript runtime | `backend/`, `scripts/` | Native `node:crypto`, `node:child_process`, `--watch` |
| Express (`express`) | `4.22.3` (`^4.21.2`) | HTTP REST API server & static SPA serving | [server.js](backend/server.js), `backend/routes/` | Lightweight HTTP routing and middleware pipeline |
| Zod (`zod`) | `3.25.76` (`^3.24.2`) | Request body/query/param validation | `backend/routes/`, `backend/schemas/` | Strict input validation mapping to `VALIDATION_FAILED` |
| Helmet (`helmet`) | `8.3.0` (`^8.1.0`) | HTTP security headers and strict CSP (`blob:` Monaco workers) | [server.js](backend/server.js) | Prevents inline script/CDN execution while allowing Vite workers |
| CORS (`cors`) | `2.8.6` (`^2.8.5`) | Origin restriction (`CORS_ORIGIN`, default `http://localhost:5173`) | [server.js](backend/server.js) | Restricts cross-origin browser requests |
| Multer (`multer`) | `1.4.5-lts.2` | In-memory multipart `.petdraft`/`.pet` uploads | [paperRoutes.js](backend/routes/paperRoutes.js), [upload.js](backend/middleware/upload.js) | Keeps uploads in memory (`memoryStorage()`) without writing untrusted files to disk |
| Morgan (`morgan`) | `1.12.1` (`^1.10.0`) | HTTP request logging in non-test environments | [server.js](backend/server.js) | Minimal console logging during dev/prod runs |

## Database & Storage

| Technology | Version | Purpose | Where Used | Why Chosen (from codebase) |
| --- | --- | --- | --- | --- |
| SQLite via `better-sqlite3` | `13.2.0` (`^13.2.0`) | Synchronous embedded relational database with WAL mode & online backups | [database.js](backend/database/database.js), [repositories.js](backend/database/repositories.js) | Zero-external-server persistence with atomic transactions and `.backup()` |
| Node `node:crypto` + `node:zlib` | Built-in | AES-256-GCM authenticated paper encryption & gzip compression | [encryptionService.js](backend/services/encryptionService.js), [decryptionService.js](backend/services/decryptionService.js) | Built-in cryptography with zero third-party crypto dependencies |
| `keytar` | **Optional (`NOT IN LOCK`)** | Optional OS keychain storage, falling back to `0600` files in `~/.pet-prep/keys` | [keyStore.js](backend/services/keyStore.js) | Dynamically imported so native keychain absence never blocks startup |

## Code Execution Engine & Host Toolchains

| Component | Verified Host / Mechanism | Purpose | Where Used |
| --- | --- | --- | --- |
| C Compiler (`gcc`) | Host CLI (`C:\MinGW\bin\gcc.exe` `6.3.0` on Windows dev host) | Compiles C solutions (`-O2 -std=c17` or `-std=c11` on GCC < 8, `-lm`) | [languageRunner.js](backend/compiler/languageRunner.js), [executionEngine.js](backend/compiler/executionEngine.js) |
| C++ Compiler (`g++`) | Host CLI (`C:\MinGW\bin\g++.exe` `6.3.0` on Windows dev host) | Compiles C++ solutions (`-O2 -std=c++17` or `-std=c++14` on GCC < 8) | [languageRunner.js](backend/compiler/languageRunner.js), [executionEngine.js](backend/compiler/executionEngine.js) |
| JDK (`javac` / `java`) | Host CLI (`javac 25.0.1` / `java 25.0.1` on Windows dev host) | Compiles `Main.java` and runs JVM with `-Xmx`, `-Xss512k`, `-XX:+UseSerialGC`, `-XX:TieredStopAtLevel=1` | [languageRunner.js](backend/compiler/languageRunner.js) |
| Python (`python` / `python3`) | Host CLI (`Python 3.10.10` on Windows dev host) | Executes Python scripts with `-I -B -u` (isolated, no `.pyc`, unbuffered) | [languageRunner.js](backend/compiler/languageRunner.js) |
| Windows Sandbox | C# launcher (`PetSandboxLauncher.cs` -> `.exe` compiled via .NET 4 `csc.exe`) | Win32 Job Objects + `AppContainer` (falling back to `WRITE_RESTRICTED` + `DISABLE_MAX_PRIVILEGE` where needed) | [windowsSandbox.js](backend/compiler/sandbox/windowsSandbox.js), [PetSandboxLauncher.cs](backend/compiler/sandbox/windows/PetSandboxLauncher.cs) |
| Linux Sandbox | `bubblewrap` (`bwrap`), `nsjail`, or `firejail` + `prlimit` (`NOT VERIFIED` at runtime on Windows) | Isolated namespaces, `--cap-drop ALL`, `--clearenv`, workspace-only bind, `prlimit` | [linuxSandbox.js](backend/compiler/sandbox/linuxSandbox.js) |
| macOS Sandbox | `/usr/bin/sandbox-exec` + `ulimit` (`NOT VERIFIED` at runtime on Windows) | Dynamic Seatbelt `.sb` profile denying network & outside writes | [macosSandbox.js](backend/compiler/sandbox/macosSandbox.js) |

## Authentication & Proctoring

- **User Authentication / Roles:** None implemented. PET Prep is a single-user local application without accounts, JWTs, sessions, or role authorization.
- **Exam Integrity Controls:** Browser event listeners (`visibilitychange`, `fullscreenchange`, `blur`, clipboard/DevTools guards) in [useExamMonitor.js](frontend/src/services/useExamMonitor.js) plus server-side forward-only and lock checks in [examEngine.js](backend/services/examEngine.js).

## Build, Dev Tools & Testing

| Technology | Version | Purpose | Where Used |
| --- | --- | --- | --- |
| Vite | `6.4.6` (`^6.2.2`) | Dev server (`5173`) + production bundler | [frontend/vite.config.js](frontend/vite.config.js) |
| `@vitejs/plugin-react` | `4.7.0` (`^4.3.4`) | React JSX transform & Fast Refresh | [frontend/vite.config.js](frontend/vite.config.js) |
| Concurrently | `9.2.5` (`^9.2.1`) | Runs backend `--watch` and Vite dev server together | [package.json](package.json) |
| ESLint + `@eslint/js` | `9.39.5` | JavaScript & React linting | [eslint.config.js](eslint.config.js) |
| Prettier | `3.10.1` (`^3.6.2`) | Code formatting | [.prettierrc](.prettierrc) |
| Vitest | `3.2.7` (`^3.0.9`) | Backend (`node`) and frontend (`jsdom`) unit/integration tests | `backend/tests/`, `frontend/src/**/*.test.*` |
| Supertest | `7.3.2` (`^7.0.0`) | Express HTTP integration testing | `backend/tests/` |
| Testing Library (`@testing-library/react`, `jest-dom`) | `16.3.3` / `6.9.1` | React component & route tests | `frontend/src/**/*.test.jsx` |
| jsdom | `26.1.0` (`^26.0.0`) | Browser DOM simulation for Vitest | [frontend/vite.config.js](frontend/vite.config.js) |
| Playwright (`@playwright/test`) | `1.65.1` | End-to-end Chromium browser testing | [playwright.config.js](playwright.config.js), `e2e/` |
