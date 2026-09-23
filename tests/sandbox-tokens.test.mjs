import test from 'node:test';
import assert from 'node:assert/strict';

import { SANDBOX_TOKENS } from '../assets/js/sandbox-tokens.js';
import { SANDBOX_ALLOWLIST } from '../assets/js/player.js';

const FORBIDDEN = [
  'allow-same-origin',
  'allow-top-navigation',
  'allow-top-navigation-by-user-activation',
  'allow-forms',
  'allow-scripts',
];

test('sandbox allowlist is a single source of truth', () => {
  assert.deepEqual([...SANDBOX_ALLOWLIST].sort(), [...SANDBOX_TOKENS].sort());
});

test('sandbox allowlist never contains dangerous tokens', () => {
  for (const token of FORBIDDEN) {
    assert.equal(SANDBOX_ALLOWLIST.has(token), false, `${token} must stay forbidden`);
  }
  for (const token of SANDBOX_TOKENS) {
    assert.match(token, /^allow-[a-z-]+$/, `${token} must be a valid sandbox token`);
  }
});
