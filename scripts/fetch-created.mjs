// Сбор дат создания GitHub-репо для мостов (поле created в meta.json).
// Возобновляемый: прогресс в created-progress.json (id -> YYYY-MM-DD).
// Без токена лимит 60/час — пауза 70с между запросами (~51/час, устойчиво).
// Использование: node scripts/fetch-created.mjs [--limit=N]
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PROGRESS = 'created-progress.json';
const DELAY_MS = 70000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadProgress() {
  try {
    return JSON.parse(await readFile(PROGRESS, 'utf8'));
  } catch {
    return {};
  }
}

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

const progress = await loadProgress();
const entries = await readdir('games', { withFileTypes: true });
const bridges = [];
for (const e of entries.filter((x) => x.isDirectory() && !x.name.startsWith('.'))) {
  const meta = JSON.parse(await readFile(path.join('games', e.name, 'meta.json'), 'utf8'));
  if (meta.url && meta.repo && !progress[e.name]) bridges.push({ id: e.name, repo: meta.repo });
}
bridges.sort((a, b) => (a.id < b.id ? -1 : 1));
console.log(`fetch-created: ${bridges.length} pending`);

let done = 0;
for (const b of bridges) {
  if (done >= limit) break;
  const slug = b.repo.match(/github\.com\/([^/]+\/[^/]+)/i)?.[1].replace(/\/$/, '');
  if (!slug) {
    console.log(`SKIP ${b.id}: bad repo url`);
    continue;
  }
  try {
    const r = await fetch(`https://api.github.com/repos/${slug}`, { headers: { 'User-Agent': 'MiniArcade-fetch-created/1.0', Accept: 'application/vnd.github+json' } });
    const remaining = r.headers.get('x-ratelimit-remaining');
    if (r.status === 403 && remaining === '0') {
      console.log(`RATE LIMITED at ${b.id}, progress saved (${done} this run)`);
      break;
    }
    if (!r.ok) {
      console.log(`HTTP ${r.status} ${b.id}, skipping`);
    } else {
      const j = await r.json();
      const day = String(j.created_at || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
        progress[b.id] = day;
        await writeFile(PROGRESS, `${JSON.stringify(progress, null, 2)}\n`);
        console.log(`ok ${b.id} -> ${day} (quota: ${remaining})`);
        done += 1;
      } else {
        console.log(`BAD DATE ${b.id}: ${j.created_at}`);
      }
    }
  } catch (error) {
    console.log(`ERR ${b.id}: ${error.message}`);
  }
  await sleep(DELAY_MS);
}
console.log(`done: ${done} fetched this run`);
