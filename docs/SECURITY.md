# Security Architecture & Limitations

## Threat Model

| Asset / Surface | Threat | Mitigation Implemented in Code |
| --- | --- | --- |
| **Untrusted Student Code** | File system escape, DB/`.env` reading, fork bomb, memory bomb, network exfiltration, persistent daemon process | Executed inside OS-native sandbox ([sandboxDriver.js](file:///d:/CCC/Pet%20application/backend/compiler/sandbox/sandboxDriver.js)), fail-closed `503 SANDBOX_UNAVAILABLE` if sandbox missing |
| **Answer Keys & Hidden Tests** | Student inspects browser network traffic, JS bundle, or local storage during an exam | Keys/hidden tests/solutions stripped in `sanitizeQuestionForClient()` & `evaluateAndStoreSubmission()`; `/result`, `/review`, and `/export` return `403 NOT_FOUND` until ended; verified by `verify:bundle` ([check-bundle.mjs](file:///d:/CCC/Pet%20application/scripts/check-bundle.mjs)) and [security.test.js](file:///d:/CCC/Pet%20application/backend/tests/security.test.js) |
| **Stored Question Papers** | Reading encrypted `.pet` files directly on disk | AES-256-GCM encryption (`PET1` magic header + 1-byte version + random 96-bit nonce + 128-bit auth tag + gzip canonical JSON) via [encryptionService.js](file:///d:/CCC/Pet%20application/backend/services/encryptionService.js) |
| **API & Path Operations** | Path traversal (`../`), oversized uploads, forged backwards navigation | `parseSafeIdParam()` and `assertPathInsideDir()` in [routeParams.js](file:///d:/CCC/Pet%20application/backend/schemas/routeParams.js); Zod schemas on routes; Multer `memoryStorage()`; 2 MB JSON & 25 MB upload caps |
| **Code Judge Abuse** | Denial-of-service via rapid compile/run floods | `3000 ms` per-attempt cooldown on `/code/run`, `60 req/60s` sliding rate limiter on `/api/attempts/:id/code/*` ([rateLimit.js](file:///d:/CCC/Pet%20application/backend/middleware/rateLimit.js)), bounded `EXEC_MAX_CONCURRENT` queue |
| **Client Scripts / XSS** | CDN hijacking or injected scripts | Helmet strict CSP (`default-src 'self'`, `script-src 'self' blob:`, `worker-src 'self' blob:`, `object-src 'none'`); Monaco & PrismJS bundled locally |

## Sandbox Design per OS

### Linux (Recommended for Production Exams) — *NOT VERIFIED at runtime on this Windows host*

Handled by [linuxSandbox.js](file:///d:/CCC/Pet%20application/backend/compiler/sandbox/linuxSandbox.js), preferring `bubblewrap` (`bwrap`), then `nsjail`, then `firejail`:
- **Namespaces:** `--unshare-all` (PID, mount, network, IPC, UTS, user namespaces), `--new-session`, `--die-with-parent`.
- **Capabilities & Env:** `--cap-drop ALL`, `--clearenv`, private `/tmp` (`--tmpfs /tmp`), minimal `/proc` and `/dev`, system toolchains mounted `--ro-bind-try`, workspace bound read-write during compile and `--ro-bind` during execution.
- **Resource Limits:** Wraps `prlimit` (`--cpu`, `--fsize`, `--nproc`, `--nofile=64`, and `--as` for non-Java) plus process-group `-pid` `SIGKILL` on timeout or output overflow.

### Windows — *Verified on Windows host*

Handled by [windowsSandbox.js](file:///d:/CCC/Pet%20application/backend/compiler/sandbox/windowsSandbox.js) and compiled [PetSandboxLauncher.cs](file:///d:/CCC/Pet%20application/backend/compiler/sandbox/windows/PetSandboxLauncher.cs):
- **Win32 Job Object:** `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, `JOB_OBJECT_LIMIT_DIE_ON_UNHANDLED_EXCEPTION`, `JOB_OBJECT_LIMIT_PROCESS_MEMORY`, `JOB_OBJECT_LIMIT_JOB_MEMORY`, `JOB_OBJECT_LIMIT_ACTIVE_PROCESS`, and `JOB_OBJECT_LIMIT_JOB_TIME`, plus parent `TerminateJobObject` kill on timeout or `EXEC_MAX_OUTPUT_KB` exceeded.
- **Primary Isolation (`AppContainer`):** Uses ephemeral zero-capability AppContainer SIDs (`CreateAppContainerProfile`) blocking outbound sockets in the Windows kernel and restricting workspace ACLs to the single run's SID (removing inherited user ACLs). Verified blocking outbound sockets, host DB/`.env`/workspace reads, outside writes, fork bombs, memory bombs, and output floods with Python `3.10.10`.
- **Secondary Fallback (`WRITE_RESTRICTED`):** Legacy 32-bit MinGW GCC or TrustedInstaller `Program Files` JDKs lacking `ALL APPLICATION PACKAGES` (`S-1-15-2-1`) ACLs fail OS DLL loading (`Win32=623` / `0xC0000142`) inside `AppContainer`. For those toolchains only, execution steps down to `CreateRestrictedToken` (`DISABLE_MAX_PRIVILEGE | WRITE_RESTRICTED` with `S-1-5-12`) + Job Object (and `DISABLE_MAX_PRIVILEGE` + Job Object for the MinGW compiler driver when compiling). Student code still never runs outside a Job Object and cannot write outside the workspace.

### macOS — *NOT VERIFIED at runtime on this Windows host*

Handled by [macosSandbox.js](file:///d:/CCC/Pet%20application/backend/compiler/sandbox/macosSandbox.js):
- Dynamically generates a Seatbelt (`.sb`) profile executed by `/usr/bin/sandbox-exec`: `(deny default)`, `(deny network*)`, read-only access to toolchain/system paths, and writes allowed only inside `workDir` during compile (only `/dev/null` during run), wrapped with `ulimit -t` / `-f` / `-n 64` and PGID kill.

## What Is and Is Not Protected

- **Protected:** Network-isolated execution (`AppContainer` / `bwrap` / `sandbox-exec`), bounded temp workspaces deleted in `finally`, server-enforced section timers and forward-only navigation, at-rest `.pet` encryption, and absence of keys/hidden tests in exam APIs and frontend exam chunks.
- **NOT Protected (Known Limitations):**
  1. **Local Admin Inspection:** A user with local Administrator privileges or physical console debugging access on the same machine can read local `.pet-prep/keys/` key files, SQLite DB files, or backend memory.
  2. **Windows Non-AppContainer Socket / Read Scope:** When Windows runs C/C++/Java in `WRITE_RESTRICTED` mode (without configuring `S-1-15-2-1` ACLs + Windows Firewall rules per [docs/INSTALLATION.md](docs/INSTALLATION.md)), outbound sockets and world-readable host files are not blocked by `WRITE_RESTRICTED` alone.
  3. **Browser-Only Proctoring:** Monitoring in [useExamMonitor.js](frontend/src/services/useExamMonitor.js) detects browser-visible events (`tab_hidden`, `fullscreen_exit`, `window_blur`, `devtools`, `copy_paste`). It does **not** enforce OS kiosk lockdown or block external devices.
  4. **macOS `sandbox-exec` Deprecation:** Apple deprecates `sandbox-exec` in favor of App Sandbox.
  5. **Unsafe Dev Mode (`PET_ALLOW_INSECURE_EXECUTION=true`):** Disables OS sandbox fail-closed protection when sandbox prerequisites are absent. Never enable in real exams.

## Recommended Production Setup

For proctored or multi-student grading servers, deploy on **Ubuntu/Debian Linux** using `bubblewrap` (`bwrap`), a dedicated non-privileged `pet-runner` account, and `EXEC_MAX_CONCURRENT` sized to host CPU cores.
