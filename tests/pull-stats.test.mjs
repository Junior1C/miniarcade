import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { summarize, writeStats } from '../scripts/pull-stats.mjs';

const WRANGLER_SAMPLE = [
  {
    results: [
      { day: '2026-09-22', host: 'junior1c.github.io', game: '', event: 'pv', n: 10, secs: 0, uniques: 7 },
      { day: '2026-09-22', host: 'junior1c.github.io', game: 'snake', event: 'open', n: 4, secs: 0, uniques: 3 },
      { day: '2026-09-22', host: 'junior1c.github.io', game: 'snake', event: 'close', n: 3, secs: 120, uniques: 3 },
      { day: '2026-09-21', host: 'miniarcade.pages.dev', game: 'snake', event: 'open', n: 2, secs: 0, uniques: 2 },
    ],
  },
];

test('summarize splits daily rows and host/game/event totals', () => {
  const summary = summarize(WRANGLER_SAMPLE);
  assert.equal(summary.daily.length, 4);
  assert.equal(typeof summary.generatedAt, 'string');
  const snake = summary.totals.filter((row) => row.game === 'snake');
  const opens = snake.filter((row) => row.event === 'open');
  assert.equal(opens.reduce((sum, row) => sum + row.n, 0), 6);
  assert.equal(snake.find((row) => row.event === 'close').secs, 120);
  // Уники едут сквозняком: daily и totals.
  assert.equal(summary.daily[1].uniques, 3);
  assert.equal(opens.reduce((sum, row) => sum + row.uniques, 0), 5);
  // Самые популярные — первыми.
  assert.ok(summary.totals[0].n >= summary.totals.at(-1).n);
});

test('summarize tolerates empty and malformed payloads', () => {
  assert.deepEqual(summarize([]).daily, []);
  assert.deepEqual(summarize([{ results: null }]).daily, []);
  assert.deepEqual(summarize([{ results: [{ day: null }] }]).daily, []);
});

test('summarize defaults missing uniques to 0 (pre-migration rows)', () => {
  const summary = summarize([{ results: [{ day: '2026-09-20', host: 'h', game: 'g', event: 'open', n: 2 }] }]);
  assert.equal(summary.daily[0].uniques, 0);
  assert.equal(summary.totals[0].uniques, 0);
});

test('writeStats writes daily.json and totals.json', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'miniarcade-stats-'));
  t.after(() => import('node:fs/promises').then((fs) => fs.rm(dir, { recursive: true, force: true })));
  await writeStats(dir, summarize(WRANGLER_SAMPLE));
  const daily = JSON.parse(await readFile(path.join(dir, 'daily.json'), 'utf8'));
  const totals = JSON.parse(await readFile(path.join(dir, 'totals.json'), 'utf8'));
  assert.equal(daily.length, 4);
  assert.equal(typeof totals.generatedAt, 'string');
  assert.equal(totals.totals.length, 4);
});
