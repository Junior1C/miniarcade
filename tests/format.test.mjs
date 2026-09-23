import test from 'node:test';
import assert from 'node:assert/strict';

import { pluralizeRu } from '../assets/js/format.js';

test('singular forms', () => {
  assert.equal(pluralizeRu(1, 'игра', 'игры', 'игр'), 'игра');
  assert.equal(pluralizeRu(21, 'игра', 'игры', 'игр'), 'игра');
  assert.equal(pluralizeRu(101, 'игра', 'игры', 'игр'), 'игра');
});

test('few forms', () => {
  assert.equal(pluralizeRu(2, 'игра', 'игры', 'игр'), 'игры');
  assert.equal(pluralizeRu(4, 'игра', 'игры', 'игр'), 'игры');
  assert.equal(pluralizeRu(22, 'игра', 'игры', 'игр'), 'игры');
  assert.equal(pluralizeRu(104, 'игра', 'игры', 'игр'), 'игры');
});

test('many forms', () => {
  assert.equal(pluralizeRu(0, 'игра', 'игры', 'игр'), 'игр');
  assert.equal(pluralizeRu(5, 'игра', 'игры', 'игр'), 'игр');
  assert.equal(pluralizeRu(11, 'игра', 'игры', 'игр'), 'игр');
  assert.equal(pluralizeRu(12, 'игра', 'игры', 'игр'), 'игр');
  assert.equal(pluralizeRu(100, 'игра', 'игры', 'игр'), 'игр');
});
