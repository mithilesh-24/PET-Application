import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';
import { AppError } from '../../middleware/errorHandler.js';

const execFileAsync = promisify(execFile);

async function findExecutable(cmd) {
  try {
    const { stdout } = await execFileAsync('which', [cmd], { timeout: 3000 });
    return stdout.split(/\r?\n/)[0]?.trim() || null;
  } catch {
    return null;
  }
}

async function probeBwrap() {
  const bin = await findExecutable('bwrap');
  if (!bin) return null;
  try {
    await execFileAsync(
      bin,
      [
        '--unshare-all',
        '--die-with-parent',
        '--ro-bind-try',
        '/usr',
        '/usr',
        '--ro-bind-try',
        '/lib',
        '/lib',
        '--ro-bind-try',
        '/lib64',
        '/lib64',
        '--ro-bind-try',
        '/bin',
        '/bin',
        '/bin/true',
      ],
      { timeout: 4000 }
    );
    return { kind: 'bwrap', path: bin };
  } catch (err) {
    return { kind: 'bwrap-blocked', path: bin, error: err.message };
  }
}

async function probeNsjail() {
  const bin = await findExecutable('nsjail');
  if (!bin) return null;
  return { kind: 'nsjail', path: bin };
}

async function probeFirejail() {
  const bin = await findExecutable('firejail');
  if (!bin) return null;
  return { kind: 'firejail', path: bin };
}

export function createLinuxSandboxDriver({ runnerUser = 'pet-runner' } = {}) {
  let cachedBackend = null;
  let activePid = null;
  let activeWorkDir = null;

  async function detectCapabilities() {
    if (process.platform !== 'linux') {
      return { ready: false, mode: 'unsupported', details: 'Linux driver on non-Linux host' };
    }

    const prlimitPath = await findExecutable('prlimit');
    const bwrap = await probeBwrap();
    if (bwrap?.kind === 'bwrap') {
      cachedBackend = { ...bwrap, prlimitPath };
      return {
        ready: true,
        mode: 'bwrap-namespaces',
        driver: 'linux-bwrap',
        details: `bubblewrap (${bwrap.path}) with isolated PID/net/IPC/UTS/mount namespaces, no-new-privs, --cap-drop ALL, private tmpfs, ${prlimitPath ? 'prlimit' : 'ulimit'}. Configured runner user: ${runnerUser}.`,
        installHints: null,
      };
    }

    const nsjail = await probeNsjail();
    if (nsjail) {
      cachedBackend = { ...nsjail, prlimitPath };
      return {
        ready: true,
        mode: 'nsjail',
        driver: 'linux-nsjail',
        details: `nsjail (${nsjail.path}) with namespace + cgroup/rlimit isolation.`,
        installHints: null,
      };
    }

    const firejail = await probeFirejail();
    if (firejail) {
      cachedBackend = { ...firejail, prlimitPath };
      return {
        ready: true,
        mode: 'firejail',
        driver: 'linux-firejail',
        details: `firejail (${firejail.path}) with --net=none, --seccomp, --caps.drop=all, --nonewprivs.`,
        installHints: null,
      };
    }

    cachedBackend = null;
    const reason =
      bwrap?.kind === 'bwrap-blocked'
        ? `bubblewrap found at ${bwrap.path} but user namespaces are blocked (${bwrap.error}).`
        : 'Neither bubblewrap (bwrap), nsjail, nor firejail is installed on this Linux host.';

    return {
      ready: false,
      mode: 'disabled',
      driver: 'linux',
      details: reason,
      installHints: {
        linux:
          'Ubuntu/Debian: sudo apt-get update && sudo apt-get install -y bubblewrap && sudo useradd -r -M -s /usr/sbin/nologin pet-runner (on Ubuntu 24.04 also configure /etc/apparmor.d/bwrap if userns is restricted).',
      },
    };
  }

  async function prepare(workspace) {
    activeWorkDir = workspace;
    await fs.mkdir(workspace, { recursive: true, mode: 0o700 });
    if (!cachedBackend) {
      await detectCapabilities();
    }
    if (!cachedBackend) {
      throw new AppError(
        503,
        'SANDBOX_UNAVAILABLE',
        'Linux sandbox (bubblewrap/nsjail/firejail) is unavailable or user namespaces are disabled.'
      );
    }
  }

  function buildSandboxedArgs(cmd, limits, { workDir, writableWorkDir }) {
    const cpuSec = Math.max(1, Math.ceil(limits.timeLimitMs / 1000));
    const fsizeBytes = (limits.maxFileSizeKb || 8192) * 1024;
    const maxProcs = limits.maxProcesses || 64;
    const memBytes = (limits.memoryLimitMb || 256) * 1024 * 1024;
    const isJava = /(^|\/)java(c)?$/.test(cmd[0]);

    const innerCmd =
      cachedBackend.prlimitPath && cachedBackend.kind === 'bwrap'
        ? [
            cachedBackend.prlimitPath,
            `--cpu=${cpuSec}`,
            `--fsize=${fsizeBytes}`,
            `--nproc=${maxProcs}`,
            '--nofile=64',
            ...(isJava ? [] : [`--as=${memBytes}`]),
            '--',
            ...cmd,
          ]
        : cmd;

    if (cachedBackend.kind === 'bwrap') {
      const args = [
        '--unshare-all',
        '--die-with-parent',
        '--new-session',
        '--cap-drop',
        'ALL',
        '--clearenv',
        '--setenv',
        'PATH',
        '/usr/local/bin:/usr/bin:/bin',
        '--setenv',
        'HOME',
        workDir,
        '--setenv',
        'TMPDIR',
        '/tmp',
        '--ro-bind-try',
        '/usr',
        '/usr',
        '--ro-bind-try',
        '/lib',
        '/lib',
        '--ro-bind-try',
        '/lib64',
        '/lib64',
        '--ro-bind-try',
        '/bin',
        '/bin',
        '--ro-bind-try',
        '/sbin',
        '/sbin',
        '--ro-bind-try',
        '/opt',
        '/opt',
        '--ro-bind-try',
        '/etc/alternatives',
        '/etc/alternatives',
        '--ro-bind-try',
        '/etc/ld.so.cache',
        '/etc/ld.so.cache',
        '--proc',
        '/proc',
        '--dev',
        '/dev',
        '--tmpfs',
        '/tmp',
        writableWorkDir ? '--bind' : '--ro-bind',
        workDir,
        workDir,
        '--chdir',
        workDir,
        '--',
        ...innerCmd,
      ];
      return { executable: cachedBackend.path, args };
    }

    if (cachedBackend.kind === 'nsjail') {
      return {
        executable: cachedBackend.path,
        args: [
          '--mode',
          'o',
          '--quiet',
          '--disable_clone_newcgroup',
          '--time_limit',
          String(cpuSec + 1),
          '--rlimit_fsize',
          String(Math.max(1, Math.ceil((limits.maxFileSizeKb || 8192) / 1024))),
          '--rlimit_nproc',
          String(maxProcs),
          '--rlimit_nofile',
          '64',
          ...(isJava ? [] : ['--rlimit_as', String(limits.memoryLimitMb || 256)]),
          '--bindmount_ro',
          '/usr',
          '--bindmount_ro',
          '/lib',
          ...(writableWorkDir ? ['--bindmount'] : ['--bindmount_ro']),
          `${workDir}:${workDir}`,
          '--cwd',
          workDir,
          '--',
          ...cmd,
        ],
      };
    }

    return {
      executable: cachedBackend.path,
      args: [
        '--quiet',
        '--noprofile',
        '--net=none',
        '--caps.drop=all',
        '--nonewprivs',
        '--seccomp',
        `--timeout=${`00:00:${String(Math.min(59, cpuSec + 1)).padStart(2, '0')}`}`,
        `--rlimit-fsize=${fsizeBytes}`,
        `--rlimit-nproc=${maxProcs}`,
        `--rlimit-nofile=64`,
        ...(writableWorkDir ? [`--whitelist=${workDir}`] : [`--read-only=${workDir}`]),
        '--',
        ...cmd,
      ],
    };
  }

  async function run(cmd, stdin, limits, options = {}) {
    const workDir = options.workDir || activeWorkDir;
    const writableWorkDir = Boolean(options.writableWorkDir);
    const maxOutputBytes = limits.maxOutputBytes || 1024 * 1024;
    const timeoutMs = limits.timeLimitMs;

    if (!cachedBackend) {
      await prepare(workDir);
    }

    const { executable, args } = buildSandboxedArgs(cmd, limits, { workDir, writableWorkDir });
    const startMs = Date.now();

    return new Promise((resolve) => {
      const child = spawn(executable, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: true,
      });
      activePid = child.pid;

      const outChunks = [];
      const errChunks = [];
      let totalBytes = 0;
      let timedOut = false;
      let outputTruncated = false;
      let memoryExceeded = false;
      let killed = false;

      const killTree = () => {
        if (killed) return;
        killed = true;
        try {
          process.kill(-child.pid, 'SIGKILL');
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
        activePid = null;
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
        activePid = null;
        let stdout = Buffer.concat(outChunks).toString('utf8');
        const stderr = Buffer.concat(errChunks).toString('utf8');
        if (outputTruncated) {
          stdout += '\n[output truncated at limit]\n';
        }
        if (
          !timedOut &&
          !outputTruncated &&
          (signal === 'SIGKILL' ||
            code === 137 ||
            /OutOfMemoryError|MemoryError|std::bad_alloc|Cannot allocate memory/i.test(stderr))
        ) {
          memoryExceeded = true;
        }
        resolve({
          stdout,
          stderr,
          exitCode: code ?? (signal ? 128 : 1),
          signal: signal || null,
          timeMs: Math.max(1, Date.now() - startMs),
          timedOut,
          memoryExceeded,
          outputTruncated,
          memoryKb: 0,
        });
      });

      child.stdin.on('error', () => {});
      if (stdin) child.stdin.write(stdin);
      child.stdin.end();
    });
  }

  function kill() {
    if (activePid) {
      try {
        process.kill(-activePid, 'SIGKILL');
      } catch {
        // Ignore
      }
      activePid = null;
    }
  }

  async function cleanup() {
    kill();
    activeWorkDir = null;
  }

  return {
    name: 'linux-namespace',
    detectCapabilities,
    prepare,
    run,
    kill,
    cleanup,
  };
}
