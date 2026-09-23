import test from 'node:test';
import assert from 'node:assert/strict';

import { formatDuration, opensByHost, sumBy, topGames, visitsByDay, widthBucket } from '../assets/js/stats-page.js';

const DAILY = [
  { day: '2026-09-21', host: 'a', game: '', event: 'pv', n: 5, secs: 0 },
  { day: '2026-09-22', host: 'a', game: '', event: 'pv', n: 7, secs: 0 },
  { day: '2026-09-22', host: 'b', game: '', event: 'pv', n: 3, secs: 0 },
  { day: '2026-09-22', host: 'a', game: 'snake', event: 'open', n: 4, secs: 0 },
  { day: '2026-09-22', host: 'a', game: 'snake', event: 'close', n: 4, secs: 120 },
];

const TOTALS = [
  { host: 'a', game: '', event: 'pv', n: 12, secs: 0 },
  { host: 'b', game: '', event: 'pv', n: 3, secs: 0 },
  { host: 'a', game: 'snake', event: 'open', n: 4, secs: 0 },
  { host: 'a', game: 'memory', event: 'open', n: 9, secs: 0 },
  { host: 'b', game: 'snake', event: 'open', n: 1, secs: 0 },
  { host: 'a', game: 'snake', event: 'close', n: 4, secs: 120 },
];

test('sumBy aggregates one event across rows', () => {
  assert.equal(sumBy(TOTALS, 'pv'), 15);
  assert.equal(sumBy(TOTALS, 'open'), 14);
  assert.equal(sumBy(TOTALS, 'close', 'secs'), 120);
  assert.equal(sumBy([], 'pv'), 0);
});

test('visitsByDay merges hosts and orders days', () => {
  assert.deepEqual(visitsByDay(DAILY), [
    ['2026-09-21', 5],
    ['2026-09-22', 10],
  ]);
});

test('topGames sorts opens desc and caps the list', () => {
  const top = topGames(TOTALS, 1);
  assert.equal(top.length, 1);
  assert.equal(top[0].game, 'memory');
  assert.ok(topGames(TOTALS, 10).every((row) => row.event === 'open'));
});

test('opensByHost groups opens per mirror', () => {
  const hosts = opensByHost(TOTALS);
  assert.equal(hosts.length, 2);
  assert.equal(hosts[0].host, 'a');
  assert.equal(hosts[0].n, 13);
});

test('formatDuration pluralizes in Russian', () => {
  assert.equal(formatDuration(0), '0 секунд');
  assert.equal(formatDuration(1), '1 секунда');
  assert.equal(formatDuration(61), '1 минута');
  assert.equal(formatDuration(125), '2 минуты');
  assert.equal(formatDuration(3600 + 300), '1 час 5 минут');
});

test('widthBucket quantizes to 5% steps for CSP-safe data-v bars', () => {
  assert.equal(widthBucket(0, 10), 0);
  assert.equal(widthBucket(5, 0), 0);
  assert.equal(widthBucket(10, 10), 100);
  assert.equal(widthBucket(1, 100), 5);
  assert.equal(widthBucket(12, 100), 10);
  assert.equal(widthBucket(13, 100), 15);
  assert.equal(widthBucket(200, 100), 100);
});
