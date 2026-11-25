import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { AppError } from '../middleware/errorHandler.js';
import { loadExecutionConfig } from './executionConfig.js';
import { clampLimits, getLanguageRunner, validateSourceInput } from './languageRunner.js';
import { resolveActiveSandbox } from './sandbox/sandboxDriver.js';

const execFileAsync = promisify(execFile);

function createConcurrencyQueue(maxConcurrent) {
  let active = 0;
  const waiters = [];

  async function acquire() {
    if (active < maxConcurrent) {
      active += 1;
      return;
    }
    await new Promise((resolve) => waiters.push(resolve));
    active += 1;
  }

  function release() {
    active = Math.max(0, active - 1);
    const next = waiters.shift();
    if (next) next();
  }

  return {
    async run(fn) {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
    getStats() {
      return { active, queued: waiters.length, maxConcurrent };
    },
  };
}

function classifyRunOutcome(execResult) {
  const { exitCode, signal, timedOut, memoryExceeded, stderr } = execResult;

  if (timedOut) {
    return 'tle';
  }

  const oomText = /OutOfMemoryError|MemoryError|std::bad_alloc|Cannot allocate memory|VirtualAlloc/i.test(
    stderr || ''
  );
  if (memoryExceeded || signal === 'SIGKILL' || exitCode === 137 || oomText) {
    return 'mle';
  }

  if (exitCode !== 0 || signal !== null) {
    return 'rte';
  }

  return 'ok';
}

function truncateText(str, maxBytes) {
  const buf = Buffer.from(str || '', 'utf8');
  if (buf.length <= maxBytes) return str || '';
  return `${buf.subarray(0, maxBytes).toString('utf8')}\n[output truncated at limit]\n`;
}

export async function cleanupStaleWorkspaces(tempBaseDir = loadExecutionConfig().workspaceBaseDir) {
  try {
    await fs.mkdir(tempBaseDir, { recursive: true, mode: 0o700 });
    const entries = await fs.readdir(tempBaseDir, { withFileTypes: true });
    await Promise.all(
      entries.map((entry) =>
        fs.rm(path.join(tempBaseDir, entry.name), { recursive: true, force: true }).catch(() => {})
      )
    );
  } catch {
    // Ignore cleanup errors on shutdown/startup
  }
}

export function createExecutionEngine(options = {}) {
  const execCfg = options.execConfig || loadExecutionConfig(options.env);
  const queue = createConcurrencyQueue(execCfg.maxConcurrent);
  let periodicTimer = null;
  let cachedStdPromise = null;

  async function resolveCStandards() {
    if (cachedStdPromise) return cachedStdPromise;
    cachedStdPromise = (async () => {
      try {
        const gccCmd = execCfg.toolchains.gcc || 'gcc';
        const { stdout } = await execFileAsync(gccCmd, ['--version'], { timeout: 3000 });
        const m = stdout.match(/\b(\d+)\.\d+\.\d+\b/);
        const major = m ? Number.parseInt(m[1], 10) : 11;
        return major >= 8 ? { cStd: 'c17', cppStd: 'c++17' } : { cStd: 'c11', cppStd: 'c++14' };
      } catch {
        return { cStd: 'c17', cppStd: 'c++17' };
      }
    })();
    return cachedStdPromise;
  }

  async function resolveDriver() {
    const resolved = await resolveActiveSandbox({
      platform: options.platform || process.platform,
      runnerUser: execCfg.runnerUser,
      allowInsecureExecution: execCfg.allowInsecureExecution,
      driverOverride: options.driverOverride,
    });

    if (resolved.status === 'disabled') {
      throw new AppError(
        503,
        'SANDBOX_UNAVAILABLE',
        `Code execution sandbox is DISABLED: ${resolved.capabilities.details}`,
        {
          driver: resolved.capabilities.driver,
          installHints: resolved.capabilities.installHints,
        }
      );
    }

    return resolved;
  }

  async function createWorkspace(baseDir, runner, source) {
    await fs.mkdir(baseDir, { recursive: true, mode: 0o700 });
    const workDir = path.join(baseDir, `run-${crypto.randomUUID()}`);
    const outDir = path.join(workDir, 'out');
    await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
    await fs.chmod(workDir, 0o700).catch(() => {});
    await fs.chmod(outDir, 0o700).catch(() => {});

    const preparedText = runner.preparedSource(source);
    const sourcePath = path.join(workDir, runner.sourceFile);
    await fs.writeFile(sourcePath, preparedText, { encoding: 'utf8', mode: 0o600 });
    return workDir;
  }

  async function runSubmissionBatch({
    language,
    source,
    tests,
    timeLimitMs,
    memoryLimitMb,
    tempBaseDir = execCfg.workspaceBaseDir,
  }) {
    validateSourceInput(language, source);
    const limits = clampLimits({
      timeLimitMs,
      memoryLimitMb,
      defaultTimeLimitMs: execCfg.timeoutMs,
      defaultMemoryLimitMb: execCfg.memoryLimitMb,
    });

    const { driver } = await resolveDriver();

    return queue.run(async () => {
      const stds = await resolveCStandards();
      const dummyRunner = getLanguageRunner(language, {
        memoryLimitMb: limits.memoryLimitMb,
        workDir: '.',
        toolchainPaths: execCfg.toolchains,
        ...stds,
      });
      const workDir = await createWorkspace(tempBaseDir, dummyRunner, source);
      const runner = getLanguageRunner(language, {
        memoryLimitMb: limits.memoryLimitMb,
        workDir,
        toolchainPaths: execCfg.toolchains,
        useStaticCpp: process.platform === 'win32',
        ...stds,
      });

      const driverLimits = {
        timeLimitMs: limits.timeLimitMs,
        memoryLimitMb: limits.memoryLimitMb,
        maxOutputBytes: execCfg.maxOutputBytes,
        maxProcesses: execCfg.maxProcesses,
        maxFileSizeKb: execCfg.maxFileSizeKb,
      };

      const readOnlyDirs = [
        execCfg.toolchains.gcc,
        execCfg.toolchains.gpp,
        execCfg.toolchains.javac,
        execCfg.toolchains.java,
        execCfg.toolchains.python,
      ].filter(Boolean);

      try {
        await driver.prepare(workDir, driverLimits);

        let compileResult = { ok: true, stderr: '', ms: 0 };

        if (runner.compileCmd) {
          const compileLimits = {
            ...driverLimits,
            timeLimitMs: execCfg.compileTimeoutMs,
            memoryLimitMb: Math.max(512, limits.memoryLimitMb),
          };
          const compExec = await driver.run(runner.compileCmd, '', compileLimits, {
            workDir,
            writableWorkDir: true,
            readOnlyDirs,
          });
          const fallbackMsg = compExec.timedOut
            ? 'Compilation timed out'
            : compExec.exitCode !== 0
              ? `Exit code ${compExec.exitCode}`
              : '';
          compileResult = {
            ok: !compExec.timedOut && compExec.exitCode === 0,
            stderr: truncateText(
              [compExec.stderr, compExec.stdout].filter(Boolean).join('\n') || fallbackMsg,
              execCfg.maxOutputBytes
            ),
            ms: compExec.timeMs,
          };
        }

        if (!compileResult.ok) {
          const runs = tests.map(() => ({
            exitCode: null,
            signal: null,
            stdout: '',
            stderr: '',
            ms: 0,
            memoryKb: 0,
            status: 'ce',
          }));
          return { compile: compileResult, runs };
        }

        const runs = [];
        for (const testItem of tests) {
          const stdin = typeof testItem === 'string' ? testItem : testItem?.stdin || '';
          const execRes = await driver.run(runner.runCmd, stdin, driverLimits, {
            workDir,
            writableWorkDir: false,
            readOnlyDirs,
          });
          runs.push({
            exitCode: execRes.exitCode,
            signal: execRes.signal,
            stdout: truncateText(execRes.stdout, execCfg.maxOutputBytes),
            stderr: truncateText(execRes.stderr, execCfg.maxOutputBytes),
            ms: execRes.timeMs,
            memoryKb: execRes.memoryKb ?? 0,
            status: classifyRunOutcome(execRes),
          });
        }

        return { compile: compileResult, runs };
      } finally {
        await driver.cleanup().catch(() => {});
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      }
    });
  }

  async function runSubmission({
    language,
    source,
    stdin = '',
    timeLimitMs,
    memoryLimitMb,
    tempBaseDir = execCfg.workspaceBaseDir,
  }) {
    const { compile, runs } = await runSubmissionBatch({
      language,
      source,
      tests: [{ stdin }],
      timeLimitMs,
      memoryLimitMb,
      tempBaseDir,
    });
    return {
      compile,
      run: runs[0],
    };
  }

  function startWorkspaceSweeper(intervalMs = 5 * 60 * 1000, maxAgeMs = 10 * 60 * 1000) {
    if (periodicTimer) return;
    periodicTimer = setInterval(async () => {
      try {
        const entries = await fs.readdir(execCfg.workspaceBaseDir, { withFileTypes: true });
        const now = Date.now();
        await Promise.all(
          entries.map(async (entry) => {
            if (!entry.name.startsWith('run-')) return;
            const full = path.join(execCfg.workspaceBaseDir, entry.name);
            try {
              const st = await fs.stat(full);
              if (now - st.mtimeMs > maxAgeMs) {
                await fs.rm(full, { recursive: true, force: true });
              }
            } catch {
              // Ignore
            }
          })
        );
      } catch {
        // Ignore
      }
    }, intervalMs);
    periodicTimer.unref();
  }

  function stopWorkspaceSweeper() {
    if (periodicTimer) {
      clearInterval(periodicTimer);
      periodicTimer = null;
    }
  }

  return {
    config: execCfg,
    runSubmission,
    runSubmissionBatch,
    cleanupStaleWorkspaces: (dir) => cleanupStaleWorkspaces(dir || execCfg.workspaceBaseDir),
    startWorkspaceSweeper,
    stopWorkspaceSweeper,
    getQueueStats: () => queue.getStats(),
    detectSandbox: () =>
      resolveActiveSandbox({
        platform: options.platform || process.platform,
        runnerUser: execCfg.runnerUser,
        allowInsecureExecution: execCfg.allowInsecureExecution,
        driverOverride: options.driverOverride,
      }),
  };
}

let defaultEngine;
function getDefaultEngine() {
  if (!defaultEngine) {
    defaultEngine = createExecutionEngine();
  }
  return defaultEngine;
}

export function runSubmission(params) {
  return getDefaultEngine().runSubmission(params);
}

export function runSubmissionBatch(params) {
  return getDefaultEngine().runSubmissionBatch(params);
}
