import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { AppError } from '../../middleware/errorHandler.js';
import { createLinuxSandboxDriver } from './linuxSandbox.js';
import { createMacosSandboxDriver } from './macosSandbox.js';
import { createWindowsSandboxDriver } from './windowsSandbox.js';

let warnedInsecureBanner = false;

export function createInsecureDevDriver() {
  let activeChild = null;
  let activeWorkDir = null;

  function warnEveryRun() {
    if (!warnedInsecureBanner) {
      warnedInsecureBanner = true;
      console.warn(
        '========================================================================\n' +
          '[WARNING] PET_ALLOW_INSECURE_EXECUTION=true IS ACTIVE.\n' +
          'Running student code WITHOUT OS sandbox isolation! DEV USE ONLY.\n' +
          '========================================================================'
      );
    } else {
      console.warn('[WARNING] Executing submission in UNSANDBOXED dev-only mode.');
    }
  }

  return {
    name: 'insecure-dev',
    async detectCapabilities() {
      return {
        ready: true,
        mode: 'insecure-dev',
        driver: 'insecure-dev',
        details: 'PET_ALLOW_INSECURE_EXECUTION=true active (UNSANDBOXED — dev only).',
        installHints: null,
      };
    },
    async prepare(workspace) {
      activeWorkDir = workspace;
      await fs.mkdir(workspace, { recursive: true });
    },
    async run(cmd, stdin, limits, options = {}) {
      warnEveryRun();
      const workDir = options.workDir || activeWorkDir;
      const timeoutMs = limits.timeLimitMs;
      const maxOutputBytes = limits.maxOutputBytes || 1024 * 1024;
      const startMs = Date.now();

      return new Promise((resolve) => {
        const child = spawn(cmd[0], cmd.slice(1), {
          cwd: workDir,
          stdio: ['pipe', 'pipe', 'pipe'],
          detached: process.platform !== 'win32',
        });
        activeChild = child;

        const outChunks = [];
        const errChunks = [];
        let totalBytes = 0;
        let timedOut = false;
        let outputTruncated = false;
        let killed = false;

        const killTree = () => {
          if (killed) return;
          killed = true;
          try {
            if (process.platform === 'win32' && child.pid) {
              execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => {});
            } else if (child.pid) {
              process.kill(-child.pid, 'SIGKILL');
            }
          } catch {
            try {
              child.kill('SIGKILL');
            } catch {
              // Ignore
            }
          }
        };

        const collect = (dest) => (chunk) => {
          if (killed) return;
          const remaining = maxOutputBytes - totalBytes;
          if (remaining > 0) {
            const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
            dest.push(slice);
            totalBytes += slice.length;
            if (chunk.length > remaining) {
              outputTruncated = true;
              killTree();
            }
          } else {
            outputTruncated = true;
            killTree();
          }
        };

        child.stdout.on('data', collect(outChunks));
        child.stderr.on('data', collect(errChunks));

        const timer = setTimeout(() => {
          timedOut = true;
          killTree();
        }, timeoutMs);

        child.on('error', (err) => {
          clearTimeout(timer);
          activeChild = null;
          resolve({
            stdout: '',
            stderr: err.message,
            exitCode: 1,
            signal: null,
            timeMs: Math.max(1, Date.now() - startMs),
            timedOut: false,
            memoryExceeded: false,
            outputTruncated: false,
            memoryKb: 0,
          });
        });

        child.on('close', (code, signal) => {
          clearTimeout(timer);
          activeChild = null;
          let stdout = Buffer.concat(outChunks).toString('utf8');
          const stderr = Buffer.concat(errChunks).toString('utf8');
          if (outputTruncated) stdout += '\n[output truncated at limit]\n';
          resolve({
            stdout,
            stderr,
            exitCode: code ?? (signal ? 128 : 1),
            signal: signal || null,
            timeMs: Math.max(1, Date.now() - startMs),
            timedOut,
            memoryExceeded: false,
            outputTruncated,
            memoryKb: 0,
          });
        });

        child.stdin.on('error', () => {});
        if (stdin) child.stdin.write(stdin);
        child.stdin.end();
      });
    },
    kill() {
      if (activeChild) {
        try {
          activeChild.kill('SIGKILL');
        } catch {
          // Ignore
        }
        activeChild = null;
      }
    },
    async cleanup() {
      this.kill();
      activeWorkDir = null;
    },
  };
}

export function selectOsSandboxDriver({ platform = process.platform, runnerUser = 'pet-runner' } = {}) {
  if (platform === 'win32') return createWindowsSandboxDriver();
  if (platform === 'linux') return createLinuxSandboxDriver({ runnerUser });
  if (platform === 'darwin') return createMacosSandboxDriver();
  return {
    name: `unsupported-${platform}`,
    async detectCapabilities() {
      return {
        ready: false,
        mode: 'disabled',
        driver: platform,
        details: `No native sandbox driver exists for platform "${platform}".`,
        installHints: { [platform]: 'Run PET Prep on Linux, Windows, or macOS.' },
      };
    },
    async prepare() {
      throw new AppError(503, 'SANDBOX_UNAVAILABLE', `Unsupported platform: ${platform}`);
    },
    async run() {
      throw new AppError(503, 'SANDBOX_UNAVAILABLE', `Unsupported platform: ${platform}`);
    },
    kill() {},
    async cleanup() {},
  };
}

export async function resolveActiveSandbox({
  platform = process.platform,
  runnerUser = 'pet-runner',
  allowInsecureExecution = false,
  driverOverride = null,
} = {}) {
  const osDriver = driverOverride || selectOsSandboxDriver({ platform, runnerUser });
  const caps = await osDriver.detectCapabilities();

  if (caps.ready) {
    return { status: 'ready', driver: osDriver, capabilities: caps };
  }

  if (allowInsecureExecution) {
    const devDriver = createInsecureDevDriver();
    const devCaps = await devDriver.detectCapabilities();
    return {
      status: 'insecure-dev',
      driver: devDriver,
      capabilities: {
        ...devCaps,
        warning:
          'OS sandbox unavailable; falling back to UNSANDBOXED mode because PET_ALLOW_INSECURE_EXECUTION=true.',
        missingReason: caps.details,
      },
    };
  }

  return {
    status: 'disabled',
    driver: osDriver,
    capabilities: caps,
  };
}
