import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { summarize } from '../scripts/pull-stats.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadJson(rel) {
  return JSON.parse(await readFile(path.join(ROOT, rel), 'utf8'));
}

test('aliases map old ids to live catalog ids', async () => {
  const aliases = await loadJson('data/aliases.json');
  const catalog = await loadJson('data/catalog.json');
  const live = new Set(catalog.games.map((game) => game.id));
  const keys = Object.keys(aliases);
  assert.ok(keys.length > 0, 'aliases must not be empty');
  for (const [old, target] of Object.entries(aliases)) {
    assert.ok(!live.has(old), `${old} must not be a live id (alias loop?)`);
    assert.ok(live.has(target), `${old} -> ${target}: target must exist in catalog`);
    assert.match(old, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.match(target, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  }
});

test('summarize folds aliased rows into canonical totals', () => {
  const aliases = { 'ext-trex': 'trex-wayou' };
  const payload = [
    {
      results: [
        { day: '2026-09-20', host: 'h', game: 'ext-trex', event: 'open', n: 2, secs: 0, uniques: 1 },
        { day: '2026-09-21', host: 'h', game: 'trex-wayou', event: 'open', n: 3, secs: 0, uniques: 2 },
      ],
    },
  ];
  const summary = summarize(payload, aliases);
  assert.equal(summary.daily.every((row) => row.game === 'trex-wayou'), true);
  assert.equal(summary.totals.length, 1);
  assert.equal(summary.totals[0].n, 5);
  assert.equal(summary.totals[0].uniques, 3);
});

test('summarize without aliases keeps behavior', () => {
  const payload = [{ results: [{ day: '2026-09-20', host: 'h', game: 'x', event: 'pv', n: 1 }] }];
  assert.equal(summarize(payload).daily[0].game, 'x');
});
