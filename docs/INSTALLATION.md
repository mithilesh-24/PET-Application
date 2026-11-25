# Installation Guide

PET Prep runs completely offline once installed and requires **Node.js >= 20 LTS**, local compilers/runtimes for C, C++, Java, and Python, and the OS-native sandbox prerequisite for your platform.

## 1. Prerequisites & Toolchain Install per OS

### Ubuntu / Debian Linux (Recommended for Production Exams)

```bash
# 1. Node.js 20 LTS (or newer) via NodeSource / nvm / OS repo
node -v   # confirm >= v20.0.0

# 2. Required compilers & Python 3
sudo apt-get update
sudo apt-get install -y gcc g++ openjdk-17-jdk python3

# 3. Native sandbox engine (preferred: bubblewrap)
sudo apt-get install -y bubblewrap

# 4. Optional dedicated unprivileged runner account
sudo useradd -r -M -s /usr/sbin/nologin pet-runner
```

> **Ubuntu 24.04+ unprivileged user namespace note:** Ubuntu 24.04 restricts unprivileged `userns` creation via AppArmor (`kernel.apparmor_restrict_unprivileged_userns=1`). If `npm run doctor` reports `bubblewrap ... user namespaces are blocked`, either allow `bwrap` via AppArmor (`sudo aa-complain bwrap` or `/etc/apparmor.d/bwrap` policy) or install `nsjail` / `firejail`. For strict cgroups v2 limits, invoke under a systemd scope with `MemoryMax` and `TasksMax`.

### Windows 10 / 11

Install compilers using `winget` (recommended 64-bit WinLibs GCC/G++):

```powershell
winget install BrechtSanders.WinLibs.POSIX.UCRT   # gcc & g++
winget install EclipseAdoptium.Temurin.17.JDK    # javac & java (17+)
winget install Python.Python.3.12                # python
```

Ensure `gcc`, `g++`, `javac`, `java`, and `python` are on `PATH` (or configure path overrides in environment variables).

**Sandbox setup:**
1. Run `npm run setup` (or `npm run setup:sandbox`) to compile [PetSandboxLauncher.cs](file:///d:/CCC/Pet%20application/backend/compiler/sandbox/windows/PetSandboxLauncher.cs) into `backend/compiler/sandbox/windows/PetSandboxLauncher.exe` using the built-in .NET Framework `csc.exe`.
2. Verify with `& "backend\compiler\sandbox\windows\PetSandboxLauncher.exe" --self-test` (should print `{"ok":true,"appContainer":true}`).
3. *(Optional hardened lab setup — Administrator PowerShell)*: Create a low-privilege account `pet-runner`, block outbound network for toolchain paths via Windows Firewall (`netsh advfirewall firewall add rule name="PET-Block-Net" dir=out action=block program="..."`), and grant `ALL APPLICATION PACKAGES (S-1-15-2-1)` Read & Execute (`RX`) on JDK/MinGW folders so C/C++/Java also run in `AppContainer` instead of stepping down to `WRITE_RESTRICTED`.

### macOS

```bash
xcode-select --install          # provides gcc / g++ clang toolchain
brew install openjdk@17         # javac & java (link or export JAVA_HOME/PATH)
brew install python@3           # python3
```

macOS uses the built-in `/usr/bin/sandbox-exec` (Seatbelt) + `ulimit`. Note that Apple has marked `sandbox-exec` deprecated; Linux is recommended for production exams.

---

## 2. Clone, Setup & Verify

```bash
git clone <your-repo-url> "pet-prep"
cd "pet-prep"
npm run setup
```

`npm run setup`:
1. Verifies Node.js >= 20.
2. Runs `npm install` across root, `backend/`, and `frontend/` workspaces.
3. On Windows, compiles `PetSandboxLauncher.exe` via [build-windows-sandbox.mjs](file:///d:/CCC/Pet%20application/scripts/build-windows-sandbox.mjs).
4. Runs `npm run doctor` ([doctor.js](file:///d:/CCC/Pet%20application/backend/compiler/doctor.js)) to verify all 5 compiler binaries and the OS sandbox.

## 3. Environment & Database Initialization

- **Environment variables:** All configuration has safe defaults in [config.js](file:///d:/CCC/Pet%20application/backend/config.js) and [executionConfig.js](file:///d:/CCC/Pet%20application/backend/compiler/executionConfig.js). No `.env` file is required by default (`dotenv` is not used; pass env vars via your shell, process manager, or launcher).
- **Database:** SQLite (`database/pet-history.db`) is created and migrated automatically when the backend starts. No manual seed or SQL commands are needed.

## 4. Running in Development & Production

### Development (Vite + Express hot reload)

```bash
npm run dev
```

- Frontend dev server: `http://localhost:5173`
- Backend API server: `http://localhost:4000`

### Production (Single-port Express serving `frontend/dist`)

```bash
npm run build
npm run verify:bundle   # confirms zero leaked key material / answerIndex outside review chunk
npm run start
```

Or launch directly with [start.bat](file:///d:/CCC/Pet%20application/start.bat) (Windows) or [start.sh](file:///d:/CCC/Pet%20application/start.sh) (Linux/macOS), then open `http://localhost:4000`.
