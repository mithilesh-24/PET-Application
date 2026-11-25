import { execFile, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { config } from '../config.js';
import { AppError } from '../middleware/errorHandler.js';
import { clampLimits, getLanguageSpec, validateSourceInput } from './languageRunner.js';

const execFileAsync = promisify(execFile);

export const RUNNER_IMAGE = 'pet-runner:1';
export const CONTAINER_PREFIX = 'pet-exec-';
const MAX_OUTPUT_BYTES = 1024 * 1024;
const COMPILE_TIMEOUT_MS = 15000;

let warnedUnsafeFallback = false;

async function isDockerSandboxReady() {
  try {
    await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'], {
      timeout: 4000,
    });
    const { stdout } = await execFileAsync(
      'docker',
      ['image', 'inspect', RUNNER_IMAGE, '--format', '{{.Id}}'],
      { timeout: 4000 }
    );
    return Boolean(stdout.trim());
  } catch {
    return false;
  }
}

function getDockerUnavailableError() {
  return new AppError(
    503,
    'DOCKER_UNAVAILABLE',
    `Docker sandbox image "${RUNNER_IMAGE}" is unavailable. Start Docker and run "npm run setup:docker" to build it.`,
    {
      installHints: {
        win32: 'Install and start Docker Desktop, then run: npm run setup:docker',
        darwin: 'Install and start Docker Desktop, then run: npm run setup:docker',
        linux:
          'Install Docker Engine, ensure the daemon is running, then run: npm run setup:docker',
      },
    }
  );
}

async function resolveExecutionMode() {
  if (await isDockerSandboxReady()) {
    return 'docker';
  }
  if (process.env.PET_UNSAFE_LOCAL_EXEC === '1') {
    if (!warnedUnsafeFallback) {
      warnedUnsafeFallback = true;
      console.warn(
        '========================================================================\n' +
          '[WARNING] PET_UNSAFE_LOCAL_EXEC=1 IS ACTIVE: Running code WITHOUT Docker\n' +
          'sandbox isolation. NEVER use this mode in real exams or untrusted runs.\n' +
          '========================================================================'
      );
    }
    return 'unsafe-local';
  }
  throw getDockerUnavailableError();
}

export async function cleanupStaleSandbox(tempBaseDir = config.paths.tempExecDir) {
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['ps', '-a', '--filter', `name=^${CONTAINER_PREFIX}`, '--format', '{{.Names}}'],
      { timeout: 4000 }
    );
    const names = stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length > 0) {
      await execFileAsync('docker', ['rm', '-f', ...names], { timeout: 10000 }).catch(() => {});
    }
  } catch {
    // Ignore when Docker daemon is not running
  }

  try {
    await fs.mkdir(tempBaseDir, { recursive: true });
    const entries = await fs.readdir(tempBaseDir, { withFileTypes: true });
    await Promise.all(
      entries.map((entry) =>
        fs.rm(path.join(tempBaseDir, entry.name), { recursive: true, force: true }).catch(() => {})
      )
    );
  } catch {
    // Ignore cleanup errors
  }
}

function truncateText(str, maxBytes = MAX_OUTPUT_BYTES) {
  const buf = Buffer.from(str || '', 'utf8');
  if (buf.length <= maxBytes) return str || '';
  return `${buf.subarray(0, maxBytes).toString('utf8')}\n[output truncated at 1 MB]\n`;
}

async function forceRemoveContainer(containerName) {
  await execFileAsync('docker', ['rm', '-f', containerName], { timeout: 5000 }).catch(() => {});
}

async function runDockerSupervised({
  workDir,
  mountMode,
  supervisorTimeoutMs,
  memoryLimitMb,
  cmd,
  stdin = '',
}) {
  const containerName = `${CONTAINER_PREFIX}${crypto.randomUUID()}`;
  const dockerArgs = [
    'run',
    '--rm',
    '-i',
    '--name',
    containerName,
    '--network',
    'none',
    '--memory',
    `${memoryLimitMb}m`,
    '--memory-swap',
    `${memoryLimitMb}m`,
    '--cpus',
    '1',
    '--pids-limit',
    '64',
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--user',
    '10001:10001',
    '-v',
    `${workDir}:/work:${mountMode}`,
    '--workdir',
    '/work',
    RUNNER_IMAGE,
    String(supervisorTimeoutMs),
    ...cmd,
  ];

  const startMs = Date.now();
  let outerTimedOut = false;

  const result = await new Promise((resolve) => {
    const child = spawn('docker', dockerArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdoutChunks = [];
    const stderrChunks = [];

    child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
    child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

    const killTimer = setTimeout(() => {
      outerTimedOut = true;
      execFileAsync('docker', ['kill', containerName], { timeout: 3000 }).catch(() => {});
      setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Ignore
        }
      }, 500);
    }, supervisorTimeoutMs + 4000);

    child.on('error', (err) => {
      clearTimeout(killTimer);
      resolve({
        dockerExitCode: 1,
        stdout: '',
        stderr: err.message,
        wallMs: Date.now() - startMs,
        outerTimedOut,
      });
    });

    child.on('close', (code) => {
      clearTimeout(killTimer);
      resolve({
        dockerExitCode: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString('utf8'),
        stderr: Buffer.concat(stderrChunks).toString('utf8'),
        wallMs: Date.now() - startMs,
        outerTimedOut,
      });
    });

    child.stdin.on('error', () => {});
    if (stdin) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });

  await forceRemoveContainer(containerName);

  // Parse supervisor JSON envelope if available
  const trimmed = result.stdout.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const stdout = Buffer.from(parsed.stdoutB64 || '', 'base64').toString('utf8');
      const stderr = Buffer.from(parsed.stderrB64 || '', 'base64').toString('utf8');
      return {
        supervisorOk: true,
        dockerExitCode: result.dockerExitCode,
        exitCode: parsed.exitCode,
        signal: parsed.signal,
        timedOut: Boolean(parsed.timedOut || result.outerTimedOut),
        ms: parsed.ms ?? result.wallMs,
        memoryKb: parsed.memoryKb ?? 0,
        stdout,
        stderr,
      };
    } catch {
      // Fall through if output wasn't valid supervisor JSON
    }
  }

  return {
    supervisorOk: false,
    dockerExitCode: result.dockerExitCode,
    exitCode: result.dockerExitCode,
    signal: result.dockerExitCode === 137 ? 'SIGKILL' : null,
    timedOut: result.outerTimedOut,
    ms: result.wallMs,
    memoryKb: 0,
    stdout: truncateText(result.stdout),
    stderr: truncateText(result.stderr),
  };
}

function classifyRunOutcome(execResult) {
  const { exitCode, signal, timedOut, stderr } = execResult;

  if (timedOut) {
    return 'tle';
  }

  const oomText = /OutOfMemoryError|MemoryError|std::bad_alloc|Cannot allocate memory/i.test(
    stderr || ''
  );
  if (signal === 'SIGKILL' || exitCode === 137 || oomText) {
    return 'mle';
  }

  if (exitCode !== 0 || signal !== null) {
    return 'rte';
  }

  return 'ok';
}

async function runUnsafeLocalCommand({ cmd, cwd, timeoutMs, stdin = '' }) {
  const startMs = Date.now();
  return new Promise((resolve) => {
    const child = spawn(cmd[0], cmd.slice(1), {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let timedOut = false;

    child.stdout.on('data', (c) => stdoutChunks.push(c));
    child.stderr.on('data', (c) => stderrChunks.push(c));

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // Ignore
      }
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        signal: null,
        timedOut: false,
        ms: Date.now() - startMs,
        memoryKb: 0,
        stdout: '',
        stderr: err.message,
      });
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        exitCode: code ?? (signal ? 128 : 1),
        signal: signal || null,
        timedOut,
        ms: Date.now() - startMs,
        memoryKb: 0,
        stdout: truncateText(Buffer.concat(stdoutChunks).toString('utf8')),
        stderr: truncateText(Buffer.concat(stderrChunks).toString('utf8')),
      });
    });

    child.stdin.on('error', () => {});
    if (stdin) child.stdin.write(stdin);
    child.stdin.end();
  });
}

function mapLocalCmd(containerCmd, workDir) {
  const outDir = path.join(workDir, 'out');
  const mapArg = (arg) =>
    arg
      .replace(
        /^\/work\/out\/main$/,
        path.join(outDir, process.platform === 'win32' ? 'main.exe' : 'main')
      )
      .replace(/^\/work\/out$/, outDir)
      .replace(/^\/work\//, `${workDir}${path.sep}`);

  const mapped = containerCmd.map(mapArg);
  if (mapped[0] === 'python3' && process.platform === 'win32') {
    mapped[0] = 'python';
  }
  return mapped;
}

async function prepareWorkDir(tempBaseDir, spec, source) {
  await fs.mkdir(tempBaseDir, { recursive: true });
  const workDir = path.join(tempBaseDir, crypto.randomUUID());
  const outDir = path.join(workDir, 'out');
  await fs.mkdir(outDir, { recursive: true, mode: 0o777 });
  await fs.chmod(workDir, 0o755).catch(() => {});
  await fs.chmod(outDir, 0o777).catch(() => {});
  const sourcePath = path.join(workDir, spec.sourceFile);
  await fs.writeFile(sourcePath, source, 'utf8');
  await fs.chmod(sourcePath, 0o644).catch(() => {});
  return workDir;
}

export async function runSubmissionBatch({
  language,
  source,
  tests,
  timeLimitMs,
  memoryLimitMb,
  tempBaseDir = config.paths.tempExecDir,
}) {
  validateSourceInput(language, source);
  const limits = clampLimits({ timeLimitMs, memoryLimitMb });
  const spec = getLanguageSpec(language, { memoryLimitMb: limits.memoryLimitMb });
  const mode = await resolveExecutionMode();

  const workDir = await prepareWorkDir(tempBaseDir, spec, source);

  try {
    let compileResult = { ok: true, stderr: '', ms: 0 };

    if (spec.compileCmd) {
      if (mode === 'docker') {
        const compExec = await runDockerSupervised({
          workDir,
          mountMode: 'rw',
          supervisorTimeoutMs: COMPILE_TIMEOUT_MS,
          memoryLimitMb: Math.max(256, limits.memoryLimitMb),
          cmd: spec.compileCmd,
          stdin: '',
        });
        compileResult = {
          ok: !compExec.timedOut && compExec.exitCode === 0,
          stderr: truncateText(
            compExec.stderr || (compExec.timedOut ? 'Compilation timed out' : '')
          ),
          ms: compExec.ms,
        };
      } else {
        const localCompile = await runUnsafeLocalCommand({
          cmd: mapLocalCmd(spec.compileCmd, workDir),
          cwd: workDir,
          timeoutMs: COMPILE_TIMEOUT_MS,
        });
        compileResult = {
          ok: !localCompile.timedOut && localCompile.exitCode === 0,
          stderr: truncateText(localCompile.stderr),
          ms: localCompile.ms,
        };
      }
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
      if (mode === 'docker') {
        const execRes = await runDockerSupervised({
          workDir,
          mountMode: 'ro',
          supervisorTimeoutMs: limits.timeLimitMs,
          memoryLimitMb: limits.memoryLimitMb,
          cmd: spec.runCmd,
          stdin,
        });
        runs.push({
          exitCode: execRes.exitCode,
          signal: execRes.signal,
          stdout: execRes.stdout,
          stderr: execRes.stderr,
          ms: execRes.ms,
          memoryKb: execRes.memoryKb,
          status: classifyRunOutcome(execRes),
        });
      } else {
        const localRun = await runUnsafeLocalCommand({
          cmd: mapLocalCmd(spec.runCmd, workDir),
          cwd: workDir,
          timeoutMs: limits.timeLimitMs,
          stdin,
        });
        runs.push({
          exitCode: localRun.exitCode,
          signal: localRun.signal,
          stdout: localRun.stdout,
          stderr: localRun.stderr,
          ms: localRun.ms,
          memoryKb: localRun.memoryKb,
          status: classifyRunOutcome(localRun),
        });
      }
    }

    return { compile: compileResult, runs };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function runSubmission({
  language,
  source,
  stdin = '',
  timeLimitMs,
  memoryLimitMb,
  tempBaseDir = config.paths.tempExecDir,
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
