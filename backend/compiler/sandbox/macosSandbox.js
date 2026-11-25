import { spawn } from 'node:child_process';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from '../../middleware/errorHandler.js';

const SANDBOX_EXEC_BIN = '/usr/bin/sandbox-exec';

function escapeSeatbeltStr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function createMacosSandboxDriver() {
  let profilePath = null;
  let activePid = null;
  let activeWorkDir = null;

  async function detectCapabilities() {
    if (process.platform !== 'darwin') {
      return { ready: false, mode: 'unsupported', details: 'macOS driver on non-macOS host' };
    }
    if (fsSync.existsSync(SANDBOX_EXEC_BIN)) {
      return {
        ready: true,
        mode: 'macos-seatbelt',
        driver: 'macos-seatbelt',
        details:
          'macOS Seatbelt (sandbox-exec) denying network, default-deny file access, workspace-only writes, plus ulimit resource caps. Note: Apple marks sandbox-exec deprecated; Linux with bubblewrap/cgroups is recommended for production exams.',
        installHints: null,
      };
    }
    return {
      ready: false,
      mode: 'disabled',
      driver: 'macos-seatbelt',
      details: `${SANDBOX_EXEC_BIN} was not found on this macOS system.`,
      installHints: {
        darwin: 'Ensure /usr/bin/sandbox-exec is available or deploy exam grading on Linux with bubblewrap.',
      },
    };
  }

  function buildSeatbeltProfile({ workDir, writableWorkDir, extraReadDirs = [] }) {
    const readDirs = ['/usr', '/bin', '/sbin', '/System', '/Library', '/opt/homebrew', '/Applications', workDir, ...extraReadDirs]
      .filter(Boolean)
      .map((d) => `(subpath "${escapeSeatbeltStr(d)}")`)
      .join('\n    ');

    return [
      '(version 1)',
      '(deny default)',
      '(deny network*)',
      '(allow process-exec)',
      '(allow process-fork)',
      '(allow sysctl-read)',
      '(allow mach-lookup)',
      '(allow file-read*',
      `    ${readDirs})`,
      writableWorkDir
        ? `(allow file-write* (subpath "${escapeSeatbeltStr(workDir)}") (subpath "/private/tmp") (subpath "/tmp"))`
        : `(allow file-write* (literal "/dev/null"))`,
      '',
    ].join('\n');
  }

  async function prepare(workspace) {
    activeWorkDir = workspace;
    await fs.mkdir(workspace, { recursive: true, mode: 0o700 });
    if (!fsSync.existsSync(SANDBOX_EXEC_BIN)) {
      throw new AppError(
        503,
        'SANDBOX_UNAVAILABLE',
        'macOS sandbox-exec is unavailable on this host.'
      );
    }
  }

  async function run(cmd, stdin, limits, options = {}) {
    const workDir = options.workDir || activeWorkDir;
    const writableWorkDir = Boolean(options.writableWorkDir);
    const timeoutMs = limits.timeLimitMs;
    const maxOutputBytes = limits.maxOutputBytes || 1024 * 1024;
    const cpuSec = Math.max(1, Math.ceil(timeoutMs / 1000));
    const fsizeBlocks = Math.max(128, Math.ceil(((limits.maxFileSizeKb || 8192) * 1024) / 512));

    profilePath = path.join(workDir, '.seatbelt.sb');
    const profileText = buildSeatbeltProfile({
      workDir,
      writableWorkDir,
      extraReadDirs: options.readOnlyDirs || [],
    });
    await fs.writeFile(profilePath, profileText, { encoding: 'utf8', mode: 0o600 });

    const ulimitWrap = `ulimit -t ${cpuSec} -f ${fsizeBlocks} -n 64; exec "$@"`;
    const args = ['-f', profilePath, '/bin/sh', '-c', ulimitWrap, '_', ...cmd];
    const startMs = Date.now();

    return new Promise((resolve) => {
      const child = spawn(SANDBOX_EXEC_BIN, args, {
        cwd: workDir,
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
        if (outputTruncated) stdout += '\n[output truncated at limit]\n';
        if (
          !timedOut &&
          !outputTruncated &&
          (signal === 'SIGKILL' || /OutOfMemoryError|MemoryError|std::bad_alloc/i.test(stderr))
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
    if (profilePath) {
      await fs.unlink(profilePath).catch(() => {});
      profilePath = null;
    }
    activeWorkDir = null;
  }

  return {
    name: 'macos-seatbelt',
    detectCapabilities,
    prepare,
    run,
    kill,
    cleanup,
  };
}
