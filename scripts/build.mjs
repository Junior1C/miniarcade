import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SANDBOX_TOKENS } from '../assets/js/sandbox-tokens.js';
import { CSP_META, FRAME_SRC_ORIGINS } from './security-headers.mjs';

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CANONICAL_BASE = 'https://junior1c.github.io/miniarcade';
const META_KEYS = new Set([
  'id',
  'title',
  'emoji',
  'description',
  'tags',
  'controls',
  'sandbox',
  'order',
  // Мост к внешней игре (код не копируется): url + атрибуция обязательны.
  'url',
  'author',
  'license',
  'repo',
]);
const SANDBOX_ALLOWLIST = new Set(SANDBOX_TOKENS);

function requireString(meta, key, errors) {
  const value = meta[key];
  if (typeof value !== 'string' || value.trim() === '') {
    errors.push(`"${key}" must be a non-empty string`);
    return null;
  }
  return value;
}

function validateTags(meta, errors) {
  if (meta.tags === undefined) return [];
  if (!Array.isArray(meta.tags) || meta.tags.some((tag) => typeof tag !== 'string' || !tag.trim())) {
    errors.push('"tags" must be an array of non-empty strings');
    return [];
  }
  return meta.tags;
}

function validateSandbox(meta, errors) {
  if (meta.sandbox === undefined) return null;
  if (!Array.isArray(meta.sandbox)) {
    errors.push('"sandbox" must be an array of tokens');
    return null;
  }
  for (const token of meta.sandbox) {
    if (typeof token !== 'string' || !SANDBOX_ALLOWLIST.has(token)) {
      errors.push(`"sandbox" contains a disallowed token: ${JSON.stringify(token)}`);
      return null;
    }
  }
  return meta.sandbox;
}

function validateBridgeUrl(meta, errors) {
  if (meta.url === undefined) return null;
  let parsed = null;
  try {
    parsed = new URL(meta.url);
  } catch {
    parsed = null;
  }
  if (!parsed || parsed.protocol !== 'https:') {
    errors.push('"url" must be an https URL');
    return null;
  }
  if (!FRAME_SRC_ORIGINS.includes(parsed.origin)) {
    errors.push(`"url" origin ${parsed.origin} is not in FRAME_SRC_ORIGINS (scripts/security-headers.mjs)`);
    return null;
  }
  for (const key of ['author', 'license']) {
    const value = meta[key];
    if (typeof value !== 'string' || value.trim() === '') {
      errors.push(`"${key}" is required for bridge entries (attribution)`);
    }
  }
  // repo необязателен: у проприетарных free-to-play игр его нет.
  // Если есть — только https (ссылка «исходник» в плеере).
  if (meta.repo !== undefined) {
    if (typeof meta.repo !== 'string' || meta.repo.trim() === '') {
      errors.push('"repo" must be a non-empty https URL or omitted');
    } else {
      try {
        const repo = new URL(meta.repo);
        if (repo.protocol !== 'https:') errors.push('"repo" must be an https URL');
      } catch {
        errors.push('"repo" must be an https URL');
      }
    }
  }
  return meta.url;
}

function validateOrder(meta, errors) {
  if (meta.order === undefined) return 0;
  if (typeof meta.order !== 'number' || !Number.isFinite(meta.order)) {
    errors.push('"order" must be a finite number');
    return 0;
  }
  return meta.order;
}

async function readGame(gamesDir, folder) {
  const errors = [];
  if (!ID_PATTERN.test(folder)) {
    errors.push('folder name must be a kebab-case id');
  }

  let meta;
  try {
    meta = JSON.parse(await readFile(path.join(gamesDir, folder, 'meta.json'), 'utf8'));
  } catch (error) {
    errors.push(`meta.json is missing or invalid JSON (${error.message})`);
    meta = {};
  }

  for (const key of Object.keys(meta)) {
    if (!META_KEYS.has(key)) {
      errors.push(`unknown key "${key}"`);
    }
  }

  if (meta.id !== folder) {
    errors.push(`"id" (${JSON.stringify(meta.id)}) must match folder name "${folder}"`);
  }

  const title = requireString(meta, 'title', errors);
  const emoji = requireString(meta, 'emoji', errors);
  const description = requireString(meta, 'description', errors);
  const tags = validateTags(meta, errors);
  const sandbox = validateSandbox(meta, errors);
  const order = validateOrder(meta, errors);
  const url = validateBridgeUrl(meta, errors);

  if (typeof meta.controls === 'string') {
    // optional, no validation beyond type
  } else if (meta.controls !== undefined) {
    errors.push('"controls" must be a string');
  }

  if (!url) {
    try {
      await stat(path.join(gamesDir, folder, 'index.html'));
    } catch {
      errors.push('index.html is missing');
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  const game = {
    id: folder,
    title,
    emoji,
    description,
    tags,
    order,
  };
  if (url) {
    // Мост: локального файла нет — плеер откроет внешний URL в том же sandbox.
    game.url = url;
    game.author = meta.author;
    game.license = meta.license;
    if (meta.repo !== undefined) game.repo = meta.repo;
  } else {
    game.file = `games/${folder}/index.html`;
  }
  if (typeof meta.controls === 'string') game.controls = meta.controls;
  if (sandbox && sandbox.length > 0) game.sandbox = sandbox;
  // Превью карточки: games/<id>/thumb.webp (генерирует gen-thumbs.mjs,
  // мосты и игры без превью показывают эмодзи). Проверяется qa-links.
  try {
    await stat(path.join(gamesDir, folder, 'thumb.webp'));
    game.thumb = `games/${folder}/thumb.webp`;
  } catch {
    // Превью нет — штатно, карточка покажет эмодзи.
  }
  return game;
}

function compareGames(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  return a.title.localeCompare(b.title, 'ru');
}

const LD_START = '  <!-- LD-JSON-START -->';
const LD_END = '  <!-- LD-JSON-END -->';

const CSP_PLACEHOLDER = '<!-- CSP-META -->';
const CSP_META_PATTERN = /<meta http-equiv="Content-Security-Policy" content="[^"]*">/;

// CSP meta-тег для GitHub Pages (там нет HTTP-заголовков):
// единый источник — scripts/security-headers.mjs (CSP_META —
// prod-политика без frame-ancestors: в <meta> спека его игнорирует).
// Никаких копипаст. Идемпотентно: повторный build даёт байт-в-байт тот же файл.
export function buildCspMeta() {
  return `<meta http-equiv="Content-Security-Policy" content="${CSP_META}">`;
}

async function syncFileCsp(filePath, { allowPlaceholder }) {
  let html;
  try {
    html = await readFile(filePath, 'utf8');
  } catch {
    // Фикстуры unit-тестов (только games/) — пропускаем.
    return;
  }
  const tag = buildCspMeta();
  let next = html;
  if (CSP_META_PATTERN.test(next)) {
    next = next.replace(CSP_META_PATTERN, () => tag);
  } else if (allowPlaceholder && next.includes(CSP_PLACEHOLDER)) {
    next = next.replace(CSP_PLACEHOLDER, () => tag);
  } else {
    // Минимальные фикстуры LD-JSON-тестов без CSP — пропускаем:
    // реальные index.html/stats.html проверяет tests/headers.test.mjs.
    return;
  }
  next = normalizeEol(next, detectEol(html));
  if (next !== html) await writeFile(filePath, next, 'utf8');
}

async function syncCspMeta(rootDir) {
  await syncFileCsp(path.join(rootDir, 'index.html'), { allowPlaceholder: false });
  await syncFileCsp(path.join(rootDir, 'stats.html'), { allowPlaceholder: true });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Сборка обязана сохранять окончания строк файла: часть файлов репо — CRLF,
// а вшиваемые блоки мы строим с \n. Без нормализации index.html превращается
// в mixed-EOL (патч-опасность, шум в диффах) — ловит scripts/qa-repo.mjs.
function detectEol(html) {
  const crlf = (html.match(/\r\n/g) || []).length;
  const lf = (html.match(/(^|[^\r])\n/g) || []).length;
  return crlf > lf ? '\r\n' : '\n';
}

function normalizeEol(text, eol) {
  return text.replace(/\r\n/g, '\n').replace(/\n/g, eol);
}

// Структурированные данные для поисковиков (schema.org): ноль runtime-цены,
// только SEO. application/ld+json — data-блок, CSP script-src его не режет.
// Компактная форма (без отступов): блок растёт с числом игр, байты в бюджете.
// Детерминировано: только данные каталога, без дат — повторный build
// даёт байт-в-байт тот же index.html.
//
// Только свои страницы: внешние URL в разметку не включаем (как и в sitemap) —
// иначе блок рос бы с каждым мостом и ломал бюджет index.html.
export function buildLdJson(games) {
  const itemListElement = games.filter((game) => game.file).map((game, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    item: {
      '@type': 'VideoGame',
      name: game.title,
      description: game.description,
      url: game.url ?? `${CANONICAL_BASE}/${game.file.replace(/index\.html$/, '')}`,
      applicationCategory: 'Game',
      operatingSystem: 'Web',
      gamePlatform: 'Web browser',
    },
  }));
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'MiniArcade — каталог HTML5-игр',
    itemListElement,
  });
}

async function injectLdJson(rootDir, games) {
  const indexPath = path.join(rootDir, 'index.html');
  let html;
  try {
    html = await readFile(indexPath, 'utf8');
  } catch {
    // Фикстуры unit-тестов (только games/) — пропускаем: их контракт
    // ограничивается catalog.json + sitemap.xml.
    return;
  }
  if (!html.includes(LD_START) || !html.includes(LD_END)) {
    throw new Error('index.html is missing LD-JSON markers (<!-- LD-JSON-START --> / <!-- LD-JSON-END -->)');
  }
  const eol = detectEol(html);
  const block = `${LD_START}${eol}  <script type="application/ld+json">${buildLdJson(games)}</script>${eol}${LD_END}`;
  const pattern = new RegExp(`${escapeRegExp(LD_START)}[\\s\\S]*?${escapeRegExp(LD_END)}`);
  const next = normalizeEol(html.replace(pattern, () => block), eol);
  if (next !== html) await writeFile(indexPath, next, 'utf8');
}

export async function buildCatalog(rootDir) {
  const gamesDir = path.join(rootDir, 'games');
  const entries = await readdir(gamesDir, { withFileTypes: true });
  const visible = entries.filter((entry) => !entry.name.startsWith('.'));
  const stray = visible.filter((entry) => !entry.isDirectory());

  const errors = [];
  if (stray.length > 0) {
    errors.push(`games/: unexpected files: ${stray.map((entry) => entry.name).join(', ')}`);
  }

  const folders = visible
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const games = [];
  for (const folder of folders) {
    try {
      games.push(await readGame(gamesDir, folder));
    } catch (error) {
      errors.push(`games/${folder}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Catalog build failed:\n- ${errors.join('\n- ')}`);
  }

  games.sort(compareGames);
  const payload = { version: 1, games: games.map(({ order, ...game }) => game) };

  const outDir = path.join(rootDir, 'data');
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'catalog.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  const sitemapLines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${CANONICAL_BASE}/</loc></url>`,
    `  <url><loc>${CANONICAL_BASE}/stats.html</loc></url>`,
    // Sitemap — только свои страницы: чужие URL поисковикам не отдаём.
    ...games
      .filter((game) => game.file)
      .map((game) => `  <url><loc>${CANONICAL_BASE}/${game.file.replace(/index\.html$/, '')}</loc></url>`),
    '</urlset>',
    '',
  ];
  await writeFile(path.join(rootDir, 'sitemap.xml'), sitemapLines.join('\n'), 'utf8');
  await injectLdJson(rootDir, games);
  await syncCspMeta(rootDir);
  return payload;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const root = process.cwd();
  buildCatalog(root)
    .then((payload) => {
      console.log(`catalog.json: ${payload.games.length} games`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
