// Gate для изменённых мостов: проверяет только те games/*/meta.json,
// что отличаются от базы (быстро — вместо полного обхода).
// Использование в CI: node scripts/verify-changed.mjs --base=origin/main
// Локально: node scripts/verify-changed.mjs --base=HEAD~1 (или main).
// Ноль npm-зависимостей; сеть нужна только для changed-кандидатов.
// FAIL (ненулевой exit) валит CI: мёртвый/безлицензионный мост не мержится.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function changedMetas(base) {
  const out = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', `${base}...HEAD`, '--', 'games/*/meta.json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out.split('\n').map((line) => line.trim()).filter(Boolean);
}

async function toCandidates(files) {
  const candidates = [];
  for (const file of files) {
    const meta = JSON.parse(await readFile(path.join(ROOT, file), 'utf8'));
    if (meta.url) candidates.push({ id: meta.id, url: meta.url, repo: meta.repo, license: meta.license });
  }
  return candidates;
}

function runNode(script, args) {
  execFileSync(process.execPath, [script, ...args], { cwd: ROOT, stdio: 'inherit' });
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const baseArg = process.argv.find((arg) => arg.startsWith('--base='));
  const base = baseArg ? baseArg.slice('--base='.length) : 'origin/main';
  const files = changedMetas(base);
  if (files.length === 0) {
    console.log('verify-changed: no games/*/meta.json changed — nothing to verify');
    process.exit(0);
  }
  const candidates = await toCandidates(files);
  if (candidates.length === 0) {
    console.log('verify-changed: changed metas are native games — network checks skipped');
    process.exit(0);
  }
  const listPath = path.join(tmpdir(), `miniarcade-candidates-${Date.now()}.json`);
  await writeFile(listPath, JSON.stringify(candidates, null, 2), 'utf8');
  console.log(`verify-changed: ${candidates.map((c) => c.id).join(', ')}`);
  runNode(path.join(ROOT, 'scripts', 'verify-candidates.mjs'), [listPath]);
  runNode(path.join(ROOT, 'scripts', 'check-licenses.mjs'), [listPath]);
  console.log('verify-changed: ok');
}
