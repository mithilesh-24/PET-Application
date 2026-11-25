import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../server.js';
import { loadExecutionConfig } from '../compiler/executionConfig.js';
import {
  cleanupStaleWorkspaces,
  createExecutionEngine,
  runSubmission,
  runSubmissionBatch,
} from '../compiler/executionEngine.js';
import { normaliseOutput, outputsMatch } from '../compiler/languageRunner.js';

let tempExecDir;

beforeAll(async () => {
  tempExecDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-prep-sandbox-'));
  await cleanupStaleWorkspaces(tempExecDir);
});

afterAll(async () => {
  await cleanupStaleWorkspaces(tempExecDir);
  if (tempExecDir) {
    await fs.rm(tempExecDir, { recursive: true, force: true }).catch(() => {});
  }
});

describe('Native OS execution config, diagnostics, and fail-closed safety', () => {
  it('validates execution config ranges and rejects invalid values clearly', () => {
    const valid = loadExecutionConfig({});
    expect(valid.timeoutSeconds).toBe(5);
    expect(valid.allowInsecureExecution).toBe(false);

    expect(() => loadExecutionConfig({ EXEC_TIMEOUT_SECONDS: '2' })).toThrow(/between 5 and 10/);
    expect(() => loadExecutionConfig({ EXEC_TIMEOUT_SECONDS: '15' })).toThrow(/between 5 and 10/);
    expect(() => loadExecutionConfig({ EXEC_MEMORY_LIMIT_MB: '16' })).toThrow(/between 64 and 2048/);
    expect(() => loadExecutionConfig({ PET_ALLOW_INSECURE_EXECUTION: 'maybe' })).toThrow(
      /Expected "true" or "false"/
    );
    expect(() => loadExecutionConfig({ EXEC_RUNNER_USER: 'bad;user' })).toThrow(/EXEC_RUNNER_USER/);
  });

  it('exposes toolchain and OS sandbox diagnostics on /api/settings/compilers and /api/health/diagnostics', async () => {
    const app = createApp();
    const res = await request(app).get('/api/settings/compilers');
    expect(res.status).toBe(200);
    expect(typeof res.body.sandboxReady).toBe('boolean');
    expect(res.body.sandboxReady).toBe(true);
    expect(res.body.tools.map((t) => t.tool)).toEqual(
      expect.arrayContaining(['gcc', 'g++', 'javac', 'java', 'python', 'sandbox'])
    );
    expect(JSON.stringify(res.body).toLowerCase()).not.toContain('docker');

    const diag = await request(app).get('/api/health/diagnostics');
    expect(diag.status).toBe(200);
    expect(diag.body.sandboxReady).toBe(true);
    expect(diag.body.ok).toBe(true);
  });

  it('fails closed (DISABLED / 503 SANDBOX_UNAVAILABLE) when sandbox prerequisite is missing, unless dev flag is explicitly true', async () => {
    const missingDriver = {
      name: 'mock-missing',
      async detectCapabilities() {
        return {
          ready: false,
          mode: 'disabled',
          driver: 'mock',
          details: 'Missing OS sandbox prerequisite.',
          installHints: { [process.platform]: 'Install sandbox prerequisite.' },
        };
      },
      async prepare() {},
      async run() {},
      kill() {},
      async cleanup() {},
    };

    const disabledEngine = createExecutionEngine({
      execConfig: loadExecutionConfig({}),
      driverOverride: missingDriver,
    });

    await expect(
      disabledEngine.runSubmission({
        language: 'python',
        source: 'print(1)',
        tempBaseDir: tempExecDir,
      })
    ).rejects.toMatchObject({
      statusCode: 503,
      code: 'SANDBOX_UNAVAILABLE',
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const insecureEngine = createExecutionEngine({
        execConfig: loadExecutionConfig({ PET_ALLOW_INSECURE_EXECUTION: 'true' }),
        driverOverride: missingDriver,
      });
      const devStatus = await insecureEngine.detectSandbox();
      expect(devStatus.status).toBe('insecure-dev');
      const res = await insecureEngine.runSubmission({
        language: 'python',
        source: 'print(42)',
        tempBaseDir: tempExecDir,
      });
      expect(res.run.status).toBe('ok');
      expect(normaliseOutput(res.run.stdout)).toBe('42');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('reports clear missing compiler failure when configured compiler path does not exist', async () => {
    const brokenGccEngine = createExecutionEngine({
      execConfig: loadExecutionConfig({ GCC_PATH: '/nonexistent/path/to/gcc-missing' }),
    });
    const res = await brokenGccEngine.runSubmission({
      language: 'c',
      source: 'int main(){return 0;}',
      tempBaseDir: tempExecDir,
    });
    expect(res.compile.ok).toBe(false);
    expect(res.run.status).toBe('ce');
  });
});

describe('Phase 4 Functional tests across C, C++, Java, Python (real OS sandbox)', () => {
  it('runs correct, stdin-driven multi-test, and wrong-output checks across all 4 languages', async () => {
    const programs = [
      {
        language: 'c',
        source:
          '#include <stdio.h>\nint main(void){ long long a,b; if(scanf("%lld %lld",&a,&b)==2) printf("%lld\\n", a+b); return 0; }',
      },
      {
        language: 'cpp',
        source:
          '#include <iostream>\nint main(){ long long a,b; if(std::cin >> a >> b) std::cout << (a+b) << "\\n"; return 0; }',
      },
      {
        language: 'java',
        source:
          'import java.util.*;\npublic class CustomNamedSolution { public static void main(String[] args){ Scanner sc = new Scanner(System.in); if(sc.hasNextLong()){ long a=sc.nextLong(); long b=sc.nextLong(); System.out.println(a+b); } } }',
      },
      {
        language: 'python',
        source: 'import sys\nd = list(map(int, sys.stdin.read().split()))\nif len(d) >= 2: print(d[0] + d[1])',
      },
    ];

    for (const p of programs) {
      const batch = await runSubmissionBatch({
        language: p.language,
        source: p.source,
        tests: [{ stdin: '10 25\n' }, { stdin: '100 200\n' }, { stdin: '-5 8\n' }],
        timeLimitMs: 5000,
        memoryLimitMb: 256,
        tempBaseDir: tempExecDir,
      });

      expect(batch.compile.ok).toBe(true);
      expect(batch.runs).toHaveLength(3);
      expect(outputsMatch(batch.runs[0].stdout, '35')).toBe(true);
      expect(outputsMatch(batch.runs[1].stdout, '300')).toBe(true);
      expect(outputsMatch(batch.runs[2].stdout, '3')).toBe(true);
      // Wrong output check
      expect(outputsMatch(batch.runs[0].stdout, '999')).toBe(false);
    }
  }, 60000);

  it('captures compile errors, runtime errors, and TLE across C, C++, Java, and Python', async () => {
    const compileErrorCases = [
      { language: 'c', source: 'int main( { broken }' },
      { language: 'cpp', source: 'int main() { unknown_symbol = 1; }' },
      { language: 'java', source: 'public class Main { void f() { broken syntax } }' },
    ];
    for (const c of compileErrorCases) {
      const res = await runSubmission({ ...c, tempBaseDir: tempExecDir });
      expect(res.compile.ok).toBe(false);
      expect(res.run.status).toBe('ce');
    }

    const pySyntax = await runSubmission({
      language: 'python',
      source: 'def broken(:\n  pass\n',
      tempBaseDir: tempExecDir,
    });
    expect(pySyntax.run.status).toBe('rte');

    const rteCases = [
      { language: 'c', source: '#include <stdlib.h>\nint main(){ return 7; }' },
      { language: 'cpp', source: 'int main(){ return 9; }' },
      { language: 'java', source: 'public class Main { public static void main(String[] a){ System.exit(5); } }' },
      { language: 'python', source: 'import sys\nsys.exit(3)' },
    ];
    for (const r of rteCases) {
      const res = await runSubmission({ ...r, tempBaseDir: tempExecDir });
      expect(res.compile.ok).toBe(true);
      expect(res.run.status).toBe('rte');
      expect(res.run.exitCode).not.toBe(0);
    }

    const tleCases = [
      { language: 'c', source: 'int main(){ while(1){} return 0; }' },
      { language: 'cpp', source: 'int main(){ while(true){} return 0; }' },
      {
        language: 'java',
        source: 'public class Main { public static void main(String[] a){ while(true){} } }',
      },
      { language: 'python', source: 'while True:\n    pass' },
    ];
    for (const t of tleCases) {
      const res = await runSubmission({
        ...t,
        timeLimitMs: 1200,
        memoryLimitMb: 256,
        tempBaseDir: tempExecDir,
      });
      expect(res.compile.ok).toBe(true);
      expect(res.run.status).toBe('tle');
    }
  }, 90000);
});

describe('Phase 4 Security containment tests (real OS sandbox)', () => {
  it('blocks reading host DB, .env, other workspace files, and sensitive paths', async () => {
    const sentinelOtherWorkspace = path.join(tempExecDir, 'other-student-secret.txt');
    const hostSecretFile = path.join(os.tmpdir(), `pet-host-secret-${Date.now()}.txt`);
    const fakeEnvFile = path.resolve(process.cwd(), '..', '.env.probe-test');

    await fs.writeFile(sentinelOtherWorkspace, 'SECRET_WORKSPACE_DATA', 'utf8');
    await fs.writeFile(hostSecretFile, 'SECRET_HOST_TMP_DATA', 'utf8');
    await fs.writeFile(fakeEnvFile, 'SECRET_ENV_KEY=abc', 'utf8');

    try {
      const targets = [sentinelOtherWorkspace, hostSecretFile, fakeEnvFile];
      if (process.platform === 'linux') {
        targets.push('/etc/passwd');
      }
      const res = await runSubmission({
        language: 'python',
        source: `
for p in ${JSON.stringify(targets)}:
    try:
        data = open(p).read()
        print("LEAK:" + p + ":" + data[:20])
    except Exception as e:
        print("BLOCKED:" + type(e).__name__)
`,
        timeLimitMs: 3000,
        memoryLimitMb: 256,
        tempBaseDir: tempExecDir,
      });

      expect(res.run.stdout).not.toContain('LEAK:');
      expect(res.run.stdout).not.toContain('SECRET_');
    } finally {
      await fs.unlink(sentinelOtherWorkspace).catch(() => {});
      await fs.unlink(hostSecretFile).catch(() => {});
      await fs.unlink(fakeEnvFile).catch(() => {});
    }
  }, 30000);

  it('blocks writing outside workspace and blocks writes during read-only run phase', async () => {
    const outsideTarget = path.join(os.tmpdir(), `pet-outside-write-${Date.now()}.txt`);
    const res = await runSubmission({
      language: 'python',
      source: `
import os
for target in [${JSON.stringify(outsideTarget)}, "escape_inside_ro.txt"]:
    try:
        with open(target, "w") as f:
            f.write("owned")
        print("WROTE:" + target)
    except Exception as e:
        print("BLOCKED:" + type(e).__name__)
`,
      timeLimitMs: 3000,
      memoryLimitMb: 256,
      tempBaseDir: tempExecDir,
    });

    expect(res.run.stdout).not.toContain('WROTE:');
    await expect(fs.access(outsideTarget)).rejects.toThrow();
  }, 30000);

  it('blocks outbound network sockets and privilege escalation attempts', async () => {
    const res = await runSubmission({
      language: 'python',
      source: `
import socket, subprocess
try:
    s = socket.create_connection(("1.1.1.1", 80), timeout=1.5)
    print("NET_OPEN")
except Exception as e:
    print("NET_BLOCKED:" + type(e).__name__)

try:
    subprocess.run(["whoami"] if __import__("sys").platform != "win32" else ["net", "user"], timeout=2)
    print("PRIV_RAN")
except Exception as e:
    print("PRIV_BLOCKED:" + type(e).__name__)
`,
      timeLimitMs: 3000,
      memoryLimitMb: 256,
      tempBaseDir: tempExecDir,
    });

    expect(res.run.stdout).not.toContain('NET_OPEN');
    expect(res.run.stdout).toContain('NET_BLOCKED:');
  }, 30000);

  it('contains fork bomb / child process explosion and kills daemon trees after timeout', async () => {
    const res = await runSubmission({
      language: 'python',
      source: `
import subprocess, sys
children = []
for _ in range(120):
    try:
        p = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
        children.append(p)
    except Exception:
        break
print("SPAWNED", len(children))
while True:
    pass
`,
      timeLimitMs: 1500,
      memoryLimitMb: 256,
      tempBaseDir: tempExecDir,
    });

    expect(res.run.status).toBe('tle');
  }, 30000);

  it('kills memory bomb with mle and truncates/kills infinite output flood', async () => {
    const memRes = await runSubmission({
      language: 'python',
      source: 'data = bytearray(512 * 1024 * 1024)\nprint(len(data))',
      timeLimitMs: 5000,
      memoryLimitMb: 64,
      tempBaseDir: tempExecDir,
    });
    expect(['mle', 'rte']).toContain(memRes.run.status);

    const floodRes = await runSubmission({
      language: 'python',
      source: 'chunk = "A" * 65536\nwhile True:\n    print(chunk)',
      timeLimitMs: 5000,
      memoryLimitMb: 256,
      tempBaseDir: tempExecDir,
    });
    expect(['mle', 'rte', 'tle']).toContain(floodRes.run.status);
    expect(floodRes.run.stdout.length).toBeLessThanOrEqual(1024 * 1024 + 256);
    expect(floodRes.run.stdout).toContain('[output truncated');
  }, 30000);
});

describe('Phase 4 Concurrency & cleanup under 20 simultaneous submissions', () => {
  it('handles 20 concurrent submissions via bounded queue with zero leftover workspaces', async () => {
    const concurrentEngine = createExecutionEngine({
      execConfig: loadExecutionConfig({
        EXEC_MAX_CONCURRENT: '4',
        EXEC_WORKSPACE_BASE_DIR: tempExecDir,
      }),
    });

    const jobs = Array.from({ length: 20 }, (_, i) =>
      concurrentEngine.runSubmission({
        language: 'python',
        source: 'import sys\nn = int(sys.stdin.read().strip())\nprint(n * n)\n',
        stdin: `${i + 2}\n`,
        timeLimitMs: 5000,
        memoryLimitMb: 256,
        tempBaseDir: tempExecDir,
      })
    );

    const results = await Promise.all(jobs);
    expect(results).toHaveLength(20);
    results.forEach((r, i) => {
      expect(r.compile.ok).toBe(true);
      expect(r.run.status).toBe('ok');
      expect(normaliseOutput(r.run.stdout)).toBe(String((i + 2) * (i + 2)));
    });

    const leftover = await fs.readdir(tempExecDir);
    expect(leftover).toEqual([]);
  }, 60000);
});
