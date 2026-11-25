import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../server.js';
import {
  CONTAINER_PREFIX,
  cleanupStaleSandbox,
  runSubmission,
  runSubmissionBatch,
} from '../compiler/dockerRunner.js';
import { normaliseOutput, outputsMatch } from '../compiler/languageRunner.js';

const execFileAsync = promisify(execFile);

let tempExecDir;

beforeAll(async () => {
  tempExecDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pet-prep-m8-'));
  await cleanupStaleSandbox(tempExecDir);
});

afterAll(async () => {
  await cleanupStaleSandbox(tempExecDir);
  if (tempExecDir) {
    await fs.rm(tempExecDir, { recursive: true, force: true }).catch(() => {});
  }
});

describe('M8 output normalization and compiler API', () => {
  it('normalises CRLF, trailing line spaces, and trailing blank lines while keeping inner spaces and case', () => {
    const raw = 'Hello   World  \r\nLine Two\t \r\n\r\n\n';
    expect(normaliseOutput(raw)).toBe('Hello   World\nLine Two');
    expect(outputsMatch('Hello   World\nLine Two', raw)).toBe(true);
    expect(outputsMatch('Hello World\nLine Two', raw)).toBe(false);
    expect(outputsMatch('hello   world\nline two', raw)).toBe(false);
  });

  it('GET /api/settings/compilers returns tool statuses and dockerReady flag', async () => {
    const app = createApp();
    const res = await request(app).get('/api/settings/compilers');

    expect(res.status).toBe(200);
    expect(typeof res.body.dockerReady).toBe('boolean');
    expect(Array.isArray(res.body.tools)).toBe(true);
    const names = res.body.tools.map((t) => t.tool);
    expect(names).toEqual(
      expect.arrayContaining(['gcc', 'g++', 'javac', 'java', 'python', 'docker', 'pet-runner:1'])
    );
  });

  it('rejects source code over 100 KB with VALIDATION_FAILED', async () => {
    const huge = `print("${'a'.repeat(101 * 1024)}")`;
    await expect(
      runSubmission({ language: 'python', source: huge, tempBaseDir: tempExecDir })
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('M8 real Docker sandbox execution', () => {
  it('runs Hello World in all 4 languages (c, cpp, java, python)', async () => {
    const samples = [
      {
        language: 'c',
        source:
          '#include <stdio.h>\nint main(void){ char s[32]; if(scanf("%31s", s)==1) printf("Hello %s\\n", s); return 0; }',
      },
      {
        language: 'cpp',
        source:
          '#include <iostream>\n#include <string>\nint main(){ std::string s; std::cin >> s; std::cout << "Hello " << s << "\\n"; return 0; }',
      },
      {
        language: 'java',
        source:
          'import java.util.*;\npublic class Main { public static void main(String[] args){ Scanner sc = new Scanner(System.in); if(sc.hasNext()) System.out.println("Hello " + sc.next()); } }',
      },
      {
        language: 'python',
        source: 'import sys\ns = sys.stdin.read().strip()\nprint(f"Hello {s}")',
      },
    ];

    for (const sample of samples) {
      const res = await runSubmission({
        language: sample.language,
        source: sample.source,
        stdin: 'KEC\n',
        timeLimitMs: 5000,
        memoryLimitMb: 256,
        tempBaseDir: tempExecDir,
      });

      expect(res.compile.ok).toBe(true);
      expect(res.run.status).toBe('ok');
      expect(res.run.exitCode).toBe(0);
      expect(normaliseOutput(res.run.stdout)).toBe('Hello KEC');
    }
  }, 60000);

  it('captures compile error cleanly with status ce', async () => {
    const res = await runSubmission({
      language: 'cpp',
      source: 'int main() { syntax error here }',
      tempBaseDir: tempExecDir,
    });

    expect(res.compile.ok).toBe(false);
    expect(res.compile.stderr.length).toBeGreaterThan(0);
    expect(res.run.status).toBe('ce');
  }, 30000);

  it('captures runtime error exit code with status rte', async () => {
    const res = await runSubmission({
      language: 'python',
      source: 'import sys\nsys.exit(7)',
      tempBaseDir: tempExecDir,
    });

    expect(res.compile.ok).toBe(true);
    expect(res.run.status).toBe('rte');
    expect(res.run.exitCode).toBe(7);
  }, 30000);

  it('kills infinite loop at the time limit with status tle', async () => {
    const res = await runSubmission({
      language: 'python',
      source: 'while True:\n    pass',
      timeLimitMs: 1200,
      memoryLimitMb: 128,
      tempBaseDir: tempExecDir,
    });

    expect(res.compile.ok).toBe(true);
    expect(res.run.status).toBe('tle');
  }, 30000);

  it('kills a memory bomb with status mle', async () => {
    const res = await runSubmission({
      language: 'python',
      source: 'data = bytearray(256 * 1024 * 1024)\nprint(len(data))',
      timeLimitMs: 5000,
      memoryLimitMb: 64,
      tempBaseDir: tempExecDir,
    });

    expect(res.compile.ok).toBe(true);
    expect(res.run.status).toBe('mle');
  }, 30000);

  it('contains a fork bomb via pids-limit 64 without harming host', async () => {
    const res = await runSubmission({
      language: 'python',
      source: `import os, time
for _ in range(200):
    pid = os.fork()
    if pid == 0:
        time.sleep(0.5)
        os._exit(0)
`,
      timeLimitMs: 2500,
      memoryLimitMb: 128,
      tempBaseDir: tempExecDir,
    });

    expect(res.compile.ok).toBe(true);
    expect(['rte', 'tle']).toContain(res.run.status);
  }, 30000);

  it('blocks outbound network calls (--network none)', async () => {
    const res = await runSubmission({
      language: 'python',
      source: `import socket
s = socket.socket()
s.settimeout(2)
s.connect(("1.1.1.1", 80))
`,
      timeLimitMs: 3000,
      memoryLimitMb: 128,
      tempBaseDir: tempExecDir,
    });

    expect(res.run.status).toBe('rte');
    expect(res.run.stderr).toMatch(/Network is unreachable|OSError/i);
  }, 30000);

  it('blocks file writes outside /tmp (--read-only and :ro workdir)', async () => {
    const res = await runSubmission({
      language: 'python',
      source: `with open("/etc/pet_probe.txt", "w") as f:
    f.write("bad")
`,
      timeLimitMs: 3000,
      memoryLimitMb: 128,
      tempBaseDir: tempExecDir,
    });

    expect(res.run.status).toBe('rte');
    expect(res.run.stderr).toMatch(/Read-only|Permission|OSError/i);

    const workWrite = await runSubmission({
      language: 'python',
      source: `with open("/work/escape.txt", "w") as f:
    f.write("bad")
`,
      timeLimitMs: 3000,
      memoryLimitMb: 128,
      tempBaseDir: tempExecDir,
    });

    expect(workWrite.run.status).toBe('rte');
    expect(workWrite.run.stderr).toMatch(/Read-only|Permission|OSError/i);
  }, 30000);

  it('prevents reading host files outside the mounted workdir', async () => {
    const hostSecretPath = path.join(os.tmpdir(), `pet-host-secret-${Date.now()}.txt`);
    await fs.writeFile(hostSecretPath, 'TOP_SECRET_HOST_DATA', 'utf8');

    try {
      const res = await runSubmission({
        language: 'python',
        source: `print(open(${JSON.stringify(hostSecretPath)}).read())`,
        timeLimitMs: 3000,
        memoryLimitMb: 128,
        tempBaseDir: tempExecDir,
      });

      expect(res.run.status).toBe('rte');
      expect(res.run.stdout).not.toContain('TOP_SECRET_HOST_DATA');
    } finally {
      await fs.unlink(hostSecretPath).catch(() => {});
    }
  }, 30000);

  it('compiles once for a batch of tests and leaves zero containers and temp dirs after 20 runs', async () => {
    const batch = await runSubmissionBatch({
      language: 'cpp',
      source:
        '#include <iostream>\nint main(){ long long x; if(std::cin >> x) std::cout << (x * 2) << "\\n"; return 0; }',
      tests: Array.from({ length: 20 }, (_, i) => ({ stdin: `${i + 1}\n` })),
      timeLimitMs: 3000,
      memoryLimitMb: 128,
      tempBaseDir: tempExecDir,
    });

    expect(batch.compile.ok).toBe(true);
    expect(batch.runs).toHaveLength(20);
    batch.runs.forEach((run, i) => {
      expect(run.status).toBe('ok');
      expect(normaliseOutput(run.stdout)).toBe(String((i + 1) * 2));
    });

    const entries = await fs.readdir(tempExecDir);
    expect(entries).toEqual([]);

    const { stdout: containers } = await execFileAsync('docker', [
      'ps',
      '-a',
      '--filter',
      `name=^${CONTAINER_PREFIX}`,
      '--format',
      '{{.Names}}',
    ]);
    expect(containers.trim()).toBe('');
  }, 120000);
});
