// Аудит языков игр: сверяет lang из meta.json с фактическим языком.
// Нативки — читаем games/<id>/index.html; мосты — качаем HTML страницы.
// Эвристика: html lang > мажоритарный скрипт (кириллица=Cyrl, кана=ja,
// иероглифы без каны=zh, хангыль=ko, иначе lat). Латиницу (en/it/es/…)
// скрипт не различает — такие строки помечаем для ручной проверки.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const CONCURRENCY = 6;
const SNIFF = 16384;

function fetchSniff(url, timeoutMs = 20000, redirects = 5) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: 'timeout' }), timeoutMs);
    const lib = url.startsWith('https:') ? 'node:https' : 'node:http';
    import(lib)
      .then(({ request }) => {
        const req = request(
          url,
          { method: 'GET', headers: { 'User-Agent': 'MiniArcade-lang-audit/1.0 (+github)' } },
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
              resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') });
            };
            res.on('data', (chunk) => {
              if (done) return;
              chunks.push(chunk);
              size += chunk.length;
              if (size >= SNIFF) {
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

function analyze(body = '') {
  const head = String(body).slice(0, SNIFF);
  const htmlLang = (head.match(/<html[^>]+lang=["']?([a-zA-Z-]+)/) || [])[1] || '';
  const title = (head.match(/<title[^>]*>([^<]{1,100})/i) || [])[1] || '';
  const text = head
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const count = (re) => (text.match(re) || []).length;
  const cyrl = count(/[а-яё]/gi);
  const kana = count(/[぀-ヿ]/g);
  const han = count(/[一-鿿]/g);
  const hangul = count(/[가-힣]/g);
  const latinWords = (text.match(/[a-zA-Z]{3,}/g) || []).length;
  let detected = 'lat';
  if (kana > 2) detected = 'ja';
  else if (han > 5) detected = 'zh';
  else if (hangul > 5) detected = 'ko';
  else if (cyrl > latinWords && cyrl > 3) detected = 'ru';
  return { htmlLang: htmlLang.toLowerCase(), title: title.trim(), cyrl, kana, han, hangul, latinWords, detected, sample: text.slice(0, 220) };
}

const metas = [];
for (const e of await readdir('games', { withFileTypes: true })) {
  if (!e.isDirectory() || e.name.startsWith('.')) continue;
  try {
    metas.push(JSON.parse(await readFile(path.join('games', e.name, 'meta.json'), 'utf8')));
  } catch { /* skip */ }
}

const queue = [...metas];
const rows = [];
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length > 0) {
    const m = queue.shift();
    let body = '';
    let fetchNote = '';
    if (m.url) {
      const r = await fetchSniff(m.url);
      if (r.error || r.status < 200 || r.status >= 400) fetchNote = r.error || `HTTP ${r.status}`;
      else body = r.body;
    } else {
      try {
        body = await readFile(path.join('games', m.id, 'index.html'), 'utf8');
      } catch {
        fetchNote = 'no index.html';
      }
    }
    rows.push({ id: m.id, current: m.lang || '(none)', bridge: Boolean(m.url), fetchNote, ...analyze(body) });
  }
});
await Promise.all(workers);
rows.sort((a, b) => (a.id < b.id ? -1 : 1));
for (const r of rows) {
  console.log(
    `${r.id} | cur=${r.current} | htmllang=${r.htmlLang || '-'} | det=${r.detected} | cyr=${r.cyrl} kana=${r.kana} han=${r.han} lat=${r.latinWords} | ${r.fetchNote ? 'FETCH:' + r.fetchNote + ' | ' : ''}title="${r.title}" | ${r.sample.slice(0, 120)}`,
  );
}
