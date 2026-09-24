// QA-бот играбельности: проверяет игры глазами пользователя из браузера.
// Что меряет: время загрузки, JS-ошибки, пустой экран, отклик на управление
// (пробел/клик/стрелки меняют состояние или кадр), наличие выбора языков.
// Вердикт: ok / WARN (медленно, шумно, без видимого отклика) / FAIL
// (не грузится, пусто, мёртвая страница). FAIL — кандидат на удаление,
// но решение всегда за человеком (см. отчёт): сеть мостов шумит.
// Мосты ходят в живую сеть; нативки — через локальный serve.mjs.
//
// Использование:
//   node scripts/qa-playable.mjs --local              # только свои (быстро)
//   node scripts/qa-playable.mjs --bridges            # только мосты (долго)
//   node scripts/qa-playable.mjs --game=<id>          # одна игра
//   node scripts/qa-playable.mjs --out=report.json    # JSON-отчёт
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4174;
const LOAD_TIMEOUT_MS = 25000;
const SETTLE_MS = 3000;
const CONCURRENCY = 4;
// Медленная загрузка — не приговор, но сигнал тяжести (WARN).
const SLOW_LOAD_MS = 15000;

// Словарь названий языков -> код (для поиска выбора языков в игре).
// Покрывает то, что реально встречается в каталоге + топ мирового веба.
const LANG_NAMES = new Map([
  ['english', 'en'], ['eng', 'en'],
  ['русский', 'ru'], ['russian', 'ru'], ['рус', 'ru'],
  ['українська', 'uk'], ['ukrainian', 'uk'], ['укр', 'uk'],
  ['español', 'es'], ['spanish', 'es'], ['españa', 'es'],
  ['français', 'fr'], ['french', 'fr'], ['francais', 'fr'],
  ['deutsch', 'de'], ['german', 'de'], ['deutsch.', 'de'],
  ['italiano', 'it'], ['italian', 'it'],
  ['português', 'pt'], ['portuguese', 'pt'], ['portugues', 'pt'],
  ['中文', 'zh'], ['chinese', 'zh'], ['简体', 'zh'], ['繁體', 'zh'],
  ['日本語', 'ja'], ['japanese', 'ja'],
  ['한국어', 'ko'], ['korean', 'ko'],
  ['türkçe', 'tr'], ['turkish', 'tr'], ['turkce', 'tr'],
  ['polski', 'pl'], ['polish', 'pl'],
  ['nederlands', 'nl'], ['dutch', 'nl'],
]);

export function detectLangsInPage({ selects = [], langAttrs = [], candidates = [] }) {
  const found = new Set();
  for (const text of [...selects, ...candidates]) {
    const norm = String(text).trim().toLowerCase();
    if (LANG_NAMES.has(norm)) found.add(LANG_NAMES.get(norm));
  }
  for (const attr of langAttrs) {
    const code = String(attr).trim().toLowerCase().slice(0, 2);
    if (/^[a-z]{2}$/.test(code)) found.add(code);
  }
  return [...found].sort();
}

export function decideVerdict(measure) {
  if (measure.navError) return { level: 'FAIL', reason: `не грузится: ${measure.navError}` };
  if (measure.httpStatus < 200 || measure.httpStatus >= 400) {
    return { level: 'FAIL', reason: `HTTP ${measure.httpStatus}` };
  }
  if (!measure.hasContent) return { level: 'FAIL', reason: 'пустой экран: нет текста, canvas и кнопок' };
  if (measure.pageErrors.length > 0 && !measure.settled) {
    return { level: 'FAIL', reason: `падает при загрузке: ${measure.pageErrors[0]}` };
  }
  if (measure.loadMs > SLOW_LOAD_MS) return { level: 'WARN', reason: `долгая загрузка: ${Math.round(measure.loadMs / 1000)}с` };
  if (measure.pageErrors.length > 0) return { level: 'WARN', reason: `JS-ошибки, но игра встала: ${measure.pageErrors[0]}` };
  if (!measure.interacted) return { level: 'WARN', reason: 'отклика на управление не видно (возможно, нужен особый жест)' };
  return { level: 'ok', reason: '' };
}

async function snapshotState(page) {
  try {
    return await page.evaluate(() => ({
      text: document.body ? document.body.innerText.slice(0, 2000) : '',
      score: [...document.querySelectorAll('#score, .score')].map((el) => el.textContent).join('|'),
    }));
  } catch {
    return { text: '', score: '' };
  }
}

async function probeInteraction(page) {
  const before = await snapshotState(page);
  const shotA = await page.screenshot().catch(() => null);
  // Джентльменский набор игрока: пробел, стрелки, клик по центру и по кнопке.
  await page.keyboard.press('Space').catch(() => {});
  await page.waitForTimeout(600);
  await page.keyboard.press('ArrowRight').catch(() => {});
  await page.mouse.click(400, 300).catch(() => {});
  await page.waitForTimeout(600);
  const startBtn = page.locator('#start, button:has-text("Play"), button:has-text("Start"), button:has-text("Играть")').first();
  if ((await startBtn.count()) > 0) {
    await startBtn.click().catch(() => {});
    await page.waitForTimeout(800);
    await page.keyboard.press('Space').catch(() => {});
    await page.waitForTimeout(600);
  }
  const after = await snapshotState(page);
  const shotB = await page.screenshot().catch(() => null);
  const frameChanged = Boolean(shotA && shotB && !shotA.equals(shotB));
  return before.text !== after.text || before.score !== after.score || frameChanged;
}

async function scrapeLangs(page) {
  try {
    return await page.evaluate(() => {
      const texts = [];
      for (const sel of document.querySelectorAll('select')) {
        for (const opt of sel.querySelectorAll('option')) texts.push(opt.textContent || '');
      }
      const attrs = [...document.querySelectorAll('[lang]')].map((el) => el.getAttribute('lang') || '');
      const cands = [];
      for (const el of document.querySelectorAll('button, a, li, span, div')) {
        const t = (el.textContent || '').trim();
        if (t.length > 0 && t.length < 24 && el.children.length === 0) cands.push(t);
      }
      return { selects: texts.slice(0, 40), langAttrs: attrs.slice(0, 20), candidates: cands.slice(0, 400) };
    });
  } catch {
    return { selects: [], langAttrs: [], candidates: [] };
  }
}

export async function checkGame(browser, { id, url, isBridge }) {
  const result = { id, url, isBridge };
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error && error.message ? error.message : error).split('\n')[0]));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 160));
  });
  const t0 = Date.now();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT_MS });
    result.httpStatus = response ? response.status() : 0;
    result.finalUrl = page.url();
    await page.waitForTimeout(SETTLE_MS);
    result.settled = true;
  } catch (error) {
    result.navError = String(error.message || error).split('\n')[0];
  }
  result.loadMs = Date.now() - t0;
  result.pageErrors = pageErrors;
  result.consoleErrors = consoleErrors.slice(0, 3);
  if (!result.navError) {
    let info = { texts: 0, canvases: 0, buttons: 0, title: '' };
    try {
      info = await page.evaluate(() => ({
        texts: (document.body ? document.body.innerText.trim().length : 0),
        canvases: document.querySelectorAll('canvas').length,
        buttons: document.querySelectorAll('button, a, input, select').length,
        title: document.title || '',
      }));
    } catch { /* opaque frame / dead page */ }
    result.title = info.title.slice(0, 80);
    result.hasContent = info.texts > 40 || info.canvases > 0 || info.buttons > 2;
    result.counts = { texts: info.texts, canvases: info.canvases, buttons: info.buttons };
    result.interacted = await probeInteraction(page);
    result.langs = detectLangsInPage(await scrapeLangs(page));
  }
  Object.assign(result, decideVerdict(result));
  await page.close().catch(() => {});
  return result;
}

async function gameList(rootDir, { only, bridgesOnly, localOnly }) {
  const gamesDir = path.join(rootDir, 'games');
  const entries = await readdir(gamesDir, { withFileTypes: true });
  const list = [];
  for (const entry of entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'))) {
    if (only && entry.name !== only) continue;
    const meta = JSON.parse(await readFile(path.join(gamesDir, entry.name, 'meta.json'), 'utf8'));
    const isBridge = Boolean(meta.url);
    if (bridgesOnly && !isBridge) continue;
    if (localOnly && isBridge) continue;
    list.push({ id: entry.name, url: meta.url || `http://127.0.0.1:${PORT}/games/${entry.name}/`, isBridge });
  }
  return list.sort((a, b) => (a.id < b.id ? -1 : 1));
}

async function waitForServer(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`dev server did not start at ${url}`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const onlyArg = process.argv.find((a) => a.startsWith('--game='));
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const bridgesOnly = process.argv.includes('--bridges');
  const localOnly = process.argv.includes('--local');
  const list = await gameList(ROOT, { only: onlyArg?.split('=')[1], bridgesOnly, localOnly });
  console.log(`qa-playable: ${list.length} games (bridges=${bridgesOnly}, local=${localOnly})`);
  let server = null;
  if (list.some((g) => !g.isBridge)) {
    const { spawn: spawnProc } = await import('node:child_process');
    server = spawnProc(process.execPath, ['scripts/serve.mjs'], {
      cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore',
    });
    await waitForServer(`http://127.0.0.1:${PORT}/`);
  }
  const browser = await (await import('@playwright/test')).chromium.launch();
  const queue = [...list];
  const results = [];
  try {
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const game = queue.shift();
        try {
          const r = await checkGame(browser, game);
          results.push(r);
          const extra = r.langs && r.langs.length > 1 ? ` langs=${r.langs.join(',')}` : '';
          console.log(`${r.level.padEnd(4)} ${r.id}${r.reason ? ` — ${r.reason}` : ''}${extra}`);
        } catch (error) {
          results.push({ id: game.id, url: game.url, level: 'FAIL', reason: `bot crashed: ${error.message}` });
          console.log(`FAIL ${game.id} — bot crashed`);
        }
      }
    });
    await Promise.all(workers);
  } finally {
    await browser.close();
    if (server) server.kill();
  }
  const bad = results.filter((r) => r.level !== 'ok');
  console.log(`\nqa-playable: ${results.length - bad.length}/${results.length} ok, WARN=${results.filter((r) => r.level === 'WARN').length}, FAIL=${results.filter((r) => r.level === 'FAIL').length}`);
  if (outArg) {
    await mkdir(path.dirname(outArg.split('=')[1]), { recursive: true }).catch(() => {});
    await writeFile(outArg.split('=')[1], `${JSON.stringify(results, null, 2)}\n`, 'utf8');
    console.log('report written');
  }
  if (bad.some((r) => r.level === 'FAIL')) process.exitCode = 1;
}
