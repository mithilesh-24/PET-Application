# Changelog

All notable changes to PET Prep are documented in this file.

## Unreleased — Docker-Free OS-Native Sandboxed Execution Engine

### Removed
- **Docker dependency completely eliminated from execution & setup:** Deleted `docker/Dockerfile.runner`, `docker/pet-supervisor.py`, `backend/compiler/dockerRunner.js`, `npm run setup:docker`, and all container runtime/build requirements from backend routes, setup scripts, and documentation.

### Added
- **OS-Native Execution Engine (`backend/compiler/executionEngine.js`):** Replaced container invocations with `ExecutionEngine` (`runSubmission`, `runSubmissionBatch`), a bounded async concurrency queue (`EXEC_MAX_CONCURRENT`), unique isolated per-submission workspaces, strict `stdin`-only test feeding, and startup/periodic stale workspace cleanup.
- **Strict Configuration Validation (`backend/compiler/executionConfig.js`):** Added validated startup parsing for `EXEC_TIMEOUT_SECONDS`, `EXEC_COMPILE_TIMEOUT_SECONDS`, `EXEC_MEMORY_LIMIT_MB`, `EXEC_MAX_OUTPUT_KB`, `EXEC_MAX_PROCESSES`, `EXEC_MAX_FILE_SIZE_KB`, `EXEC_MAX_CONCURRENT`, `EXEC_WORKSPACE_BASE_DIR`, `EXEC_RUNNER_USER`, toolchain overrides (`GCC_PATH`, `GPP_PATH`, `JAVAC_PATH`, `JAVA_PATH`, `PYTHON_PATH`), and dev-only `PET_ALLOW_INSECURE_EXECUTION`.
- **OS-Native Sandbox Drivers (`backend/compiler/sandbox/`):**
  - **Windows (`windowsSandbox.js` + `PetSandboxLauncher.cs` + `scripts/build-windows-sandbox.mjs`):** Win32 Job Objects (`KILL_ON_JOB_CLOSE`, memory/CPU/active-process/exception limits) combined with zero-capability `AppContainer` profiles (and automatic `WRITE_RESTRICTED` + `DISABLE_MAX_PRIVILEGE` fallback for host MinGW/JDK toolchains).
  - **Linux (`linuxSandbox.js`):** Supports `bubblewrap` (`--unshare-all`, `--cap-drop ALL`, `--clearenv`, `--tmpfs /tmp`), `nsjail`, and `firejail` with `prlimit` and process-group kill.
  - **macOS (`macosSandbox.js`):** Generates Seatbelt profiles for `/usr/bin/sandbox-exec` + `ulimit`.
- **Fail-Closed Safety & Diagnostics:** Engine refuses execution (`503 SANDBOX_UNAVAILABLE`) whenever host sandbox prerequisites are missing unless `PET_ALLOW_INSECURE_EXECUTION=true`. Added `GET /api/health/diagnostics` and updated `npm run doctor`.
- **Complete Project Documentation (`docs/`):** Added full architecture, database, API, tech stack, installation, configuration, security, user guide, deployment, troubleshooting, project structure, and contributing docs.

### Earlier Completed Milestones
- **M0–M11 (`88ada7d` .. `50c245d`):** Scaffold, 67-question schema & validator, AES-256-GCM encryption & key storage, SQLite WAL & online backups, landing page & `.petdraft` import, server-authoritative exam engine, CodeTantra-style exam UI, fullscreen & violation monitoring, coding workspace & hidden-test judge, golden scoring & review dashboard, history comparison, weak-topic analytics, and sanitized JSON/CSV exports.
