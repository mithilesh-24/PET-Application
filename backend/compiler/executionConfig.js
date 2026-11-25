import os from 'node:os';
import path from 'node:path';
import { config } from '../config.js';

function parseBoundedInt(env, name, fallback, { min, max }) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(
      `Invalid configuration for ${name}="${raw}". Expected an integer between ${min} and ${max}.`
    );
  }
  return parsed;
}

function parseBooleanFlag(env, name, fallback = false) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const lower = String(raw).trim().toLowerCase();
  if (lower === 'true' || lower === '1') return true;
  if (lower === 'false' || lower === '0') return false;
  throw new Error(
    `Invalid configuration for ${name}="${raw}". Expected "true" or "false".`
  );
}

function resolveOptionalToolOverride(env, name) {
  const raw = env[name];
  if (raw === undefined || raw === '') return null;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed.includes('\0')) {
    throw new Error(`Invalid configuration for ${name}: path must be a non-empty string.`);
  }
  return trimmed;
}

export function loadExecutionConfig(env = process.env) {
  const timeoutSeconds = parseBoundedInt(env, 'EXEC_TIMEOUT_SECONDS', 5, { min: 5, max: 10 });
  const compileTimeoutSeconds = parseBoundedInt(env, 'EXEC_COMPILE_TIMEOUT_SECONDS', 15, {
    min: 5,
    max: 60,
  });
  const memoryLimitMb = parseBoundedInt(env, 'EXEC_MEMORY_LIMIT_MB', 256, {
    min: 64,
    max: 2048,
  });
  const maxOutputKb = parseBoundedInt(env, 'EXEC_MAX_OUTPUT_KB', 1024, {
    min: 16,
    max: 16384,
  });
  const maxProcesses = parseBoundedInt(env, 'EXEC_MAX_PROCESSES', 64, {
    min: 8,
    max: 512,
  });
  const maxFileSizeKb = parseBoundedInt(env, 'EXEC_MAX_FILE_SIZE_KB', 8192, {
    min: 64,
    max: 262144,
  });
  const maxConcurrent = parseBoundedInt(
    env,
    'EXEC_MAX_CONCURRENT',
    Math.max(2, Math.min(8, os.cpus()?.length || 4)),
    { min: 1, max: 64 }
  );

  const baseDirRaw = env.EXEC_WORKSPACE_BASE_DIR;
  const workspaceBaseDir = baseDirRaw
    ? path.resolve(baseDirRaw)
    : config.paths.tempExecDir;

  const runnerUser =
    env.EXEC_RUNNER_USER && env.EXEC_RUNNER_USER.trim()
      ? env.EXEC_RUNNER_USER.trim()
      : 'pet-runner';

  if (!/^[a-zA-Z0-9._\\-]{1,64}$/.test(runnerUser)) {
    throw new Error(
      `Invalid configuration for EXEC_RUNNER_USER="${runnerUser}". Only alphanumeric, ".", "_", "\\", "-" characters are allowed.`
    );
  }

  const allowInsecureExecution = parseBooleanFlag(env, 'PET_ALLOW_INSECURE_EXECUTION', false);

  return {
    timeoutSeconds,
    timeoutMs: timeoutSeconds * 1000,
    compileTimeoutSeconds,
    compileTimeoutMs: compileTimeoutSeconds * 1000,
    memoryLimitMb,
    maxOutputKb,
    maxOutputBytes: maxOutputKb * 1024,
    maxProcesses,
    maxFileSizeKb,
    maxConcurrent,
    workspaceBaseDir,
    runnerUser,
    allowInsecureExecution,
    toolchains: {
      gcc: resolveOptionalToolOverride(env, 'GCC_PATH'),
      gpp: resolveOptionalToolOverride(env, 'GPP_PATH'),
      javac: resolveOptionalToolOverride(env, 'JAVAC_PATH'),
      java: resolveOptionalToolOverride(env, 'JAVA_PATH'),
      python: resolveOptionalToolOverride(env, 'PYTHON_PATH'),
    },
  };
}
