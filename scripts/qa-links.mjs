// QA-бот целостности ссылок: проверяет внутренний файловый граф
// (каталог → игры, sitemap → файлы, страницы → ассеты), не дублируя
// build.mjs (валидация meta) и headers-тесты (CSP-allowlist).
// Без сети: только локальные файлы. FAIL валит `npm run qa`.
//
// Запуск: node scripts/qa-links.mjs
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL_BASE = 'https://junior1c.github.io/miniarcade';

export function extractLocalHrefs(html) {
  const hrefs = [];
  const pattern = /(?:href|src)="([^"]+)"/g;
  let match = null;
  while ((match = pattern.exec(html)) !== null) {
    const url = match[1];
    if (!url || url.startsWith('#') || url.startsWith('about:')) continue;
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) continue; // Внешние схемы — не наша зона.
    hrefs.push(url.split('#')[0].split('?')[0]);
  }
  return [...new Set(hrefs)];
}

export function sitemapToFiles(xml) {
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  return locs.map((loc) => {
    if (!loc.startsWith(CANONICAL_BASE)) return { loc, file: null, external: true };
    const rest = loc.slice(CANONICAL_BASE.length).replace(/^\//, '');
    if (rest === '') return { loc, file: 'index.html', external: false };
    if (rest.endsWith('/')) return { loc, file: path.posix.join(rest, 'index.html'), external: false };
    return { loc, file: rest, external: false };
  });
}

async function exists(rootDir, rel) {
  try {
    await stat(path.join(rootDir, rel));
    return true;
  } catch {
    return false;
  }
}

export async function auditLinks(rootDir = ROOT) {
  const fails = [];
  const catalog = JSON.parse(await readFile(path.join(rootDir, 'data', 'catalog.json'), 'utf8'));
  for (const game of catalog.games ?? []) {
    if (game.file && !(await exists(rootDir, game.file))) {
      fails.push(`catalog ссылается на ${game.file}, файла нет`);
    }
  }
  for (const page of ['index.html', 'stats.html']) {
    let html = null;
    try {
      html = await readFile(path.join(rootDir, page), 'utf8');
    } catch {
      fails.push(`нет ${page}`);
      continue;
    }
    for (const href of extractLocalHrefs(html)) {
      if (!(await exists(rootDir, href))) fails.push(`${page} ссылается на ${href}, файла нет`);
    }
  }
  let xml = null;
  try {
    xml = await readFile(path.join(rootDir, 'sitemap.xml'), 'utf8');
  } catch {
    fails.push('нет sitemap.xml');
  }
  if (xml) {
    for (const { loc, file, external } of sitemapToFiles(xml)) {
      if (external) fails.push(`sitemap отдаёт чужой URL поисковикам: ${loc}`);
      else if (!(await exists(rootDir, file))) fails.push(`sitemap ссылается на ${loc}, файла ${file} нет`);
    }
  }
  for (const required of ['robots.txt', 'assets/og.png', 'assets/favicon.svg']) {
    if (!(await exists(rootDir, required))) fails.push(`нет ${required}`);
  }
  const robots = await readFile(path.join(rootDir, 'robots.txt'), 'utf8').catch(() => '');
  if (!robots.includes('Sitemap:')) fails.push('robots.txt без Sitemap-директивы');
  return { fails };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const { fails } = await auditLinks(ROOT);
  if (fails.length > 0) {
    for (const line of fails) console.error(`FAIL ${line}`);
    console.error(`\nqa-links: ${fails.length} problem(s)`);
    process.exitCode = 1;
  } else {
    console.log('qa-links: ok');
  }
}
