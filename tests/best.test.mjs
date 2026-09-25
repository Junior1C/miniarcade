import test from 'node:test';
import assert from 'node:assert/strict';

import { bestOf, isScoreMessage, storeBest } from '../assets/js/best.js';

test('isScoreMessage accepts only the portal protocol', () => {
  assert.equal(isScoreMessage({ type: 'miniarcade:score', game: 'snake', score: 5 }), true);
  assert.equal(isScoreMessage({ type: 'other', game: 'snake', score: 5 }), false);
  assert.equal(isScoreMessage(null), false);
  assert.equal(isScoreMessage('miniarcade:score'), false);
});

test('storeBest rejects garbage without storage', () => {
  assert.equal(storeBest('../../etc', 5), false);
  assert.equal(storeBest('snake', -1), false);
  assert.equal(storeBest('snake', 0), false);
  assert.equal(storeBest('snake', NaN), false);
  assert.equal(storeBest('snake', 1e12), false);
  assert.equal(storeBest('', 5), false);
});

test('bestOf is 0 without storage (node has no localStorage)', () => {
  assert.equal(bestOf('snake'), 0);
});
