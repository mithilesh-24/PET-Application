import { pathToFileURL } from 'node:url';
import { detectCompilers } from './compilerDetector.js';

function pad(str, len) {
  return String(str).padEnd(len, ' ');
}

export async function runDoctor() {
  const report = await detectCompilers();
  console.log(`\nPET Prep Compiler & Native OS Sandbox Doctor (${report.platform})`);
  console.log('='.repeat(78));
  console.log(`${pad('Tool', 15)} | ${pad('Status', 10)} | ${pad('Version / Info', 32)} | Path`);
  console.log('-'.repeat(78));

  for (const item of report.tools) {
    const status = item.available ? 'OK' : 'MISSING';
    const info = item.version ? item.version.slice(0, 32) : '-';
    const loc = item.path || '-';
    console.log(`${pad(item.tool, 15)} | ${pad(status, 10)} | ${pad(info, 32)} | ${loc}`);
  }

  console.log('-'.repeat(78));
  console.log(
    `OS Sandbox ready: ${report.sandboxReady ? `YES (${report.sandboxMode})` : `NO (${report.sandboxStatus})`}`
  );
  if (report.sandboxDetails) {
    console.log(`Sandbox details:  ${report.sandboxDetails}`);
  }

  const missing = report.tools.filter((t) => !t.available && t.installHint);
  if (missing.length > 0) {
    console.log('\nInstall / Setup Hints:');
    for (const item of missing) {
      console.log(`  - ${item.tool}: ${item.installHint}`);
    }
  }
  console.log('');
  return report;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runDoctor().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
