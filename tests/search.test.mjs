import test from 'node:test';
import assert from 'node:assert/strict';

import { filterGames, matchesQuery, normalizeQuery } from '../assets/js/search.js';

const games = [
  {
    id: 'snake',
    title: 'Змейка',
    description: 'Классика на canvas',
    tags: ['аркада', 'canvas'],
  },
  {
    id: 'memory',
    title: 'Мемори',
    description: 'Найди все пары карт',
    tags: ['логика', 'память'],
  },
];

test('normalizeQuery trims and lowercases in Russian', () => {
  assert.equal(normalizeQuery('  ЗМЕЙ  '), 'змей');
  assert.equal(normalizeQuery(undefined), '');
});

test('empty query returns all games', () => {
  assert.equal(filterGames(games, ''), games);
  assert.equal(filterGames(games, '   '), games);
});

test('search matches title case-insensitively', () => {
  const result = filterGames(games, 'ЗМЕЙ');
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'snake');
});

test('search matches description and tags', () => {
  assert.equal(filterGames(games, 'пары')[0].id, 'memory');
  assert.equal(filterGames(games, 'canvas')[0].id, 'snake');
});

test('no matches returns empty array', () => {
  assert.deepEqual(filterGames(games, 'тетрис'), []);
});

test('matchesQuery handles missing tags array', () => {
  const bare = { id: 'x', title: 'X', description: 'описание' };
  assert.equal(matchesQuery(bare, 'описание'), true);
  assert.equal(matchesQuery(bare, 'тег'), false);
});
