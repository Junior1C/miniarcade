import test from 'node:test';
import assert from 'node:assert/strict';

import { auditBridgeLicense } from '../scripts/qa-licenses.mjs';

test('bridge without url is skipped (native game)', () => {
  assert.equal(auditBridgeLicense({ id: 'snake' }).status, 'skip');
});

test('valid permissive bridge passes', () => {
  assert.equal(
    auditBridgeLicense({ id: 'demo-x', url: 'https://x.github.io/', author: 'x', license: 'MIT' }).status,
    'ok',
  );
});

test('missing author/license/url fail offline (no network needed)', () => {
  assert.equal(
    auditBridgeLicense({ id: 'demo-a', url: 'https://x.github.io/', author: '', license: 'MIT' }).status,
    'fail',
  );
  assert.equal(
    auditBridgeLicense({ id: 'demo-b', url: 'https://x.github.io/', author: 'x', license: '' }).status,
    'fail',
  );
  assert.equal(
    auditBridgeLicense({ id: 'demo-c', url: 'http://x.github.io/', author: 'x', license: 'MIT' }).status,
    'fail',
  );
  assert.equal(
    auditBridgeLicense({ id: 'demo-d', url: 'https://x.github.io/', author: 'x', license: 'UNKNOWN' }).status,
    'fail',
  );
});

test('copyleft is warn (link with attribution, do not vendor)', () => {
  const result = auditBridgeLicense({ id: 'demo-g', url: 'https://x.github.io/', author: 'x', license: 'GPL-3.0' });
  assert.equal(result.status, 'warn');
});
