import { execFile } from 'node:child_process';
import os from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const INSTALL_HINTS = {
  gcc: {
    win32:
      'Install MSYS2/MinGW-w64 (winget install BrechtSanders.WinLibs.POSIX.UCRT) or rely on Docker image pet-runner:1.',
    darwin: 'Install Xcode Command Line Tools: xcode-select --install',
    linux: 'sudo apt-get update && sudo apt-get install -y gcc',
  },
  'g++': {
    win32:
      'Install MSYS2/MinGW-w64 (winget install BrechtSanders.WinLibs.POSIX.UCRT) or rely on Docker image pet-runner:1.',
    darwin: 'Install Xcode Command Line Tools: xcode-select --install',
    linux: 'sudo apt-get update && sudo apt-get install -y g++',
  },
  javac: {
    win32: 'Install OpenJDK 17+ (winget install EclipseAdoptium.Temurin.17.JDK).',
    darwin: 'brew install openjdk@17',
    linux: 'sudo apt-get update && sudo apt-get install -y openjdk-17-jdk',
  },
  java: {
    win32: 'Install OpenJDK 17+ (winget install EclipseAdoptium.Temurin.17.JDK).',
    darwin: 'brew install openjdk@17',
    linux: 'sudo apt-get update && sudo apt-get install -y openjdk-17-jre',
  },
  python: {
    win32: 'Install Python 3 (winget install Python.Python.3.12).',
    darwin: 'brew install python@3',
    linux: 'sudo apt-get update && sudo apt-get install -y python3',
  },
  docker: {
    win32:
      'Install and start Docker Desktop for Windows: https://docs.docker.com/desktop/install/windows-install/',
    darwin:
      'Install and start Docker Desktop for Mac: https://docs.docker.com/desktop/install/mac-install/',
    linux:
      'Install Docker Engine and start the docker service: https://docs.docker.com/engine/install/',
  },
  'pet-runner:1': {
    win32: 'Run: npm run setup:docker (after Docker Desktop is running).',
    darwin: 'Run: npm run setup:docker (after Docker Desktop is running).',
    linux: 'Run: npm run setup:docker',
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
    const resolvedPath = await resolveExecutablePath(cmd, platform);
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

async function probeDocker(platform = process.platform) {
  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['version', '--format', '{{.Server.Version}}'],
      { timeout: 5000 }
    );
    const version = stdout.trim() || 'available';
    const resolvedPath = await resolveExecutablePath('docker', platform);
    return {
      tool: 'docker',
      available: true,
      version: `Docker Engine ${version}`,
      path: resolvedPath || 'docker',
      installHint: null,
    };
  } catch {
    return {
      tool: 'docker',
      available: false,
      version: null,
      path: await resolveExecutablePath('docker', platform),
      installHint: getHint('docker', platform),
    };
  }
}

async function probeRunnerImage(dockerAvailable, platform = process.platform) {
  if (!dockerAvailable) {
    return {
      tool: 'pet-runner:1',
      available: false,
      version: null,
      path: null,
      installHint: getHint('pet-runner:1', platform),
    };
  }

  try {
    const { stdout } = await execFileAsync(
      'docker',
      ['image', 'inspect', 'pet-runner:1', '--format', '{{.Id}}'],
      {
        timeout: 5000,
      }
    );
    const imageId = stdout.trim();
    return {
      tool: 'pet-runner:1',
      available: Boolean(imageId),
      version: imageId ? imageId.slice(0, 19) : null,
      path: 'docker://pet-runner:1',
      installHint: imageId ? null : getHint('pet-runner:1', platform),
    };
  } catch {
    return {
      tool: 'pet-runner:1',
      available: false,
      version: null,
      path: null,
      installHint: getHint('pet-runner:1', platform),
    };
  }
}

export async function detectCompilers(platform = os.platform()) {
  const pythonCmd = platform === 'win32' ? 'python' : 'python3';

  const [gcc, gpp, javac, java, python, docker] = await Promise.all([
    probeTool({ tool: 'gcc', cmd: 'gcc', args: ['--version'], platform }),
    probeTool({ tool: 'g++', cmd: 'g++', args: ['--version'], platform }),
    probeTool({ tool: 'javac', cmd: 'javac', args: ['-version'], platform }),
    probeTool({ tool: 'java', cmd: 'java', args: ['-version'], platform }),
    probeTool({ tool: 'python', cmd: pythonCmd, args: ['--version'], platform }),
    probeDocker(platform),
  ]);

  const runnerImage = await probeRunnerImage(docker.available, platform);

  return {
    platform,
    dockerReady: docker.available && runnerImage.available,
    tools: [gcc, gpp, javac, java, python, docker, runnerImage],
  };
}
