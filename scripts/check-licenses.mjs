// Проверка лицензий репозиториев-доноров мостов (README § "Мосты":
// лицензия обязана быть свободной и проверенной). Качает LICENSE-файлы
// через raw.githubusercontent.com и классифицирует по маркерам текста.
// Использование: node scripts/check-licenses.mjs candidates.json
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NAMES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md', 'COPYING', 'COPYING.md', 'License.md'];

export function classifyLicense(text = '') {
  const t = String(text);
  if (/MIT License/i.test(t) && /Permission is hereby granted/i.test(t)) return 'MIT';
  if (/Apache License/i.test(t) && /Version 2\.0/i.test(t)) return 'Apache-2.0';
  if (/GNU GENERAL PUBLIC LICENSE/i.test(t)) {
    return /Version 3/i.test(t) ? 'GPL-3.0' : 'GPL-2.0';
  }
  if (/Mozilla Public License/i.test(t)) return /Version 2/i.test(t) ? 'MPL-2.0' : 'MPL';
  if (/CC0 1\.0 Universal/i.test(t)) return 'CC0-1.0';
  if (/The Unlicense/i.test(t)) return 'Unlicense';
  if (/BSD .*?Redistribution and use/i.test(t)) return 'BSD';
  if (/Creative Commons Attribution 4\.0/i.test(t)) return 'CC-BY-4.0';
  return 'UNKNOWN';
}

async function fetchText(url, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'MiniArcade-license-bot/1.0 (+github)' } });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkRepo(repoUrl) {
  const match = String(repoUrl).match(/github\.com\/([^/]+\/[^/]+)/i);
  if (!match) return { repo: repoUrl, license: 'BAD-URL' };
  const slug = match[1].replace(/\/$/, '');
  for (const name of NAMES) {
    const text = await fetchText(`https://raw.githubusercontent.com/${slug}/HEAD/${name}`);
    if (text && text.length > 100) {
      const license = classifyLicense(text);
      if (license !== 'UNKNOWN') return { repo: repoUrl, license, file: name };
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  // Фолбэк: страница репо — ищем ссылку на LICENSE и бейдж.
  const page = await fetchText(`https://github.com/${slug}`);
  if (page) {
    const m = page.match(/\/[^/]+\/[^/"]+\/blob\/[^"']*LICENSE[^"']*/i);
    if (m) {
      const raw = await fetchText(`https://raw.githubusercontent.com${m[0].replace('/blob/', '/')}`);
      if (raw) {
        const license = classifyLicense(raw);
        if (license !== 'UNKNOWN') return { repo: repoUrl, license, file: 'via-page' };
      }
    }
    // package.json с полем license — слабый, но сигнал.
    const pkg = await fetchText(`https://raw.githubusercontent.com/${slug}/HEAD/package.json`);
    if (pkg) {
      const pm = pkg.match(/"license"\s*:\s*"([^"]+)"/);
      if (pm) return { repo: repoUrl, license: `${pm[1]} (package.json claim)`, file: 'package.json' };
    }
  }
  return { repo: repoUrl, license: 'NOT-FOUND' };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const listPath = process.argv[2] || path.join(ROOT, 'candidates.tmp.json');
  const candidates = JSON.parse(await readFile(listPath, 'utf8'));
  for (const c of candidates) {
    const r = await checkRepo(c.repo);
    console.log(`${c.id} | claimed=${c.license} | found=${r.license}${r.file ? ` (${r.file})` : ''}`);
  }
}
