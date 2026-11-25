import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';
import { loadExecutionConfig } from './executionConfig.js';
import { resolveActiveSandbox } from './sandbox/sandboxDriver.js';

const execFileAsync = promisify(execFile);

const INSTALL_HINTS = {
  gcc: {
    win32:
      'Install MinGW-w64 / WinLibs GCC: winget install BrechtSanders.WinLibs.POSIX.UCRT (or MSYS2 pacman -S mingw-w64-ucrt-x86_64-gcc).',
    darwin: 'Install Xcode Command Line Tools: xcode-select --install',
    linux: 'sudo apt-get update && sudo apt-get install -y gcc',
  },
  'g++': {
    win32:
      'Install MinGW-w64 / WinLibs G++: winget install BrechtSanders.WinLibs.POSIX.UCRT (or MSYS2 pacman -S mingw-w64-ucrt-x86_64-gcc).',
    darwin: 'Install Xcode Command Line Tools: xcode-select --install',
    linux: 'sudo apt-get update && sudo apt-get install -y g++',
  },
  javac: {
    win32: 'Install OpenJDK 17+ JDK: winget install EclipseAdoptium.Temurin.17.JDK',
    darwin: 'brew install openjdk@17',
    linux: 'sudo apt-get update && sudo apt-get install -y openjdk-17-jdk',
  },
  java: {
    win32: 'Install OpenJDK 17+ JDK/JRE: winget install EclipseAdoptium.Temurin.17.JDK',
    darwin: 'brew install openjdk@17',
    linux: 'sudo apt-get update && sudo apt-get install -y openjdk-17-jre',
  },
  python: {
    win32: 'Install Python 3: winget install Python.Python.3.12',
    darwin: 'brew install python@3',
    linux: 'sudo apt-get update && sudo apt-get install -y python3',
  },
};

function getHint(tool, platform = process.platform) {
  const map = INSTALL_HINTS[tool] || {};
  return map[platform] || map.linux || 'Install the tool and ensure it is on PATH.';
}

async function resolveExecutablePath(cmd, platform = process.platform) {
  const locator = platform === 'win32' ? 'where' : 'which';
  try {
    const { stdout } = await execFileAsync(locator, [cmd], { timeout: 3000 });
    const first = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return first || null;
  } catch {
    return null;
  }
}

async function probeTool({ tool, cmd, args, platform = process.platform }) {
  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, { timeout: 5000 });
    const combined = `${stdout || ''}\n${stderr || ''}`.trim();
    const firstLine =
      combined
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find(Boolean) || 'available';
    const resolvedPath =
      cmd.includes('/') || cmd.includes('\\') ? cmd : await resolveExecutablePath(cmd, platform);
    return {
      tool,
      available: true,
      version: firstLine,
      path: resolvedPath || cmd,
      installHint: null,
    };
  } catch {
    return {
      tool,
      available: false,
      version: null,
      path: null,
      installHint: getHint(tool, platform),
    };
  }
}

export async function detectCompilers(platform = os.platform(), execConfig = loadExecutionConfig()) {
  const pythonCmd = execConfig.toolchains.python || (platform === 'win32' ? 'python' : 'python3');

  const [gcc, gpp, javac, java, python, sandbox] = await Promise.all([
    probeTool({ tool: 'gcc', cmd: execConfig.toolchains.gcc || 'gcc', args: ['--version'], platform }),
    probeTool({ tool: 'g++', cmd: execConfig.toolchains.gpp || 'g++', args: ['--version'], platform }),
    probeTool({ tool: 'javac', cmd: execConfig.toolchains.javac || 'javac', args: ['-version'], platform }),
    probeTool({ tool: 'java', cmd: execConfig.toolchains.java || 'java', args: ['-version'], platform }),
    probeTool({ tool: 'python', cmd: pythonCmd, args: ['--version'], platform }),
    resolveActiveSandbox({
      platform,
      runnerUser: execConfig.runnerUser,
      allowInsecureExecution: execConfig.allowInsecureExecution,
    }),
  ]);

  const sandboxTool = {
    tool: 'sandbox',
    available: sandbox.status === 'ready' || sandbox.status === 'insecure-dev',
    version: sandbox.capabilities.mode || sandbox.status,
    path: sandbox.capabilities.launcherPath || sandbox.capabilities.driver || platform,
    installHint:
      sandbox.status === 'ready'
        ? null
        : sandbox.capabilities.installHints?.[platform] ||
          sandbox.capabilities.details ||
          'Configure host OS sandbox prerequisites.',
  };

  const sandboxReady = sandbox.status === 'ready';
  const allCompilersAvailable =
    gcc.available && gpp.available && javac.available && java.available && python.available;

  return {
    platform,
    ready: sandboxReady && allCompilersAvailable,
    sandboxReady,
    sandboxStatus: sandbox.status,
    sandboxMode: sandbox.capabilities.mode,
    sandboxDriver: sandbox.capabilities.driver,
    sandboxDetails: sandbox.capabilities.details,
    tools: [gcc, gpp, javac, java, python, sandboxTool],
  };
}
