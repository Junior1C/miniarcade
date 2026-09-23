import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { SANDBOX_TOKENS } from '../assets/js/sandbox-tokens.js';

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

  if (typeof meta.controls === 'string') {
    // optional, no validation beyond type
  } else if (meta.controls !== undefined) {
    errors.push('"controls" must be a string');
  }

  try {
    await stat(path.join(gamesDir, folder, 'index.html'));
  } catch {
    errors.push('index.html is missing');
  }

  if (errors.length > 0) {
    throw new Error(errors.join('; '));
  }

  const game = {
    id: folder,
    title,
    emoji,
    description,
    file: `games/${folder}/index.html`,
    tags,
    order,
  };
  if (typeof meta.controls === 'string') game.controls = meta.controls;
  if (sandbox && sandbox.length > 0) game.sandbox = sandbox;
  return game;
}

function compareGames(a, b) {
  if (a.order !== b.order) return a.order - b.order;
  return a.title.localeCompare(b.title, 'ru');
}

const LD_START = '  <!-- LD-JSON-START -->';
const LD_END = '  <!-- LD-JSON-END -->';

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Структурированные данные для поисковиков (schema.org): ноль runtime-цены,
// только SEO. application/ld+json — data-блок, CSP script-src его не режет.
// Компактная форма (без отступов): блок растёт с числом игр, байты в бюджете.
// Детерминировано: только данные каталога, без дат — повторный build
// даёт байт-в-байт тот же index.html.
export function buildLdJson(games) {
  const itemListElement = games.map((game, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    item: {
      '@type': 'VideoGame',
      name: game.title,
      description: game.description,
      url: `${CANONICAL_BASE}/${game.file.replace(/index\.html$/, '')}`,
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
  const block = `${LD_START}\n  <script type="application/ld+json">${buildLdJson(games)}</script>\n${LD_END}`;
  const pattern = new RegExp(`${escapeRegExp(LD_START)}[\\s\\S]*?${escapeRegExp(LD_END)}`);
  await writeFile(indexPath, html.replace(pattern, () => block), 'utf8');
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
    ...games.map((game) => `  <url><loc>${CANONICAL_BASE}/${game.file.replace(/index\.html$/, '')}</loc></url>`),
    '</urlset>',
    '',
  ];
  await writeFile(path.join(rootDir, 'sitemap.xml'), sitemapLines.join('\n'), 'utf8');
  await injectLdJson(rootDir, games);
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
