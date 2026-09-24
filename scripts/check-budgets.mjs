// Perf-бюджеты MiniArcade. Ноль зависимостей, работает в CI и pre-push.
// Проверяет размеры артефактов, которые напрямую влияют на LCP каталога.
// Пороги см. README § "Производительность и бюджеты".
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BUDGETS = [
  { file: 'data/catalog.json', maxBytes: 250 * 1024, warnBytes: 200 * 1024 },
  // 35 КБ: оболочка лёгкая, рост — за счёт JSON-LD (SEO-разметка всех игр,
  // масштабируется с каталогом) и frame-src allowlist мостов.
  // На LCP не влияет — hero-картинки нет, критический путь тот же.
  { file: 'index.html', maxBytes: 35 * 1024 },
  // Витрина статистики: та же CSP meta, что в index.html (от build.mjs),
  // без JSON-LD — растёт только с allowlist мостов.
  { file: 'stats.html', maxBytes: 35 * 1024 },
  { file: 'assets/css/main.css', maxBytes: 20 * 1024 },
  { file: 'assets/og.png', maxBytes: 100 * 1024 },
];

const JS_BUDGET = { dir: 'assets/js', maxBytes: 36 * 1024 };
// Критический путь каталога — всё кроме витрины статистики: stats-page.js
// грузится только на stats.html (<script type=module>, deferred), на LCP/INP
// главной не влияет. Отдельный бюджет держит критический JS в узде,
// пока суммарный счётчик не маскирует рост main.js за счёт витрины.
// Поднято 30→36 / 24→28 после честной сортировки 2026-09 (sort.js +
// строка статистики на карточке): +3 КБ парсинга (~1 мс) за 4 режима
// сортировки — цена зафиксирована, дальше рост только с обоснованием.
const JS_CRITICAL_MAX = 28 * 1024;
const JS_DEFERRED = new Set(['stats-page.js']);
// WebP-превью карточек (gen-thumbs.mjs): каждое лёгкое по отдельности,
// сумма — с запасом на новые игры; часть мостов без превью осознанно
// (пустой кадр — честнее эмодзи, список в NOTHUMB_BRIDGES генератора).
const THUMB_FILE_MAX = 25 * 1024;
// Суммарный вес превью — вес репозитория, а не страницы (карточки грузятся
// лениво, на странице ~24 штуки). Поднято с 1.2 до 1.6 МБ после волны +50
// мостов 2026-09: пер-файловый кап 25 КБ держит страницу, суммарный — репо.
const THUMBS_TOTAL_MAX = 1600 * 1024;
// Раннее предупреждение: суммарные превью уже на ~80% лимита —
// WARN шумит до того, как новые игры упрутся в FAIL.
const THUMBS_TOTAL_WARN = 1300 * 1024;
// Мосты масштабируют CSP (frame-src) и index.html линейно: >200 мостов —
// сигнал чистить мёртвые и резать allowlist, а не растить дальше.
// (Поднято со 150 после волны +50 лёгких мостов 2026-09: индекс и CSP
// всё ещё с запасом — см. budgets-прогон.)
const BRIDGES_WARN = 200;
// При >3000 игр каталог перестанет помещаться в разумный бюджет —
// сигнал к переходу на Worker+KV (см. README § "Масштабирование").
const CATALOG_COUNT_WARN = 3000;

async function fileSize(rel) {
  return (await stat(path.join(ROOT, rel))).size;
}

async function jsTotal() {
  const entries = await readdir(path.join(ROOT, JS_BUDGET.dir), { withFileTypes: true });
  let total = 0;
  let critical = 0;
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.js')) {
      const size = await fileSize(path.join(JS_BUDGET.dir, entry.name));
      total += size;
      if (!JS_DEFERRED.has(entry.name)) critical += size;
    }
  }
  return { total, critical };
}

let failed = 0;
for (const { file, maxBytes, warnBytes } of BUDGETS) {
  const size = await fileSize(file);
  const status = size > maxBytes ? 'FAIL' : size > (warnBytes ?? maxBytes) ? 'WARN' : 'ok';
  console.log(`${status.padEnd(4)} ${file} — ${size} bytes (max ${maxBytes})`);
  if (status === 'FAIL') failed += 1;
}

const { total: jsBytes, critical: jsCritical } = await jsTotal();
{
  const status = jsBytes > JS_BUDGET.maxBytes ? 'FAIL' : 'ok';
  console.log(`${status.padEnd(4)} ${JS_BUDGET.dir}/*.js — ${jsBytes} bytes total (max ${JS_BUDGET.maxBytes})`);
  if (status === 'FAIL') failed += 1;
}
{
  const status = jsCritical > JS_CRITICAL_MAX ? 'FAIL' : 'ok';
  console.log(
    `${status.padEnd(4)} ${JS_BUDGET.dir}/*.js (critical, без stats-page.js) — ${jsCritical} bytes (max ${JS_CRITICAL_MAX})`,
  );
  if (status === 'FAIL') failed += 1;
}

{
  const gamesDir = path.join(ROOT, 'games');
  const entries = await readdir(gamesDir, { withFileTypes: true });
  let thumbsTotal = 0;
  let thumbsCount = 0;
  for (const entry of entries.filter((e) => e.isDirectory())) {
    const thumb = path.join(gamesDir, entry.name, 'thumb.webp');
    try {
      const size = (await stat(thumb)).size;
      thumbsTotal += size;
      thumbsCount += 1;
      if (size > THUMB_FILE_MAX) {
        console.error(`FAIL games/${entry.name}/thumb.webp — ${size} bytes (max ${THUMB_FILE_MAX})`);
        failed += 1;
      }
    } catch {
      // Превью нет (мосты) — штатно.
    }
  }
  const totalStatus = thumbsTotal > THUMBS_TOTAL_MAX ? 'FAIL' : thumbsTotal > THUMBS_TOTAL_WARN ? 'WARN' : 'ok';
  console.log(`${totalStatus.padEnd(4)} games/*/thumb.webp — ${thumbsTotal} bytes in ${thumbsCount} file(s) (max ${THUMBS_TOTAL_MAX})`);
  if (totalStatus === 'FAIL') failed += 1;
}

{
  const { default: catalog } = await import(`file://${path.join(ROOT, 'data', 'catalog.json')}`, {
    with: { type: 'json' },
  }).catch(async () => {
    // Node <22 без json-import-attributes: читаем вручную.
    const { readFile } = await import('node:fs/promises');
    return { default: JSON.parse(await readFile(path.join(ROOT, 'data', 'catalog.json'), 'utf8')) };
  });
  const count = catalog.games?.length ?? 0;
  console.log(`info ${'data/catalog.json'} — ${count} games`);
  if (count > CATALOG_COUNT_WARN) {
    console.error(`WARN catalog has ${count} games (> ${CATALOG_COUNT_WARN}): пора выносить поиск в Worker+KV`);
  }
  const bridges = catalog.games?.filter((game) => game.url)?.length ?? 0;
  console.log(`info bridges — ${bridges} external (warn > ${BRIDGES_WARN})`);
  if (bridges > BRIDGES_WARN) {
    console.error(`WARN bridges ${bridges} (> ${BRIDGES_WARN}): CSP frame-src и index.html растут линейно — чистить мёртвые`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} budget(s) exceeded`);
  process.exitCode = 1;
} else {
  console.log('\nAll performance budgets passed');
}
