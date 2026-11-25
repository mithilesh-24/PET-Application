# Configuration Reference

PET Prep reads environment variables in [config.js](file:///d:/CCC/Pet%20application/backend/config.js), [executionConfig.js](file:///d:/CCC/Pet%20application/backend/compiler/executionConfig.js), and [examEngine.js](file:///d:/CCC/Pet%20application/backend/services/examEngine.js). Invalid execution configuration values fail fast on startup with a descriptive error.

## Server & Storage Environment Variables

| Name | Description | Default | Allowed Values / Range | Required |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | Runtime mode (`production` enables single-port static serving; `test` disables Morgan logs & frontend serving by default) | `development` | `development`, `production`, `test` | No |
| `PORT` | HTTP listening port for Express | `4000` | Positive integer | No |
| `DATA_DIR` | Root directory for `database/`, `question-banks/encrypted/`, `results/`, and `execution/temporary/` | Repository root | Valid writable path | No |
| `VIOLATION_LIMIT` | Default browser violation limit for new attempts when not set in DB settings | `3` | Positive integer (UI supports `3` or `5`) | No |
| `CORS_ORIGIN` | Allowed browser `Origin` header | `http://localhost:5173` | URL origin string | No |
| `PET_TEST_SECTION_MINUTES` | Test-only override for section duration (supports decimals, e.g. `0.05` = 3s) | Unset (`50` min) | Positive number | No |

## Execution Engine Environment Variables

| Name | Description | Default | Allowed Values / Range | Required |
| --- | --- | --- | --- | --- |
| `EXEC_TIMEOUT_SECONDS` | Max per-test execution timeout (seconds) | `5` | Integer `5` – `10` | No |
| `EXEC_COMPILE_TIMEOUT_SECONDS` | Compiler invocation timeout (seconds) | `15` | Integer `5` – `60` | No |
| `EXEC_MEMORY_LIMIT_MB` | Process / Job Object memory cap (MB) | `256` | Integer `64` – `2048` | No |
| `EXEC_MAX_OUTPUT_KB` | Combined stdout + stderr limit per step (KB); exceeding kills process tree | `1024` | Integer `16` – `16384` | No |
| `EXEC_MAX_PROCESSES` | Max simultaneous processes/PIDs per sandboxed step | `64` | Integer `8` – `512` | No |
| `EXEC_MAX_FILE_SIZE_KB` | Max file write size (`RLIMIT_FSIZE` / `ulimit -f`) on POSIX sandboxes (KB) | `8192` | Integer `64` – `262144` | No |
| `EXEC_MAX_CONCURRENT` | Bounded execution queue worker limit | `min(8, max(2, CPUs))` | Integer `1` – `64` | No |
| `EXEC_WORKSPACE_BASE_DIR` | Base directory for isolated `run-<uuid>` execution directories | `<DATA_DIR>/execution/temporary` | Valid directory path | No |
| `EXEC_RUNNER_USER` | Dedicated Linux unprivileged runner user identifier | `pet-runner` | Regex `^[a-zA-Z0-9._\\-]{1,64}$` | No |
| `GCC_PATH` | Override executable path for `gcc` | Resolved via `PATH` | Non-empty executable path (no NUL byte) | No |
| `GPP_PATH` | Override executable path for `g++` | Resolved via `PATH` | Non-empty executable path (no NUL byte) | No |
| `JAVAC_PATH` | Override executable path for `javac` | Resolved via `PATH` | Non-empty executable path (no NUL byte) | No |
| `JAVA_PATH` | Override executable path for `java` | Resolved via `PATH` | Non-empty executable path (no NUL byte) | No |
| `PYTHON_PATH` | Override executable path for Python 3 | `python` (Win) / `python3` (POSIX) | Non-empty executable path (no NUL byte) | No |
| `PET_ALLOW_INSECURE_EXECUTION` | **DEV ONLY:** Allow unsandboxed fallback when OS sandbox is unavailable (logs loud warning on startup & every run) | `false` | `true` / `false` (`1` / `0`) | No |

## Example Environment Block

```bash
# Example production overrides (no real secrets stored in env; keys live in OS keychain / ~/.pet-prep/keys)
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://pet.example.edu
DATA_DIR=/var/lib/pet-prep
EXEC_TIMEOUT_SECONDS=5
EXEC_MEMORY_LIMIT_MB=256
EXEC_MAX_CONCURRENT=4
EXEC_WORKSPACE_BASE_DIR=/var/tmp/pet-prep-exec
PET_ALLOW_INSECURE_EXECUTION=false
# Optional compiler overrides if not on PATH:
# GCC_PATH=/usr/bin/gcc
# PYTHON_PATH=/usr/bin/python3
```

## Internal Fixed Limits (Code Constants)

- JSON body cap: `2mb` ([config.js](file:///d:/CCC/Pet%20application/backend/config.js))
- Multipart upload limit: `25 MB` total, `10 MB` per file, max `3` files ([paperRoutes.js](file:///d:/CCC/Pet%20application/backend/routes/paperRoutes.js))
- Source code size cap: `100 KB` ([languageRunner.js](file:///d:/CCC/Pet%20application/backend/compiler/languageRunner.js))
- Custom stdin limit: `8 KB` ([judgeService.js](file:///d:/CCC/Pet%20application/backend/services/judgeService.js))
- `/code/run` cooldown: `3000 ms` per attempt ([judgeService.js](file:///d:/CCC/Pet%20application/backend/services/judgeService.js)) + `/code/*` HTTP rate limit `60 req/60s` per IP+attempt ([server.js](file:///d:/CCC/Pet%20application/backend/server.js))
