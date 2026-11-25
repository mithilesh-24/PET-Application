# PET Prep

A local-first, offline-capable Placement Eligibility Test (PET) mock examination platform designed for Kongu Engineering College CSE (Software Only) preparation. Students generate 67-question papers externally in `.petdraft` format, import and verify them locally with AES-256-GCM encryption, take timed 150-minute forward-only exams (MCQs, code snippets, and coding problems executed inside an OS-native sandbox), and review detailed score analytics and exports.

## Key Features

- **Offline-first & private:** Zero external AI calls, zero online compiler APIs, zero CDN fetches (Monaco Editor `0.58.0` and PrismJS `1.30.0` are bundled locally), and zero cloud uploads.
- **Fixed KEC PET Exam Pattern (67 Questions · 100 Marks · 150 Minutes):**
  - **Section 1 (50 min, 40 marks):** 40 MCQs (Aptitude 15, Reasoning 15, Verbal 10).
  - **Section 2 (50 min, 40 marks):** 20 Core CS MCQs (`CC01`–`CC05`) + 5 Code-Snippet trace MCQs.
  - **Section 2a (50 min, 20 marks):** 2 coding problems (Medium + Hard, including mandatory Tree/Graph coverage) in C, C++, Java, or Python 3.
- **OS-Native Sandboxed Code Execution:** Compiles and grades submissions directly on the host using native OS isolation (Windows `AppContainer`/`WRITE_RESTRICTED` + Job Object, Linux `bubblewrap`/`nsjail`/`firejail` + `prlimit`, macOS `sandbox-exec` + `ulimit`) with fail-closed safety.
- **Server-Authoritative Exam Engine:** Forward-only navigation, SQLite-backed section timers, answer keys/hidden tests stripped from active exam responses, and browser-level violation monitoring (tab switch, fullscreen exit, window blur, copy/paste, DevTools shortcuts).
- **Results, Analytics & Exports:** Detailed per-section/topic breakdowns, answer review with reference solutions after completion, 2–4 attempt side-by-side comparison with SVG score chart, weak-topic recommendations, and JSON/CSV downloads.

## Screenshots

- *Landing Page & Prompt Generator (`/`):* `[Screenshot placeholder — Home page with AI prompt copy, paper import list, and recent attempts]`
- *Examination Workspace (`/exam/:attemptId`):* `[Screenshot placeholder — MCQ and Monaco coding split-pane exam interface]`
- *Results & History (`/results/:attemptId`, `/history`):* `[Screenshot placeholder — Score breakdown tables, review filters, and attempt comparison chart]`

## Quick Start

Requires **Node.js >= 20 LTS**, local compilers (`gcc`, `g++`, JDK `17+`, `python3`/`python`), and the host OS sandbox prerequisite (see [docs/INSTALLATION.md](docs/INSTALLATION.md)).

```bash
git clone <your-repo-url> "pet-prep"
cd "pet-prep"
npm run setup
npm run dev
```

Open `http://localhost:5173` (development) or build for single-port production serving on `http://localhost:4000`:

```bash
npm run build
npm run start
```

Windows and POSIX convenience launchers are also included (`start.bat` and `start.sh`).

## Documentation Index

| Document | Description |
| --- | --- |
| [Tech Stack](docs/TECH_STACK.md) | Verified frameworks, packages, versions from lockfile, toolchains, and OS sandbox tools |
| [Architecture](docs/ARCHITECTURE.md) | System diagram, component responsibilities, submission request flow, and execution engine design |
| [Database](docs/DATABASE.md) | SQLite schema, ER diagram, table columns, indexes, migrations, and backups |
| [API Reference](docs/API.md) | Complete `/api` endpoint reference, Zod payloads, diagnostics, and Contract E errors |
| [Installation](docs/INSTALLATION.md) | Ubuntu/Debian, Windows, and macOS compiler and native sandbox setup instructions |
| [Configuration](docs/CONFIGURATION.md) | Every environment variable, default, allowed range, and validation rule |
| [Security](docs/SECURITY.md) | Threat model, per-OS sandbox guarantees, encryption scope, and limitations |
| [User Guide](docs/USER_GUIDE.md) | Step-by-step instructions for creating/importing exams, taking tests, and reviewing analytics |
| [Deployment](docs/DEPLOYMENT.md) | Single-port production checklist, reverse proxy/HTTPS notes, backups, and exam-day runbook |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Common compiler, sandbox, timeout, database, and port conflict fixes |
| [Project Structure](docs/PROJECT_STRUCTURE.md) | Annotated repository directory tree |
| [Changelog](CHANGELOG.md) | Version history and replacement of container execution with OS-native sandboxing |
| [Contributing](CONTRIBUTING.md) | ESLint/Prettier rules, workflow, and adding a new language runner |
