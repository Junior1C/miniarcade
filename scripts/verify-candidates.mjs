// Верификация кандидатов в мосты: живость, фрейминг, заглушки + сныфф языка.
// Использование: node scripts/verify-candidates.mjs [candidates.json] [--out=report.json]
// Проверяет то, что требует README § "Мосты": HTTP-статус, X-Frame-Options /
// frame-ancestors, заглушки вместо игры. Дополнительно тянет первые байты
// страницы: финальный URL после редиректов, <html lang>, <title> и образец
// текста (для lang/controls в meta.json). Лицензию репо проверяет человек
// через GitHub API/страницу (см. отчёт) — скрипт её не подтверждает.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bodyVerdict, checkBridge, framingVerdict } from './qa-bridges.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONCURRENCY = 6;
const SNIFF_BYTES = 16384;

function fetchSniff(url, timeoutMs = 20000, redirects = 5) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: 'timeout' }), timeoutMs);
    const lib = url.startsWith('https:') ? 'node:https' : 'node:http';
    import(lib)
      .then(({ request }) => {
        const req = request(
          url,
          { method: 'GET', headers: { 'User-Agent': 'MiniArcade-verify-bot/1.0 (+github)', 'Accept-Language': 'ru,en;q=0.8' } },
          (res) => {
            const location = res.headers.location;
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && location && redirects > 0) {
              clearTimeout(timer);
              res.resume();
              fetchSniff(new URL(location, url).href, timeoutMs, redirects - 1).then(resolve);
              return;
            }
            const chunks = [];
            let size = 0;
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8'), finalUrl: url });
            };
            res.on('data', (chunk) => {
              if (done) return;
              chunks.push(chunk);
              size += chunk.length;
              if (size >= SNIFF_BYTES) {
                res.destroy();
                finish();
              }
            });
            res.on('end', finish);
            res.on('error', finish);
          },
        );
        req.on('error', (error) => {
          clearTimeout(timer);
          resolve({ error: error.message });
        });
        req.end();
      })
      .catch((error) => {
        clearTimeout(timer);
        resolve({ error: error.message });
      });
  });
}

function sniffLang(body = '') {
  const head = String(body).slice(0, SNIFF_BYTES);
  const htmlLang = (head.match(/<html[^>]+lang=["']?([a-z-]+)/i) || [])[1] || '';
  const title = (head.match(/<title[^>]*>([^<]{1,120})/i) || [])[1] || '';
  const text = head
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
  const cyrillic = (text.match(/[а-яё]/gi) || []).length;
  return { htmlLang: htmlLang.toLowerCase(), title: title.trim(), cyrillic, text };
}

export async function verifyCandidate(candidate) {
  const bridge = await checkBridge({ id: candidate.id, url: candidate.url });
  const sniff = await fetchSniff(candidate.url);
  const report = { id: candidate.id, url: candidate.url, verdict: bridge.verdict, framing: null, stub: null };
  if (sniff.error) {
    report.sniffError = sniff.error;
    return report;
  }
  report.httpStatus = sniff.status;
  report.finalUrl = sniff.finalUrl;
  try {
    report.finalOrigin = new URL(sniff.finalUrl).origin;
    report.originChanged = report.finalOrigin !== new URL(candidate.url).origin;
  } catch {
    report.finalOrigin = '';
    report.originChanged = false;
  }
  report.framing = framingVerdict(sniff.headers);
  report.stub = bodyVerdict(sniff.body, sniff.finalUrl);
  Object.assign(report, sniffLang(sniff.body));
  if (!report.verdict) report.verdict = report.framing || report.stub;
  return report;
}

export async function verifyAll(candidates) {
  const queue = [...candidates];
  const results = [];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const candidate = queue.shift();
      try {
        results.push(await verifyCandidate(candidate));
      } catch (error) {
        results.push({ id: candidate.id, url: candidate.url, verdict: `verify crashed: ${error.message}` });
      }
    }
  });
  await Promise.all(workers);
  return results.sort((a, b) => (a.id < b.id ? -1 : 1));
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const listPath = process.argv[2] || path.join(ROOT, 'candidates.tmp.json');
  const outArg = process.argv.find((arg) => arg.startsWith('--out='));
  const candidates = JSON.parse(await readFile(listPath, 'utf8'));
  const results = await verifyAll(candidates);
  const ok = results.filter((r) => !r.verdict);
  const bad = results.filter((r) => r.verdict);
  for (const r of bad) console.log(`WARN ${r.id}: ${r.verdict} (${r.url})`);
  console.log(`verify: ${ok.length}/${results.length} ok`);
  for (const r of ok) {
    const moved = r.originChanged ? ` MOVED->${r.finalOrigin}` : '';
    console.log(`ok ${r.id}: HTTP ${r.httpStatus}${moved} lang=${r.htmlLang || '?'} cyr=${r.cyrillic} title="${r.title.slice(0, 60)}"`);
  }
  if (outArg) {
    await writeFile(outArg.split('=')[1], `${JSON.stringify(results, null, 2)}\n`, 'utf8');
    console.log(`report written`);
  }
  if (bad.length > 0) process.exitCode = 1;
}
