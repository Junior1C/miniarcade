import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const STAGE = path.join(DIST, '.stage');

function runPowerShell(command) {
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `powershell exited with ${result.status}`);
  }
}

function quotePs(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function createZip(stageDir, zipPath) {
  if (process.platform === 'win32') {
    runPowerShell(
      `Compress-Archive -Path (Join-Path ${quotePs(stageDir)} '*') -DestinationPath ${quotePs(zipPath)} -Force`,
    );
    return;
  }
  const result = spawnSync('zip', ['-r', zipPath, '.'], { cwd: stageDir, stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error('zip CLI is required on this platform');
  }
}

async function stageGame(folder) {
  const stage = path.join(STAGE, 'games', folder);
  await mkdir(stage, { recursive: true });

  const source = path.join(ROOT, 'games', folder);
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'meta.json') continue;
    await cp(path.join(source, entry.name), path.join(stage, entry.name));
  }

  const zipPath = path.join(DIST, `${folder}-itch.zip`);
  createZip(stage, zipPath);
  console.log(`dist/${path.basename(zipPath)}`);
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  const gamesDir = path.join(ROOT, 'games');
  const entries = await readdir(gamesDir, { withFileTypes: true });
  const folders = entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort();

  for (const folder of folders) {
    await stageGame(folder);
  }

  await rm(STAGE, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
