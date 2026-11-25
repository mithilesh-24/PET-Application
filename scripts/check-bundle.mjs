import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERATION_PROMPT } from '../frontend/src/services/promptService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultAssetsDir = path.resolve(__dirname, '..', 'frontend', 'dist', 'assets');

const FORBIDDEN_ALWAYS = [
  /BEGIN [A-Z ]*PRIVATE KEY/,
  /AES-256-GCM_MASTER_KEY/,
  /KEYCHAIN_SERVICE/,
  /pet-prep-master-secret/i,
  /\.pet-prep[\\/]keys/i,
];

const FORBIDDEN_OUTSIDE_REVIEW = ['answerIndex', 'expectedOutput'];

function stripVerbatimPromptText(content) {
  const escapedDouble = JSON.stringify(GENERATION_PROMPT).slice(1, -1);
  const templateEscaped = GENERATION_PROMPT.replace(/\\/g, '\\\\').replace(/`/g, '\\`');
  return content
    .split(GENERATION_PROMPT)
    .join('')
    .split(escapedDouble)
    .join('')
    .split(templateEscaped)
    .join('');
}

export async function verifyFrontendBundle(assetsDir = defaultAssetsDir) {
  const entries = await fs.readdir(assetsDir, { withFileTypes: true });
  const jsFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => e.name);

  if (jsFiles.length === 0) {
    throw new Error(`No JS assets found in ${assetsDir}. Run "npm run build" first.`);
  }

  const violations = [];

  for (const name of jsFiles) {
    const content = await fs.readFile(path.join(assetsDir, name), 'utf8');

    for (const pattern of FORBIDDEN_ALWAYS) {
      if (pattern.test(content)) {
        violations.push({ file: name, token: pattern.source, reason: 'Forbidden key/secret string' });
      }
    }

    const isReviewChunk = /^Results-[A-Za-z0-9_-]+\.js$/.test(name);
    if (!isReviewChunk) {
      const sanitized = stripVerbatimPromptText(content);
      for (const token of FORBIDDEN_OUTSIDE_REVIEW) {
        if (sanitized.includes(token)) {
          violations.push({
            file: name,
            token,
            reason: `Forbidden field name "${token}" found outside the review page bundle`,
          });
        }
      }
    }
  }

  return {
    checkedFiles: jsFiles.length,
    violations,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = await verifyFrontendBundle();
  if (res.violations.length > 0) {
    console.error('Frontend bundle security check FAILED:', res.violations);
    process.exit(1);
  }
  console.log(`Frontend bundle security check PASSED (${res.checkedFiles} JS assets scanned).`);
}
