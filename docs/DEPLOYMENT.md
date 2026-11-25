# Deployment & Operations Runbook

## Pre-Deployment Checklist

1. **Host OS & Compilers:** Deploy on **Ubuntu/Debian Linux** with `gcc`, `g++`, `openjdk-17-jdk`, `python3`, and `bubblewrap` installed (`NOT VERIFIED` in cloud/container VMs unless unprivileged userns or dedicated runner account permissions are confirmed).
2. **Environment Safety:** Ensure `NODE_ENV=production` and verify `PET_ALLOW_INSECURE_EXECUTION` is unset or `false`.
3. **Directory Permissions:** Point `DATA_DIR` to persistent local SSD storage and `EXEC_WORKSPACE_BASE_DIR` to fast local storage (`execution/temporary` or `/var/tmp/pet-prep-exec`) with strict permissions (`0700`).
4. **Build & Verify Frontend Assets:**
   ```bash
   npm run build
   npm run verify:bundle   # asserts 0 secrets and 0 answerIndex/expectedOutput tokens outside Results chunk
   npm run doctor          # confirms all 5 tools + OS sandbox ready
   ```
5. **Single-Port Serving:** Start with `NODE_ENV=production npm run start` (or `start.sh` / `start.bat`), which serves `frontend/dist` and `/api/*` together on `PORT` (default `4000`).

---

## Reverse Proxy, HTTPS & Process Management

- **Reverse Proxy / HTTPS:** No nginx/Caddy configuration ships in the repository (`NOT VERIFIED`). If exposing on a campus LAN behind TLS (e.g. nginx terminating HTTPS on `443` and proxying to `http://127.0.0.1:4000`), set `CORS_ORIGIN` to the exact HTTPS origin (`https://pet.example.edu`) and increase proxy request size/timeouts (`client_max_body_size 30m` for 25 MB imports and `proxy_read_timeout 120s` for coding verification batches). Note that `npm run doctor` / [server.js](file:///d:/CCC/Pet%20application/backend/server.js) does not inspect `X-Forwarded-For` (`app.set('trust proxy')` is not enabled — **NOT VERIFIED** for shared lab NAT; multiple students behind one reverse proxy IP will share the 60/min `/code/*` IP bucket unless configured per host).
- **Process Manager (systemd / PM2):** No systemd unit or PM2 ecosystem file ships in the repo (**NOT VERIFIED**). When running under systemd, configure `Restart=on-failure`, `KillSignal=SIGINT`, and `TimeoutStopSec=15` so `shutdownServer()` closes SQLite cleanly and prunes active temp workspaces. Ensure `DATA_DIR`, `EXEC_WORKSPACE_BASE_DIR`, and `~/.pet-prep/keys` remain consistent across restarts.

---

## Backups & Recovery

- **Automated Backups:** `backupDatabase(db)` runs online SQLite `.backup()` snapshots on server startup and upon attempt completion, storing up to 10 `.db` files in `<DATA_DIR>/database/backups/`.
- **Manual Backup:** Click **Backup Now** on `/settings` (`POST /api/settings/backup`).
- **Restore Procedure:**
  1. Stop the PET Prep Node process.
  2. Copy the chosen snapshot from `database/backups/` to `database/pet-history.db` and delete stale `.db-wal` / `.db-shm` sidecar files.
  3. Restore matching `question-banks/encrypted/*.pet` files and `~/.pet-prep/keys/*.key` (`active.json` + `.key` files) if moving machines.
  4. Start the server and check `GET /api/health/diagnostics`.

---

## Exam-Day Runbook

### Pre-Exam Checks (T-30 minutes)
1. Run `npm run doctor` and confirm `OS Sandbox ready: YES` and `OK` for `gcc`, `g++`, `javac`, `java`, and `python`.
2. Call `GET http://localhost:4000/api/health/diagnostics` and confirm `"ok": true, "sandboxReady": true`.
3. Import the verified exam paper beforehand (takes `< 3s` excluding compiler/reference verification; verify once on the target machine).
4. Run one smoke test code submission per language (`c`, `cpp`, `java`, `python`) via `/settings` / test paper, then delete the test attempt (`DELETE /api/attempts/:id`) so analytics start clean.

### Mid-Exam Incident Playbook
- **Execution Engine returns `503 SANDBOX_UNAVAILABLE`:**
  1. Hit `GET /api/health/diagnostics` to read `sandboxDetails` and `installHints`.
  2. *Windows:* Re-run `npm run setup:sandbox` (or POST `/api/settings/rebuild-runner` in `/settings`) and check antivirus didn't quarantine `PetSandboxLauncher.exe`.
  3. *Linux:* Verify `bwrap --version` and `userns` availability; if AppArmor/kernel blocked `bwrap`, restore policy or install `nsjail`/`firejail` (Express detects on next call via `resolveActiveSandbox()`).
  4. **Do NOT** set `PET_ALLOW_INSECURE_EXECUTION=true` on a live exam machine.
- **Process Crash / Unexpected Reboot Mid-Exam:**
  - Restart the server immediately (`npm run start`).
  - `cleanupStaleWorkspaces()` clears any leftover `run-*` directories automatically on boot.
  - Section deadlines (`deadline_at`), MCQ answers (`responses`), and coding drafts (`coding_submissions`) are preserved in SQLite WAL; students simply refresh `/exam/:attemptId`, re-enter fullscreen, and continue within remaining server time.
