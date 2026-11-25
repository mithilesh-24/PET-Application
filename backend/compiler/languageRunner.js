import { AppError } from '../middleware/errorHandler.js';

export const SUPPORTED_LANGUAGES = ['c', 'cpp', 'java', 'python'];
export const MAX_SOURCE_BYTES = 100 * 1024;
export const DEFAULT_TIME_LIMIT_MS = 5000;
export const MAX_TIME_LIMIT_MS = 10000;
export const DEFAULT_MEMORY_LIMIT_MB = 256;
export const MAX_MEMORY_LIMIT_MB = 1024;

export function normaliseOutput(text) {
  if (typeof text !== 'string') return '';
  const lf = text.replace(/\r\n/g, '\n');
  const lines = lf.split('\n').map((line) => line.replace(/[ \t]+$/g, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return lines.join('\n');
}

export function outputsMatch(actual, expected) {
  return normaliseOutput(actual) === normaliseOutput(expected);
}

export function clampLimits({ timeLimitMs, memoryLimitMb } = {}) {
  const effectiveTimeMs = Number.isFinite(timeLimitMs)
    ? Math.max(500, Math.min(MAX_TIME_LIMIT_MS, Math.round(timeLimitMs)))
    : DEFAULT_TIME_LIMIT_MS;

  const effectiveMemoryMb = Number.isFinite(memoryLimitMb)
    ? Math.max(64, Math.min(MAX_MEMORY_LIMIT_MB, Math.round(memoryLimitMb)))
    : DEFAULT_MEMORY_LIMIT_MB;

  return {
    timeLimitMs: effectiveTimeMs,
    memoryLimitMb: effectiveMemoryMb,
  };
}

export function getLanguageSpec(language, { memoryLimitMb = DEFAULT_MEMORY_LIMIT_MB } = {}) {
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    throw new AppError(
      400,
      'VALIDATION_FAILED',
      `Unsupported language "${String(language)}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}.`
    );
  }

  const javaHeapMb = Math.max(48, memoryLimitMb - 48);

  switch (language) {
    case 'c':
      return {
        language: 'c',
        sourceFile: 'main.c',
        compileCmd: ['gcc', '-O2', '-std=c17', '/work/main.c', '-o', '/work/out/main', '-lm'],
        runCmd: ['/work/out/main'],
      };
    case 'cpp':
      return {
        language: 'cpp',
        sourceFile: 'main.cpp',
        compileCmd: ['g++', '-O2', '-std=c++17', '/work/main.cpp', '-o', '/work/out/main'],
        runCmd: ['/work/out/main'],
      };
    case 'java':
      return {
        language: 'java',
        sourceFile: 'Main.java',
        compileCmd: ['javac', '-d', '/work/out', '/work/Main.java'],
        runCmd: ['java', `-Xmx${javaHeapMb}m`, '-cp', '/work/out', 'Main'],
      };
    case 'python':
      return {
        language: 'python',
        sourceFile: 'main.py',
        compileCmd: null,
        runCmd: ['python3', '-u', '/work/main.py'],
      };
    default:
      throw new AppError(400, 'VALIDATION_FAILED', `Unsupported language: ${language}`);
  }
}

export function validateSourceInput(language, source) {
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    throw new AppError(400, 'VALIDATION_FAILED', `Unsupported language "${String(language)}".`);
  }
  if (typeof source !== 'string' || source.trim().length === 0) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Source code cannot be empty.');
  }
  if (Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
    throw new AppError(400, 'VALIDATION_FAILED', 'Source code exceeds the 100 KB limit.');
  }
}
