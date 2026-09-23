// QA-бот аудита своих игр: статически проверяет, что каждая игра
// соблюдает контракты README § "Как добавить игру" (sandbox с opaque
// origin, без сети, без storage, без инлайна — CSP default-src 'none').
// Ноль зависимостей. FAIL валит `npm run qa`, WARN только шумит.
//
// Запуск: node scripts/qa-games.mjs
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Буквенный ввод — намеренно e.key, а не e.code: важна сама буква,
// а не физическая клавиша (см. games/hangman/game.js). Остальным играм
// положен e.code (раскладка/Caps Lock не должны ломать управление).
const EKEY_LETTER_GAMES = new Set(['hangman']);

// Сеть запрещена играм целиком (CSP default-src 'none' + правила).
const NETWORK_PATTERNS = [
  'fetch(',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'sendBeacon',
  'navigator.onLine',
];

// Storage недоступен в sandbox с opaque origin (бросит SecurityError),
// поэтому запрещён на уровне кода, а не рантайма.
const STORAGE_PATTERNS = ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB', 'openDatabase'];

// Модалки и модули/инлайн запрещены контрактом страницы игры.
const PAGE_PATTERNS = ['alert(', 'confirm(', 'prompt('];

const GAME_CSP_DIRECTIVES = ["default-src 'none'", "script-src 'self'", "style-src 'self'"];

// Резать комментарии перед сканом: иначе `// localStorage недоступен`
// (пояснение в clicker) даст ложное срабатывание.
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^\S\r\n])\/\/[^\r\n]*/g, '$1');
}

export function auditGameHtml(html) {
  const fails = [];
  const warns = [];
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
  if (!csp) {
    fails.push('нет CSP meta-тега');
  } else {
    for (const directive of GAME_CSP_DIRECTIVES) {
      if (!csp[1].includes(directive)) fails.push(`CSP без ${directive}`);
    }
    if (csp[1].includes('unsafe-')) fails.push('CSP содержит unsafe-*');
  }
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) fails.push('инлайн <script> без src (CSP style/script-src режет)');
  if (/<style[\s>]/i.test(html)) fails.push('инлайн <style> (только внешний style.css)');
  if (/\sstyle\s*=/i.test(html)) fails.push('style-атрибуты запрещены (только внешний style.css)');
  if (/\son\w+\s*=/i.test(html)) fails.push('инлайн-обработчики on* запрещены');
  for (const pattern of PAGE_PATTERNS) {
    if (stripComments(html).includes(pattern)) fails.push(`запрещён ${pattern})`);
  }
  return { fails, warns };
}

export function auditGameJs(id, js) {
  const fails = [];
  const warns = [];
  const code = stripComments(js);
  for (const pattern of [...NETWORK_PATTERNS, ...STORAGE_PATTERNS]) {
    if (code.includes(pattern)) fails.push(`запрещён ${pattern} (песочница/сеть контракта)`);
  }
  for (const pattern of PAGE_PATTERNS) {
    if (code.includes(pattern)) fails.push(`запрещён ${pattern})`);
  }
  if (code.includes('innerHTML')) fails.push('запрещён innerHTML (только textContent/createElement)');
  if (/^\s*import\s/m.test(code) || /^\s*export\s/m.test(code)) {
    fails.push('ES-модули не работают в sandbox (только классический скрипт в IIFE)');
  }
  if (code.includes('e.key') && !EKEY_LETTER_GAMES.has(id)) {
    fails.push('e.key вместо e.code (раскладка/Caps Lock сломают управление)');
  }
  const realtime = /requestAnimationFrame|setInterval/.test(code);
  if (realtime && !code.includes('visibilitychange')) {
    warns.push('цикл реального времени без паузы по visibilitychange');
  }
  return { fails, warns };
}

export async function auditGames(rootDir = ROOT) {
  const gamesDir = path.join(rootDir, 'games');
  const entries = await readdir(gamesDir, { withFileTypes: true });
  const fails = [];
  const warns = [];
  for (const entry of entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'))) {
    const id = entry.name;
    let meta = null;
    try {
      meta = JSON.parse(await readFile(path.join(gamesDir, id, 'meta.json'), 'utf8'));
    } catch {
      fails.push(`games/${id}: meta.json не читается`);
      continue;
    }
    if (meta.url) continue; // Мост: чужой код не аудируем.
    if (typeof meta.controls !== 'string' || !meta.controls.trim()) {
      fails.push(`games/${id}: нет controls (описание управления обязательно)`);
    }
    try {
      await stat(path.join(gamesDir, id, 'thumb.webp'));
    } catch {
      warns.push(`games/${id}: нет thumb.webp — сгенерировать npm run thumbs`);
    }let html = null;
    try {
      html = await readFile(path.join(gamesDir, id, 'index.html'), 'utf8');
    } catch {
      fails.push(`games/${id}: нет index.html`);
      continue;
    }
    for (const problem of auditGameHtml(html).fails) fails.push(`games/${id}/index.html: ${problem}`);
    for (const href of ['style.css', 'game.js']) {
      const src = html.match(new RegExp(`(?:href|src)="${href}"`));
      if (src) {
        try {
          await readFile(path.join(gamesDir, id, href), 'utf8');
        } catch {
          fails.push(`games/${id}: ссылается на ${href}, файла нет`);
        }
      }
    }
    let js = null;
    try {
      js = await readFile(path.join(gamesDir, id, 'game.js'), 'utf8');
    } catch {
      fails.push(`games/${id}: нет game.js`);
      continue;
    }
    const result = auditGameJs(id, js);
    for (const problem of result.fails) fails.push(`games/${id}/game.js: ${problem}`);
    for (const problem of result.warns) warns.push(`games/${id}/game.js: ${problem}`);
  }
  return { fails, warns };
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const { fails, warns } = await auditGames(ROOT);
  for (const line of warns) console.log(`WARN ${line}`);
  if (fails.length > 0) {
    for (const line of fails) console.error(`FAIL ${line}`);
    console.error(`\nqa-games: ${fails.length} problem(s), ${warns.length} warning(s)`);
    process.exitCode = 1;
  } else {
    console.log(`qa-games: ok (${warns.length} warning(s))`);
  }
}
