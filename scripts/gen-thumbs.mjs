// Генератор WebP-превью для своих игр: скриншот страницы игры
// (Playwright, уже в dev-зависимостях) + cwebp (метод 6, q65, ширина 440).
// Мосты не трогаем: чужие сайты скриншотить ненадёжно, у них остаётся эмодзи.
// Инкрементально: пропускает игры, чей thumb.webp свежее исходников.
// Ноль npm-зависимостей сверх имеющихся.
//
// Требуется: npx playwright install chromium; cwebp в PATH
// (CI ставит: sudo apt-get install -y webp).
//
// Запуск: node scripts/gen-thumbs.mjs [--game=<id>] [--force]
import { execFile } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4174;
const SHOT_WIDTH = 480;
const THUMB_WIDTH = 440;
const WEBP_QUALITY = 65;
const THUMB_MAX_BYTES = 25 * 1024;

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

async function toWebp(pngBuffer, outPath) {
  const tmpPng = path.join(tmpdir(), `miniarcade-thumb-${Date.now()}.png`);
  await writeFile(tmpPng, pngBuffer);
  await run('cwebp', [
    '-q',
    String(WEBP_QUALITY),
    '-m',
    '6',
    '-mt',
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

export async function nativeGameIds(rootDir = ROOT) {
  const gamesDir = path.join(rootDir, 'games');
  const entries = await readdir(gamesDir, { withFileTypes: true });
  const ids = [];
  for (const entry of entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'))) {
    const meta = JSON.parse(await readFile(path.join(gamesDir, entry.name, 'meta.json'), 'utf8'));
    if (!meta.url) ids.push(entry.name);
  }
  return ids.sort();
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const onlyArg = process.argv.find((arg) => arg.startsWith('--game='));
  const force = process.argv.includes('--force');
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
  const browser = await chromium.launch();
  try {
    await waitForServer(`http://127.0.0.1:${PORT}/`);
    let ids = await nativeGameIds(ROOT);
    if (onlyArg) ids = ids.filter((id) => id === onlyArg.split('=')[1]);
    let oversized = 0;
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
      const outPath = path.join(dir, 'thumb.webp');
      await mkdir(dir, { recursive: true });
      const size = await toWebp(png, outPath);
      const flag = size > THUMB_MAX_BYTES ? 'OVERSIZED' : 'ok';
      if (size > THUMB_MAX_BYTES) oversized += 1;
      console.log(`${flag.padEnd(4)} games/${id}/thumb.webp — ${size} bytes`);
    }
    if (oversized > 0) {
      console.error(`\n${oversized} thumb(s) превышают ${THUMB_MAX_BYTES} байт — ужать вручную или поднять лимит`);
      process.exitCode = 1;
    }
  } finally {
    await browser.close();
    server.kill();
  }
}
