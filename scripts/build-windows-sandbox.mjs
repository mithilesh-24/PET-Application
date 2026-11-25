import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const csPath = path.join(rootDir, 'backend', 'compiler', 'sandbox', 'windows', 'PetSandboxLauncher.cs');
const exePath = path.join(rootDir, 'backend', 'compiler', 'sandbox', 'windows', 'PetSandboxLauncher.exe');

export function findCscCompiler() {
  const candidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe',
  ];
  return candidates.find((c) => existsSync(c)) || null;
}

export function buildWindowsSandboxLauncher() {
  if (process.platform !== 'win32') {
    return { skipped: true, reason: 'Not running on Windows.' };
  }
  const csc = findCscCompiler();
  if (!csc) {
    throw new Error(
      'Windows .NET C# compiler (csc.exe) not found. Ensure .NET Framework 4.x is installed.'
    );
  }
  execFileSync(csc, ['/nologo', '/optimize+', '/target:exe', `/out:${exePath}`, csPath], {
    stdio: 'pipe',
  });
  return { skipped: false, exePath };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = buildWindowsSandboxLauncher();
  if (res.skipped) {
    console.log('Windows sandbox build skipped:', res.reason);
  } else {
    console.log(`Built Windows Sandbox Launcher: ${res.exePath}`);
  }
}
