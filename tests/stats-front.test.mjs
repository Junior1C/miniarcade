import test from 'node:test';
import assert from 'node:assert/strict';

import { validGameId } from '../assets/js/stats.js';

test('validGameId accepts catalog ids only', () => {
  assert.equal(validGameId('snake'), true);
  assert.equal(validGameId('ext-2048'), true);
  assert.equal(validGameId(''), false);
  assert.equal(validGameId(undefined), false);
  assert.equal(validGameId('../../etc/passwd'), false);
  assert.equal(validGameId('a'.repeat(65)), false);
});
