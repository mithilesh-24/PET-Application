import path from 'node:path';
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

export function clampLimits({
  timeLimitMs,
  memoryLimitMb,
  defaultTimeLimitMs = DEFAULT_TIME_LIMIT_MS,
  defaultMemoryLimitMb = DEFAULT_MEMORY_LIMIT_MB,
} = {}) {
  const effectiveTimeMs = Number.isFinite(timeLimitMs)
    ? Math.max(500, Math.min(MAX_TIME_LIMIT_MS, Math.round(timeLimitMs)))
    : Math.max(500, Math.min(MAX_TIME_LIMIT_MS, defaultTimeLimitMs));

  const effectiveMemoryMb = Number.isFinite(memoryLimitMb)
    ? Math.max(64, Math.min(MAX_MEMORY_LIMIT_MB, Math.round(memoryLimitMb)))
    : Math.max(64, Math.min(MAX_MEMORY_LIMIT_MB, defaultMemoryLimitMb));

  return {
    timeLimitMs: effectiveTimeMs,
    memoryLimitMb: effectiveMemoryMb,
  };
}

/**
 * Derive/normalize Java public class entry point so source always compiles cleanly to Main.java / Main.class.
 */
export function prepareJavaSource(source) {
  const publicClassMatch = source.match(/\bpublic\s+class\s+([A-Za-z_$][A-Za-z0-9_$]*)/);
  if (publicClassMatch && publicClassMatch[1] !== 'Main') {
    const className = publicClassMatch[1];
    const updated = source
      .replace(/\bpublic\s+class\s+[A-Za-z_$][A-Za-z0-9_$]*/, 'public class Main')
      .replace(new RegExp(`\\bnew\\s+${className}\\s*\\(`, 'g'), 'new Main(');
    return {
      source: updated,
      sourceFile: 'Main.java',
      mainClass: 'Main',
    };
  }
  return {
    source,
    sourceFile: 'Main.java',
    mainClass: 'Main',
  };
}

export function getLanguageRunner(
  language,
  {
    memoryLimitMb = DEFAULT_MEMORY_LIMIT_MB,
    workDir,
    toolchainPaths = {},
    platform = process.platform,
    useStaticCpp = false,
    cStd = 'c17',
    cppStd = 'c++17',
  } = {}
) {
  if (!SUPPORTED_LANGUAGES.includes(language)) {
    throw new AppError(
      400,
      'VALIDATION_FAILED',
      `Unsupported language "${String(language)}". Supported: ${SUPPORTED_LANGUAGES.join(', ')}.`
    );
  }

  const rootDir = workDir || '.';
  const outDir = path.join(rootDir, 'out');
  const exeName = platform === 'win32' ? 'main.exe' : 'main';
  const compiledBinary = path.join(outDir, exeName);
  const javaHeapMb = Math.max(48, Math.min(memoryLimitMb - 64, Math.round(memoryLimitMb * 0.65)));

  const gccBin = toolchainPaths.gcc || 'gcc';
  const gppBin = toolchainPaths.gpp || 'g++';
  const javacBin = toolchainPaths.javac || 'javac';
  const javaBin = toolchainPaths.java || 'java';
  const pythonBin = toolchainPaths.python || (platform === 'win32' ? 'python' : 'python3');

  switch (language) {
    case 'c': {
      const sourceFile = 'main.c';
      const sourcePath = path.join(rootDir, sourceFile);
      const flags = ['-O2', `-std=${cStd}`];
      if (useStaticCpp && platform === 'win32') {
        flags.push('-static-libgcc');
      }
      return {
        language: 'c',
        sourceFile,
        sourcePath,
        outDir,
        preparedSource: (src) => src,
        compileCmd: [gccBin, ...flags, sourcePath, '-o', compiledBinary, '-lm'],
        runCmd: [compiledBinary],
      };
    }
    case 'cpp': {
      const sourceFile = 'main.cpp';
      const sourcePath = path.join(rootDir, sourceFile);
      const flags = ['-O2', `-std=${cppStd}`];
      if (useStaticCpp && platform === 'win32') {
        flags.push('-static-libgcc', '-static-libstdc++');
      }
      return {
        language: 'cpp',
        sourceFile,
        sourcePath,
        outDir,
        preparedSource: (src) => src,
        compileCmd: [gppBin, ...flags, sourcePath, '-o', compiledBinary],
        runCmd: [compiledBinary],
      };
    }
    case 'java': {
      const sourceFile = 'Main.java';
      const sourcePath = path.join(rootDir, sourceFile);
      return {
        language: 'java',
        sourceFile,
        sourcePath,
        outDir,
        preparedSource: (src) => prepareJavaSource(src).source,
        compileCmd: [javacBin, '-J-Xmx256m', '-d', outDir, sourcePath],
        runCmd: [
          javaBin,
          `-Xmx${javaHeapMb}m`,
          '-Xss512k',
          '-XX:+UseSerialGC',
          '-XX:TieredStopAtLevel=1',
          '-cp',
          outDir,
          'Main',
        ],
      };
    }
    case 'python': {
      const sourceFile = 'main.py';
      const sourcePath = path.join(rootDir, sourceFile);
      return {
        language: 'python',
        sourceFile,
        sourcePath,
        outDir,
        preparedSource: (src) => src,
        compileCmd: null,
        runCmd: [pythonBin, '-I', '-B', '-u', sourcePath],
      };
    }
    default:
      throw new AppError(400, 'VALIDATION_FAILED', `Unsupported language: ${language}`);
  }
}

// Legacy alias kept for unit tests importing getLanguageSpec
export function getLanguageSpec(language, options = {}) {
  return getLanguageRunner(language, options);
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
