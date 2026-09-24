// Iframe-тест встраивания кандидатов (то, что требует README § "Мосты":
// конечный URL после всех редиректов, включая JS, обязан разрешать
// встраивание — проверяем живым iframe, а не только HTTP-заголовками).
// Использование: node scripts/verify-iframe.mjs candidates.json [--out=report.json]
// Критерий ok: топ-страница не навигировала, в iframe закоммитился документ
// с origin из allowlist-кандидатов (тот же origin или его https-финал).
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONCURRENCY = 3;
const WAIT_MS = 10000;

function hostPage(frameSrc) {
  return `<!DOCTYPE html><html><body><iframe src="${frameSrc}" width="800" height="600"></iframe></body></html>`;
}

export async function testOne(browser, candidate) {
  const page = await browser.newPage();
  const result = { id: candidate.id, url: candidate.url };
  try {
    const topBefore = 'about:blank';
    await page.setContent(hostPage(candidate.url));
    await page.waitForTimeout(WAIT_MS);
    const topAfter = page.url();
    result.topNavigated = !topAfter.startsWith('about:') && topAfter !== topBefore && topAfter !== '';
    const frames = page.frames().filter((f) => f !== page.mainFrame());
    result.frameUrls = frames.map((f) => {
      try {
        return f.url();
      } catch {
        return '?';
      }
    });
    const committed = result.frameUrls.filter((u) => u && u !== 'about:blank');
    result.committed = committed;
    let finalOrigin = '';
    try {
      finalOrigin = committed.length > 0 ? new URL(committed[committed.length - 1]).origin : '';
    } catch {
      finalOrigin = '';
    }
    result.finalOrigin = finalOrigin;
    const expectedOrigin = new URL(candidate.url).origin;
    if (result.topNavigated) {
      result.verdict = 'frame-busting: топ-страница навигировала';
    } else if (!finalOrigin) {
      result.verdict = 'iframe пуст: встраивание заблокировано (заголовки/JS)';
    } else if (finalOrigin !== expectedOrigin) {
      result.verdict = null;
      result.moved = true;
    }
  } catch (error) {
    result.verdict = `crashed: ${String(error.message).split('\n')[0]}`;
  } finally {
    await page.close().catch(() => {});
  }
  return result;
}

export async function verifyFrames(candidates) {
  const browser = await chromium.launch();
  const queue = [...candidates];
  const results = [];
  try {
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length > 0) {
        const candidate = queue.shift();
        results.push(await testOne(browser, candidate));
      }
    });
    await Promise.all(workers);
  } finally {
    await browser.close();
  }
  return results.sort((a, b) => (a.id < b.id ? -1 : 1));
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const listPath = process.argv[2] || path.join(ROOT, 'candidates.tmp.json');
  const outArg = process.argv.find((arg) => arg.startsWith('--out='));
  const all = JSON.parse(await readFile(listPath, 'utf8'));
  // Проверяем только прошедших HTTP-стадию (список id из verify-report.json, если есть).
  let candidates = all;
  try {
    const http = JSON.parse(await readFile(path.join(ROOT, 'verify-report.json'), 'utf8'));
    const okIds = new Set(http.filter((r) => !r.verdict).map((r) => r.id));
    candidates = all.filter((c) => okIds.has(c.id));
  } catch {
    // Нет отчёта — проверяем всех.
  }
  console.log(`iframe test: ${candidates.length} candidates`);
  const results = await verifyFrames(candidates);
  for (const r of results) {
    if (r.verdict) console.log(`WARN ${r.id}: ${r.verdict} (${r.url}) frames=${JSON.stringify(r.frameUrls)}`);
    else console.log(`ok ${r.id}: ${r.finalOrigin || '(same)'}${r.moved ? ' MOVED' : ''} frames=${r.frameUrls.length}`);
  }
  if (outArg) await writeFile(outArg.split('=')[1], `${JSON.stringify(results, null, 2)}\n`, 'utf8');
  if (results.some((r) => r.verdict)) process.exitCode = 1;
}
