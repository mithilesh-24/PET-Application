import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const [major] = process.versions.node.split('.').map(Number);
if (major < 20) {
  console.error(`Node.js >= 20 is required. Current version: ${process.version}`);
  process.exit(1);
}
console.log(`Node.js ${process.version} OK`);

console.log('Checking/installing workspace dependencies...');
execSync('npm install', { cwd: rootDir, stdio: 'inherit' });

const doctorPath = path.join(rootDir, 'backend', 'compiler', 'doctor.js');
if (existsSync(doctorPath)) {
  console.log('Running compiler & Docker doctor...');
  execSync(`node "${doctorPath}"`, { cwd: rootDir, stdio: 'inherit' });
} else {
  console.log('Compiler doctor not installed yet (added in M8).');
}
