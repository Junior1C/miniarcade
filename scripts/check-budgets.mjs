// Perf-бюджеты MiniArcade. Ноль зависимостей, работает в CI и pre-push.
// Проверяет размеры артефактов, которые напрямую влияют на LCP каталога.
// Пороги см. README § "Производительность и бюджеты".
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const BUDGETS = [
  { file: 'data/catalog.json', maxBytes: 250 * 1024, warnBytes: 200 * 1024 },
  // 25 КБ: оболочка лёгкая, рост — за счёт JSON-LD (SEO-разметка всех игр,
  // масштабируется с каталогом) и frame-src allowlist мостов.
  // На LCP не влияет — hero-картинки нет, критический путь тот же.
  { file: 'index.html', maxBytes: 25 * 1024 },
  { file: 'assets/css/main.css', maxBytes: 20 * 1024 },
  { file: 'assets/og.png', maxBytes: 100 * 1024 },
];

const JS_BUDGET = { dir: 'assets/js', maxBytes: 30 * 1024 };
// При >3000 игр каталог перестанет помещаться в разумный бюджет —
// сигнал к переходу на Worker+KV (см. README § "Масштабирование").
const CATALOG_COUNT_WARN = 3000;

async function fileSize(rel) {
  return (await stat(path.join(ROOT, rel))).size;
}

async function jsTotal() {
  const entries = await readdir(path.join(ROOT, JS_BUDGET.dir), { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith('.js')) {
      total += await fileSize(path.join(JS_BUDGET.dir, entry.name));
    }
  }
  return total;
}

let failed = 0;
for (const { file, maxBytes, warnBytes } of BUDGETS) {
  const size = await fileSize(file);
  const status = size > maxBytes ? 'FAIL' : size > (warnBytes ?? maxBytes) ? 'WARN' : 'ok';
  console.log(`${status.padEnd(4)} ${file} — ${size} bytes (max ${maxBytes})`);
  if (status === 'FAIL') failed += 1;
}

const jsBytes = await jsTotal();
{
  const status = jsBytes > JS_BUDGET.maxBytes ? 'FAIL' : 'ok';
  console.log(`${status.padEnd(4)} ${JS_BUDGET.dir}/*.js — ${jsBytes} bytes total (max ${JS_BUDGET.maxBytes})`);
  if (status === 'FAIL') failed += 1;
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
}

if (failed > 0) {
  console.error(`\n${failed} budget(s) exceeded`);
  process.exitCode = 1;
} else {
  console.log('\nAll performance budgets passed');
}
