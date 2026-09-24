import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SORT_MODES,
  buildGameStats,
  cardStatsLine,
  formatPlayTime,
  sortGames,
  validSortMode,
} from '../assets/js/sort.js';

const GAMES = [
  { id: 'snake', title: 'Змейка', added: '2026-01-10' },
  { id: 'chess', title: 'Шахматы', added: '2026-09-20' },
  { id: 'aaa', title: 'Арканоид', added: null },
];

const TOTALS = [
  { host: 'h1', game: 'snake', event: 'open', n: 10, secs: 0, uniques: 6 },
  { host: 'h2', game: 'snake', event: 'open', n: 4, secs: 0, uniques: 3 },
  { host: 'h1', game: 'snake', event: 'close', n: 8, secs: 900, uniques: 5 },
  { host: 'h1', game: 'chess', event: 'open', n: 20, secs: 0, uniques: 4 },
  { host: 'h1', game: 'chess', event: 'close', n: 15, secs: 5000, uniques: 4 },
];

test('buildGameStats схлопывает хосты и события', () => {
  const stats = buildGameStats(TOTALS);
  assert.deepEqual(stats.get('snake'), { opens: 14, uniques: 9, secs: 900 });
  assert.deepEqual(stats.get('chess'), { opens: 20, uniques: 4, secs: 5000 });
  assert.equal(stats.get('aaa'), undefined);
});

test('top: уникальные игроки, затем запуски', () => {
  const stats = buildGameStats(TOTALS);
  // snake: 9 уников; chess: 4 уника при 20 запусках — побеждают люди, не клики.
  assert.deepEqual(sortGames(GAMES, 'top', stats).map((g) => g.id), ['snake', 'chess', 'aaa']);
});

test('popular: суммарное время игры', () => {
  const stats = buildGameStats(TOTALS);
  assert.deepEqual(sortGames(GAMES, 'popular', stats).map((g) => g.id), ['chess', 'snake', 'aaa']);
});

test('alpha: русская локаль', () => {
  // Арканоид < Змейка < Шахматы (З идёт раньше Ш).
  assert.deepEqual(sortGames(GAMES, 'alpha', null).map((g) => g.id), ['aaa', 'snake', 'chess']);
});

test('new: свежие первыми, без даты — в конец', () => {
  assert.deepEqual(sortGames(GAMES, 'new', null).map((g) => g.id), ['chess', 'snake', 'aaa']);
});

test('created: свежие репозитории первыми, без даты — в конец', () => {
  const dated = [
    { id: 'old', title: 'Старая', created: '2014-11-29' },
    { id: 'mid', title: 'Средняя', created: '2020-05-30' },
    { id: 'nodate', title: 'Без даты' },
  ];
  assert.deepEqual(sortGames(dated, 'created', null).map((g) => g.id), ['mid', 'old', 'nodate']);
});

test('без статистики порядок честный: нули, затем алфавит', () => {
  assert.deepEqual(sortGames(GAMES, 'top', null).map((g) => g.id), ['aaa', 'snake', 'chess']);
  assert.deepEqual(sortGames(GAMES, 'top', new Map()).map((g) => g.id), ['aaa', 'snake', 'chess']);
});

test('validSortMode чинит мусор', () => {
  assert.equal(validSortMode('popular'), 'popular');
  assert.equal(validSortMode('created'), 'created');
  assert.equal(validSortMode('hack'), 'top');
  assert.equal(validSortMode(null), 'top');
  assert.deepEqual(SORT_MODES, ['top', 'popular', 'alpha', 'new', 'created']);
});

test('formatPlayTime компактен', () => {
  assert.equal(formatPlayTime(45), '45 сек');
  assert.equal(formatPlayTime(12 * 60 + 30), '12 мин');
  assert.equal(formatPlayTime(3 * 3600), '3 ч');
  assert.equal(formatPlayTime(NaN), '0 сек');
});

test('cardStatsLine молчит без данных', () => {
  const stats = buildGameStats(TOTALS);
  assert.equal(stats.get('missing'), undefined);
  assert.equal(cardStatsLine(stats, 'aaa'), '');
  assert.equal(cardStatsLine(null, 'snake'), '');
  const line = cardStatsLine(stats, 'snake');
  assert.ok(line.includes('14 запусков'));
  assert.ok(line.includes('9 игроков'));
  assert.ok(line.includes('15 мин'));
});
