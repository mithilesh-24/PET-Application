import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { AppError } from '../../middleware/errorHandler.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WINDOWS_LAUNCHER_PATH = path.join(__dirname, 'windows', 'PetSandboxLauncher.exe');

const ensuredRoDirs = new Set();

function resolveToolchainRoot(executablePath) {
  if (!executablePath) return null;
  try {
    const resolved = fsSync.realpathSync(executablePath);
    const binDir = path.dirname(resolved);
    const parent = path.dirname(binDir);
    if (/^(Windows|System32|SysWOW64)$/i.test(path.basename(parent))) {
      return null;
    }
    return path.basename(binDir).toLowerCase() === 'bin' ? parent : binDir;
  } catch {
    return null;
  }
}

async function resolveExecutableForWin(cmd) {
  let found = cmd;
  if (!path.isAbsolute(cmd)) {
    try {
      const { stdout } = await execFileAsync('where', [cmd], { timeout: 3000 });
      found =
        stdout
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find(Boolean) || cmd;
    } catch {
      found = cmd;
    }
  }

  // Oracle's Common Files javapath shim fails WRITE_RESTRICTED token init; resolve direct JDK bin\ tool
  if (/oracle[\\/]+java[\\/]+javapath/i.test(found)) {
    const exeName = path.basename(found);
    const candidates = [];
    if (process.env.JAVA_HOME) {
      candidates.push(path.join(process.env.JAVA_HOME, 'bin', exeName));
    }
    try {
      const javaRoot = 'C:\\Program Files\\Java';
      const dirs = fsSync.readdirSync(javaRoot).sort().reverse();
      for (const d of dirs) {
        candidates.push(path.join(javaRoot, d, 'bin', exeName));
      }
    } catch {
      // Ignore if Java root missing
    }
    for (const c of candidates) {
      if (fsSync.existsSync(c)) {
        return c;
      }
    }
  }

  return found;
}

export function createWindowsSandboxDriver() {
  let activeChild = null;
  let activeWorkDir = null;

  async function detectCapabilities() {
    if (process.platform !== 'win32') {
      return { ready: false, mode: 'unsupported', details: 'Windows driver on non-Windows OS' };
    }

    if (!fsSync.existsSync(WINDOWS_LAUNCHER_PATH)) {
      return {
        ready: false,
        mode: 'disabled',
        driver: 'windows-appcontainer',
        details: `Missing compiled sandbox launcher at ${WINDOWS_LAUNCHER_PATH}.`,
        installHints: {
          win32: 'Run: node scripts/build-windows-sandbox.mjs (uses built-in .NET csc.exe).',
        },
      };
    }

    try {
      const { stdout } = await execFileAsync(WINDOWS_LAUNCHER_PATH, ['--self-test'], {
        timeout: 5000,
      });
      const parsed = JSON.parse((stdout || '').trim());
      if (parsed?.ok && parsed?.appContainer) {
        return {
          ready: true,
          mode: 'appcontainer-job',
          driver: 'windows-appcontainer',
          launcherPath: WINDOWS_LAUNCHER_PATH,
          details:
            'Windows AppContainer (zero network capabilities, isolated workspace ACLs) + Win32 Job Object (memory, CPU, active-process, kill-on-close, UI restrictions).',
          installHints: null,
        };
      }
      return {
        ready: false,
        mode: 'disabled',
        driver: 'windows-appcontainer',
        details: 'AppContainer profile creation failed self-test on this Windows account.',
        installHints: {
          win32:
            'Run under a standard Windows user session (not disabled profile service), or verify PetSandboxLauncher.exe --self-test.',
        },
      };
    } catch (err) {
      return {
        ready: false,
        mode: 'disabled',
        driver: 'windows-appcontainer',
        details: `Windows sandbox launcher self-test failed: ${err.message}`,
        installHints: {
          win32: 'Rebuild launcher: node scripts/build-windows-sandbox.mjs',
        },
      };
    }
  }

  async function ensureToolchainDirsReadable(dirs) {
    const missing = dirs.filter((d) => d && !ensuredRoDirs.has(d));
    if (missing.length === 0) return;
    await execFileAsync(WINDOWS_LAUNCHER_PATH, ['--ensure-ro', ...missing], {
      timeout: 15000,
    }).catch(() => {});
    for (const d of missing) {
      ensuredRoDirs.add(d);
    }
  }

  async function prepare(workspace) {
    activeWorkDir = workspace;
    await fs.mkdir(workspace, { recursive: true });
  }

  async function invokeLauncher(mode, { workDir, writableWorkDir, timeoutMs, memoryMb, maxProcs, maxOutputBytes, roDirs, effectiveCmd, stdin }) {
    const args = [
      '--mode',
      mode,
      '--workdir',
      workDir,
      ...(writableWorkDir ? ['--writable'] : []),
      '--timeout-ms',
      String(timeoutMs),
      '--memory-mb',
      String(memoryMb),
      '--max-procs',
      String(maxProcs),
      '--max-output-bytes',
      String(maxOutputBytes),
      ...roDirs.flatMap((d) => ['--ro-dir', d]),
      '--',
      ...effectiveCmd,
    ];

    return new Promise((resolve, reject) => {
      const child = spawn(WINDOWS_LAUNCHER_PATH, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      activeChild = child;

      const outChunks = [];
      const errChunks = [];
      let settled = false;

      child.stdout.on('data', (c) => outChunks.push(c));
      child.stderr.on('data', (c) => errChunks.push(c));

      const killTimer = setTimeout(() => {
        if (settled) return;
        try {
          child.kill('SIGKILL');
        } catch {
          // Ignore
        }
      }, timeoutMs + 5000);

      child.on('error', (err) => {
        clearTimeout(killTimer);
        activeChild = null;
        if (!settled) {
          settled = true;
          reject(
            new AppError(
              503,
              'SANDBOX_UNAVAILABLE',
              `Failed to start Windows sandbox launcher: ${err.message}`
            )
          );
        }
      });

      child.on('close', () => {
        clearTimeout(killTimer);
        activeChild = null;
        if (settled) return;
        settled = true;

        const rawOut = Buffer.concat(outChunks).toString('utf8').trim();
        const rawErr = Buffer.concat(errChunks).toString('utf8').trim();

        if (rawOut.startsWith('{')) {
          try {
            const parsed = JSON.parse(rawOut);
            let stdout = Buffer.from(parsed.stdoutB64 || '', 'base64').toString('utf8');
            const stderr = Buffer.from(parsed.stderrB64 || '', 'base64').toString('utf8');
            if (parsed.outputTruncated) {
              stdout += '\n[output truncated at limit]\n';
            }
            resolve({
              stdout,
              stderr,
              exitCode: parsed.exitCode ?? 1,
              signal: parsed.memoryExceeded ? 'SIGKILL' : null,
              timeMs: parsed.timeMs ?? 1,
              timedOut: Boolean(parsed.timedOut),
              memoryExceeded: Boolean(parsed.memoryExceeded),
              outputTruncated: Boolean(parsed.outputTruncated),
              memoryKb: parsed.memoryKb ?? 0,
            });
            return;
          } catch {
            // Fall through if launcher output was corrupted
          }
        }

        resolve({
          stdout: '',
          stderr: rawErr || rawOut || 'Windows sandbox execution failed unexpectedly.',
          exitCode: 1,
          signal: null,
          timeMs: timeoutMs,
          timedOut: true,
          memoryExceeded: false,
          outputTruncated: false,
          memoryKb: 0,
        });
      });

      child.stdin.on('error', () => {});
      if (stdin) {
        child.stdin.write(stdin);
      }
      child.stdin.end();
    });
  }

  async function run(cmd, stdin, limits, options = {}) {
    const workDir = options.workDir || activeWorkDir;
    const writableWorkDir = Boolean(options.writableWorkDir);
    const timeoutMs = limits.timeLimitMs;
    const memoryMb = limits.memoryLimitMb;
    const maxProcs = limits.maxProcesses || 64;
    const maxOutputBytes = limits.maxOutputBytes || 1024 * 1024;

    const exeResolved = await resolveExecutableForWin(cmd[0]);
    const roDirs = [];
    const exeRoot = resolveToolchainRoot(exeResolved);
    if (exeRoot) roDirs.push(exeRoot);
    for (const extra of options.readOnlyDirs || []) {
      const r = resolveToolchainRoot(extra);
      if (r && !roDirs.includes(r)) roDirs.push(r);
    }
    await ensureToolchainDirsReadable(roDirs);

    const effectiveCmd = [exeResolved, ...cmd.slice(1)];
    const params = {
      workDir,
      writableWorkDir,
      timeoutMs,
      memoryMb,
      maxProcs,
      maxOutputBytes,
      roDirs,
      effectiveCmd,
      stdin,
    };

    const res = await invokeLauncher('appcontainer', params);

    // Legacy 32-bit Windows toolchains (MinGW) or TrustedInstaller Program Files folders (JDK)
    // cannot pass AppContainer DLL ACL/ASLR checks. Fall back strictly to WRITE_RESTRICTED +
    // DISABLE_MAX_PRIVILEGE + Job Object (blocks all host filesystem writes and caps memory/CPU/procs).
    const appContainerLoaderBlocked =
      (res.exitCode === 1 && /Win32=623/.test(res.stderr || '')) ||
      res.exitCode === 3221225794;

    if (appContainerLoaderBlocked) {
      const restrictedRes = await invokeLauncher('restricted', params);
      // Legacy MinGW 6.3 pex_win32 driver may silently exit 1 under WRITE_RESTRICTED during host
      // compilation only; allow DISABLE_MAX_PRIVILEGE + JobObject for the compiler step only, never student run.
      if (
        writableWorkDir &&
        restrictedRes.exitCode === 1 &&
        !(restrictedRes.stderr || '').trim() &&
        !(restrictedRes.stdout || '').trim()
      ) {
        return invokeLauncher('restricted-med', params);
      }
      return restrictedRes;
    }

    return res;
  }

  function kill() {
    if (activeChild) {
      try {
        activeChild.kill('SIGKILL');
      } catch {
        // Ignore
      }
      activeChild = null;
    }
  }

  async function cleanup() {
    kill();
    activeWorkDir = null;
  }

  return {
    name: 'windows-appcontainer',
    detectCapabilities,
    prepare,
    run,
    kill,
    cleanup,
  };
}
