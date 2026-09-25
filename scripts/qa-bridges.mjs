// QA-бот живости мостов: проверяет, что внешние игры-мосты отвечают,
// разрешают встраивание (без X-Frame-Options / frame-ancestors-запрета)
// и отдают игру, а не заглушку (meta-refresh на чужой origin,
// антибот-челлендж хостинга — так прятался один мёртвый мост с meta-refresh).
// REPORT-ONLY: аптайм третьих сторон — не наша ответственность
// (см. README § "Мосты"), поэтому по умолчанию всегда exit 0.
// `--strict` — для ручного прогона с завалом при проблемах.
//
// Запуск: node scripts/qa-bridges.mjs [--strict] [--limit N]
// Cron: .github/workflows/qa-bridges.yml (еженедельно, не валит CI).
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 15000;
const CONCURRENCY = 8;
// Заглушки детектим по началу тела — качать мегабайты бандлов не нужно.
const BODY_SNIFF_BYTES = 3072;

function fetchHead(url, timeoutMs, redirects = 3) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: 'timeout' }), timeoutMs);
    const lib = url.startsWith('https:') ? 'node:https' : 'node:http';
    import(lib)
      .then(({ request }) => {
        const req = request(
          url,
          { method: 'GET', headers: { 'User-Agent': 'MiniArcade-qa-bot/1.0 (+github)' } },
          (res) => {
            const location = res.headers.location;
            if ([301, 302, 303, 307, 308].includes(res.statusCode) && location && redirects > 0) {
              clearTimeout(timer);
              res.resume();
              resolve(fetchHead(new URL(location, url).href, timeoutMs, redirects - 1));
              return;
            }
            const chunks = [];
            let size = 0;
            let done = false;
            const finish = () => {
              if (done) return;
              done = true;
              clearTimeout(timer);
              resolve({
                status: res.statusCode,
                headers: res.headers,
                body: Buffer.concat(chunks).toString('utf8'),
              });
            };
            res.on('data', (chunk) => {
              if (done) return;
              chunks.push(chunk);
              size += chunk.length;
              if (size >= BODY_SNIFF_BYTES) {
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

export function framingVerdict(headers = {}) {
  const xfo = String(headers['x-frame-options'] || '').toUpperCase();
  const ancestors = String(headers['content-security-policy'] || '');
  const fa = ancestors.match(/frame-ancestors([^;]+)/)?.[1] ?? '';
  if (xfo === 'DENY') return 'X-Frame-Options: DENY — встраивание запрещено';
  if (xfo === 'SAMEORIGIN') return 'X-Frame-Options: SAMEORIGIN — встраивание запрещено';
  if (/['\s]none['\s]?/.test(fa) && !fa.includes('*')) {
    return 'CSP frame-ancestors без нашего origin — встраивание запрещено';
  }
  return null;
}

// Заглушка вместо игры: meta-refresh уводит на чужой origin (профиль
// автора, доки) либо тело — обфусцированный антибот-челлендж хостинга
// без игровых маркеров. Чистая функция — покрыта node --test.
export function bodyVerdict(body = '', url) {
  const head = String(body).slice(0, BODY_SNIFF_BYTES);
  const refresh = head.match(
    /<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["']?[^"'>]*url=([^"'>\s]+)/i,
  );
  if (refresh) {
    try {
      const target = new URL(refresh[1], url);
      if (target.origin !== new URL(url).origin) {
        return `meta-refresh на чужой origin (${target.origin}) — заглушка вместо игры`;
      }
    } catch {
      // Битый refresh — не verdict, страница сама разберётся.
    }
  }
  if (
    head.length > 0 &&
    head.length < 1500 &&
    /__tst_status|EO_Bot_Ssid|_0x[0-9a-f]{4,}/.test(head) &&
    !/<canvas|game|play|score/i.test(head)
  ) {
    return 'похоже на антибот-заглушку хостинга, а не на игру';
  }
  return null;
}

export async function checkBridge(meta, timeoutMs = TIMEOUT_MS) {
  let result = await fetchHead(meta.url, timeoutMs);
  // Сетевой шум (сброс соединения, таймаут) — одна попытка повтора:
  // детерминированные HTTP-статусы не повторяем.
  if (result.error) result = await fetchHead(meta.url, timeoutMs);
  const { status, headers, body, error } = result;
  if (error) return { id: meta.id, url: meta.url, verdict: `не отвечает: ${error}` };
  if (status < 200 || status >= 400) return { id: meta.id, url: meta.url, verdict: `HTTP ${status}` };
  const framing = framingVerdict(headers);
  if (framing) return { id: meta.id, url: meta.url, verdict: framing };
  const stub = bodyVerdict(body, meta.url);
  if (stub) return { id: meta.id, url: meta.url, verdict: stub };
  return { id: meta.id, url: meta.url, verdict: null };
}

export async function checkBridges(rootDir = ROOT, { limit = Infinity } = {}) {
  const gamesDir = path.join(rootDir, 'games');
  const entries = await readdir(gamesDir, { withFileTypes: true });
  const bridges = [];
  for (const entry of entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'))) {
    const meta = JSON.parse(await readFile(path.join(gamesDir, entry.name, 'meta.json'), 'utf8'));
    if (meta.url) bridges.push(meta);
  }
  const queue = bridges.slice(0, limit);
  const results = [];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const meta = queue.shift();
      results.push(await checkBridge(meta));
    }
  });
  await Promise.all(workers);
  return results.sort((a, b) => (a.id < b.id ? -1 : 1));
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const strict = process.argv.includes('--strict');
  const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
  const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
  const results = await checkBridges(ROOT, { limit });
  const bad = results.filter((r) => r.verdict);
  for (const { id, url, verdict } of bad) console.log(`WARN ${id}: ${verdict} (${url})`);
  console.log(`qa-bridges: ${results.length - bad.length}/${results.length} ok`);
  if (strict && bad.length > 0) process.exitCode = 1;
}
