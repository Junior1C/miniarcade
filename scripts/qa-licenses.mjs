// QA-бот лицензий мостов (офлайн): проверяет поля meta.json, а не сеть.
// Сеть (LICENSE-файлы доноров) проверяет ручной scripts/check-licenses.mjs
// перед добавлением моста; здесь — контракт репозитория:
// каждый мост обязан нести author + license из allowlist + https-url.
// FAIL валит `npm run qa` (лицензия — юридический риск, а не аптайм).
// WARN — copyleft (GPL): код к нам не едет, но нужна атрибуция ссылкой.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Свободные лицензии из README § "Мосты". Copyleft — отдельно в WARN.
// Алиасы нормализуем: BSD-3-Clause→BSD-семья, CC0→CC0-1.0, голый GPL→copyleft.
const PERMISSIVE = new Set([
  'MIT',
  'BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  'Unlicense',
  'CC0-1.0',
  'CC0',
  'CC-BY-4.0',
  'MPL-2.0',
  'MPL',
  'ISC',
]);
const COPYLEFT = new Set(['GPL', 'GPL-2.0', 'GPL-3.0', 'AGPL', 'AGPL-3.0', 'LGPL', 'LGPL-2.1', 'LGPL-3.0']);

export function auditBridgeLicense(meta) {
  if (!meta.url) return { status: 'skip' };
  if (typeof meta.url !== 'string' || !meta.url.startsWith('https://')) {
    return { status: 'fail', message: `${meta.id}: url обязан быть https` };
  }
  if (typeof meta.author !== 'string' || !meta.author.trim()) {
    return { status: 'fail', message: `${meta.id}: нет author (атрибуция обязательна)` };
  }
  const license = String(meta.license || '').trim();
  if (!license || license === 'UNKNOWN' || license === 'NOT-FOUND' || license === 'BAD-URL') {
    return { status: 'fail', message: `${meta.id}: нет проверенной license (прогоните check-licenses.mjs)` };
  }
  const base = license.split(' ')[0];
  if (COPYLEFT.has(base)) {
    return { status: 'warn', message: `${meta.id}: copyleft ${license} — только ссылкой с атрибуцией, код не вендорить` };
  }
  if (!PERMISSIVE.has(base)) {
    return { status: 'fail', message: `${meta.id}: неизвестная лицензия "${license}"` };
  }
  return { status: 'ok' };
}

export async function auditLicenses(rootDir = ROOT) {
  const gamesDir = path.join(rootDir, 'games');
  const entries = await readdir(gamesDir, { withFileTypes: true });
  const fails = [];
  const warns = [];
  let bridges = 0;
  for (const entry of entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'))) {
    const meta = JSON.parse(await readFile(path.join(gamesDir, entry.name, 'meta.json'), 'utf8'));
    const result = auditBridgeLicense(meta);
    if (result.status === 'skip') continue;
    bridges += 1;
    if (result.status === 'fail') fails.push(result.message);
    if (result.status === 'warn') warns.push(result.message);
  }
  return { bridges, fails, warns };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const { bridges, fails, warns } = await auditLicenses(ROOT);
  for (const message of warns) console.log(`WARN ${message}`);
  for (const message of fails) console.log(`FAIL ${message}`);
  console.log(`qa-licenses: ${bridges - fails.length - warns.length}/${bridges} ok`);
  if (fails.length > 0) process.exitCode = 1;
}
