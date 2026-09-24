// Генератор WebP-превью для карточек (440px, q65, метод 6).
// Свои игры: скриншот <main> (со стартом партии, если есть кнопка).
// Мосты (--bridges): скриншот вьюпорта 480x480 чужой страницы как есть
// (купюры/баннеры возможны — конкретный мост лечится --game=<id> --force).
// Мосты падают мягко: WARN + эмодзи-фолбэк, прогон не валится.
// Инкрементально: пропускает игры, чей thumb.webp свежее исходников.
// Ноль npm-зависимостей сверх имеющихся.
//
// Требуется: npx playwright install chromium; cwebp в PATH
// (CI ставит: sudo apt-get install -y webp).
//
// Запуск: node scripts/gen-thumbs.mjs [--game=<id>] [--force] [--bridges] [--all] [--limit=N]
import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4174;
const SHOT_WIDTH = 480;
const SHOT_SQUARE = 480;
const THUMB_WIDTH = 440;
// q60 вместо q65: суммарные превью упёрлись в WARN (800КБ), каждое новое
// превью приближает FAIL 1.2МБ. Разница визуально незаметна на 440px,
// экономия ~10-15% на файл. Существующие thumbs не пережимаем инкрементально
// (thumbFresh), только новые/--force.
const WEBP_QUALITY = 60;
const THUMB_MAX_BYTES = 25 * 1024;
// Бережный режим (не выжигать CPU/GPU/RAM): короткие таймауты,
// пауза между мостами, cwebp без -mt, батчи через --limit.
const GOTO_TIMEOUT_MS = 20000;
const SHOT_TIMEOUT_MS = 10000;
const CLOSE_TIMEOUT_MS = 8000;
const BRIDGE_PAUSE_MS = 500;

// Мосты без превью осознанно: кадр выходит пустым/загрузчиком/
// страницей доков — честнее эмодзи, чем мусор в карточке.
// Проверено глазами, поштучно (см. историю thumbs-задачи).
const NOTHUMB_BRIDGES = new Set([
  'ext-duckhunt', // Чёрный пустой кадр (нужен клик для старта).
  'ext-masonicpacman', // Чёрный пустой кадр.
  'ext-emoji-mines', // Белый лист, игра ниже фолда.
  'ext-netwalk', // Кадр выходит экраном «Loading...» (p5 с CDN не успевает за скриншот) — честнее эмодзи.
]);

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${cmd} ${args.join(' ')}: ${stderr || error.message}`));
      else resolve(stdout);
    });
  });
}

async function waitForServer(url, attempts = 50) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Ещё не поднялся.
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`dev server did not start at ${url}`);
}

async function thumbFresh(dir, files) {
  try {
    const thumbTime = (await stat(path.join(dir, 'thumb.webp'))).mtimeMs;
    for (const file of files) {
      if ((await stat(path.join(dir, file))).mtimeMs > thumbTime) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function screenshotGame(browser, id) {
  const page = await browser.newPage({ viewport: { width: SHOT_WIDTH, height: 400 } });
  try {
    await page.goto(`http://127.0.0.1:${PORT}/games/${id}/`, { waitUntil: 'load' });
    // Представительный кадр: если есть старт — запускаем партию,
    // иначе берём начальное состояние. Звук в headless безопасен:
    // в играх весь SFX обёрнут в try/catch.
    const started = await page.evaluate(() => {
      const btn = document.getElementById('start');
      if (btn && !btn.disabled) {
        btn.click();
        return true;
      }
      return false;
    });
    await page.waitForTimeout(started ? 800 : 900);
    const target = (await page.locator('main').count()) > 0 ? page.locator('main') : page.locator('body');
    const png = await target.screenshot({ type: 'png' });
    return png;
  } finally {
    await page.close();
  }
}

async function screenshotBridge(browser, url) {
  // Свой контекст на мост: падение рендера чужой страницы не травит остальных.
  const context = await browser.newContext({ viewport: { width: SHOT_SQUARE, height: SHOT_SQUARE } });
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: GOTO_TIMEOUT_MS });
    // Стабилизация URL: страница может JS-редиректить (как 2048 на play2048.co) —
    // скриншот в полёте навигации падает с Target closed. Ждём устаканивания.
    let lastUrl = '';
    for (let i = 0; i < 6; i += 1) {
      await page.waitForTimeout(600);
      if (page.isClosed()) throw new Error('page closed during redirect settling');
      const now = page.url();
      if (now === lastUrl) break;
      lastUrl = now;
    }
    return { png: await page.screenshot({ type: 'png', timeout: SHOT_TIMEOUT_MS }), finalUrl: lastUrl };
  } finally {
    await closeContext(context);
  }
}

async function toWebp(pngBuffer, outPath) {
  const tmpPng = path.join(tmpdir(), `miniarcade-thumb-${Date.now()}.png`);
  await writeFile(tmpPng, pngBuffer);
  // Без -mt: многопоточный cwebp даёт всплески CPU, выигрыш секундный.
  await run('cwebp', [
    '-q',
    String(WEBP_QUALITY),
    '-m',
    '6',
    '-resize',
    String(THUMB_WIDTH),
    '0',
    tmpPng,
    '-o',
    outPath,
  ]);
  const size = (await stat(outPath)).size;
  return size;
}

// context.close() умеет висеть на подклинившем рендере —
// не ждём дольше лимита, браузер позже пересоздастся.
async function closeContext(context) {
  await Promise.race([context.close().catch(() => {}), new Promise((r) => setTimeout(r, CLOSE_TIMEOUT_MS))]);
}

export async function nativeGameIds(rootDir = ROOT) {
  return gameIds(rootDir, (meta) => !meta.url);
}

export async function bridgeGameIds(rootDir = ROOT) {
  return gameIds(rootDir, (meta) => Boolean(meta.url));
}

export async function bridgeUrls(rootDir = ROOT) {
  const gamesDir = path.join(rootDir, 'games');
  const ids = await bridgeGameIds(rootDir);
  const urls = [];
  for (const id of ids) {
    const meta = JSON.parse(await readFile(path.join(gamesDir, id, 'meta.json'), 'utf8'));
    urls.push({ id, url: meta.url });
  }
  return urls;
}

async function gameIds(rootDir, pick) {
  const gamesDir = path.join(rootDir, 'games');
  const entries = await readdir(gamesDir, { withFileTypes: true });
  const ids = [];
  for (const entry of entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'))) {
    const meta = JSON.parse(await readFile(path.join(gamesDir, entry.name, 'meta.json'), 'utf8'));
    if (pick(meta)) ids.push(entry.name);
  }
  return ids.sort();
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const onlyArg = process.argv.find((arg) => arg.startsWith('--game='));
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 0) : Infinity;
  const force = process.argv.includes('--force');
  const wantBridges = process.argv.includes('--bridges') || process.argv.includes('--all');
  const wantNative = !process.argv.includes('--bridges') || process.argv.includes('--all');
  try {
    await run('cwebp', ['-version']);
  } catch {
    console.error('cwebp not found in PATH (CI: sudo apt-get install -y webp)');
    process.exitCode = 1;
    process.exit();
  }
  const { spawn } = await import('node:child_process');
  const server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore',
  });
  const { chromium } = await import('@playwright/test');
  let browser = await chromium.launch();
  process.on('unhandledRejection', (error) => {
    console.log(`WARN unhandled: ${String(error).split('\n')[0]} (идём дальше)`);
  });
  async function ensureBrowser() {
    if (!browser.isConnected()) browser = await chromium.launch();
    return browser;
  }
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`);
    const only = onlyArg ? onlyArg.split('=')[1] : null;
    let oversized = 0;
    let failed = 0;

    async function saveThumb(dir, png) {
      const outPath = path.join(dir, 'thumb.webp');
      await mkdir(dir, { recursive: true });
      const size = await toWebp(png, outPath);
      const flag = size > THUMB_MAX_BYTES ? 'OVERSIZED' : 'ok';
      if (size > THUMB_MAX_BYTES) oversized += 1;
      return { size, flag };
    }

    if (wantNative) {
      let ids = await nativeGameIds(ROOT);
      if (only) ids = ids.filter((id) => id === only);
      for (const id of ids) {
        const dir = path.join(ROOT, 'games', id);
        const existing = [];
        for (const file of ['index.html', 'game.js', 'style.css', 'meta.json']) {
          try {
            await stat(path.join(dir, file));
            existing.push(file);
          } catch {
            // Нет файла — не источник.
          }
        }
        if (!force && (await thumbFresh(dir, existing))) {
          console.log(`skip ${id} (thumb свежий)`);
          continue;
        }
        const png = await screenshotGame(browser, id);
        const { size, flag } = await saveThumb(dir, png);
        console.log(`${flag.padEnd(4)} games/${id}/thumb.webp — ${size} bytes`);
      }
    }

    if (wantBridges) {
      let bridges = await bridgeUrls(ROOT);
      if (only) bridges = bridges.filter((b) => b.id === only);
      let done = 0;
      for (const { id, url } of bridges) {
        if (done >= limit) {
          console.log(`стоп: лимит --limit=${limit}, сделано ${done}`);
          break;
        }
        const dir = path.join(ROOT, 'games', id);
        if (NOTHUMB_BRIDGES.has(id)) {
          continue;
        }
        if (!force && (await thumbFresh(dir, ['meta.json']))) {
          continue;
        }
        // Двойной контур: ни один мост не роняет прогон.
        try {
          const shot = await screenshotBridge(await ensureBrowser(), url);
          const { size, flag } = await saveThumb(dir, shot.png);
          done += 1;
          const finalOrigin = new URL(shot.finalUrl).origin;
          const moved = finalOrigin !== new URL(url).origin ? ` (редирект на ${finalOrigin})` : '';
          console.log(`${flag.padEnd(4)} games/${id}/thumb.webp — ${size} bytes${moved}`);
        } catch (error) {
          try {
            const again = await screenshotBridge(await ensureBrowser(), url);
            const { size, flag } = await saveThumb(dir, again.png);
            done += 1;
            console.log(`retry ${flag.padEnd(4)} games/${id}/thumb.webp — ${size} bytes`);
          } catch (error2) {
            failed += 1;
            done += 1;
            const reason = String(error2?.message ?? error?.message).split('\n')[0];
            console.log(`FAIL games/${id}: ${reason} (остаётся эмодзи)`);
          }
        }
        // Пауза между мостами: не выжигать CPU и не долбить чужие серверы.
        await new Promise((r) => setTimeout(r, BRIDGE_PAUSE_MS));
      }
    }

    if (oversized > 0) {
      console.error(`\n${oversized} thumb(s) превышают ${THUMB_MAX_BYTES} байт — ужать вручную или поднять лимит`);
      process.exitCode = 1;
    }
    if (failed > 0) console.log(`\nмостов без превью (эмодзи-фолбэк): ${failed}`);
  } finally {
    await browser.close();
    server.kill();
  }
}
