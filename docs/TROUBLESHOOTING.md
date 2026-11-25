# Troubleshooting

## 1. Missing Compiler or Runtime (`ce` / Missing in `npm run doctor`)

- **Symptom:** `npm run doctor` or `GET /api/health/diagnostics` marks `gcc`, `g++`, `javac`, `java`, or `python` as `MISSING`.
- **Causes & Fixes:**
  - Tool is not installed → Run the OS install commands in [docs/INSTALLATION.md](INSTALLATION.md).
  - Tool is installed outside `PATH` → Set explicit binary paths (`GCC_PATH`, `GPP_PATH`, `JAVAC_PATH`, `JAVA_PATH`, `PYTHON_PATH`) before launching Express.

## 2. Sandbox Disabled (`503 SANDBOX_UNAVAILABLE`)

- **Symptom:** Submissions or paper verification fail with `SANDBOX_UNAVAILABLE`.
- **Windows:**
  - *Cause:* `backend/compiler/sandbox/windows/PetSandboxLauncher.exe` has not been built or was removed.
  - *Fix:* Run `npm run setup:sandbox` and test `& "backend\compiler\sandbox\windows\PetSandboxLauncher.exe" --self-test`.
- **Linux:**
  - *Cause:* Neither `bwrap`, `nsjail`, nor `firejail` is installed, or unprivileged user namespaces are blocked (common on Ubuntu 24.04+).
  - *Fix:* Install `bubblewrap` (`sudo apt-get install -y bubblewrap`) and verify AppArmor permits `bwrap` user namespaces, or install `nsjail`/`firejail`.
- **macOS:**
  - *Cause:* `/usr/bin/sandbox-exec` unavailable.
  - *Fix:* Verify macOS system integrity or run grading on Linux.

## 3. Windows C/C++/Java Fails `AppContainer` (`Win32=623` / `0xC0000142`)

- **Symptom:** Low-level `PetSandboxLauncher.exe --mode appcontainer` fails with `Win32=623` (legacy 32-bit MinGW relocation) or `3221225794` (`STATUS_DLL_INIT_FAILED` on `Program Files\Java` without `ALL APPLICATION PACKAGES` ACLs).
- **Behavior & Fix:** [windowsSandbox.js](file:///d:/CCC/Pet%20application/backend/compiler/sandbox/windowsSandbox.js) handles this automatically by resolving direct `C:\Program Files\Java\jdk-*\bin\` binaries and stepping down to `WRITE_RESTRICTED` (`S-1-5-12`) + `DISABLE_MAX_PRIVILEGE` + Job Object. For full kernel `AppContainer` isolation across C/C++ too, install 64-bit WinLibs GCC (`winget install BrechtSanders.WinLibs.POSIX.UCRT`) and grant `ALL APPLICATION PACKAGES (S-1-15-2-1)` Read & Execute access to the toolchain folders.

## 4. Frequent Timeouts (`tle`) or Memory Limit Exceeded (`mle`)

- **Cause:** Solution loops endlessly, uses naive $O(N^2)$ logic exceeding `timeLimitMs` / `EXEC_TIMEOUT_SECONDS` (default `5s`), allocates past `EXEC_MEMORY_LIMIT_MB` (default `256 MB`), or Java JVM heap reserves too closely to the Job Object limit.
- **Fix:** Increase problem `timeLimitMs` (max `10000 ms`) or `memoryLimitMb` (max `1024 MB` clamped / `EXEC_MEMORY_LIMIT_MB` up to `2048 MB`), or adjust `EXEC_TIMEOUT_SECONDS` (`5`–`10`) and `EXEC_COMPILE_TIMEOUT_SECONDS` (`5`–`60`).

## 5. Invalid Startup Configuration Error

- **Symptom:** Server exits immediately throwing `Invalid configuration for EXEC_...`.
- **Fix:** Check every `EXEC_*` and `PET_ALLOW_INSECURE_EXECUTION` value against the allowed ranges in [docs/CONFIGURATION.md](CONFIGURATION.md).

## 6. Database Errors (`SQLITE_BUSY` or Corrupt Snapshot)

- **Fix:** Ensure only one backend process accesses `database/pet-history.db` at a time and `DATA_DIR` resides on a local filesystem (not a network SMB/NFS share, which breaks SQLite WAL file locking). To restore a backup, see [docs/DEPLOYMENT.md](DEPLOYMENT.md).

## 7. Port `4000` or `5173` Already in Use

- **Symptom:** `EADDRINUSE` on startup.
- **Fix:** Stop existing Node processes using ports `4000`/`5173`, or start with `PORT=4100 CORS_ORIGIN=http://localhost:5174` (note Vite dev proxy in [frontend/vite.config.js](file:///d:/CCC/Pet%20application/frontend/vite.config.js) targets `http://localhost:4000` unless changed).

## 8. Clipboard Copy Blocked in Browser

- **Symptom:** **Copy AI Question Generation Prompt** warns that clipboard access was denied.
- **Fix:** Click **Show Prompt Preview** and copy manually, or click **Download as .txt** on `/`.
