import test from 'node:test';
import assert from 'node:assert/strict';

import { bodyVerdict, framingVerdict } from '../scripts/qa-bridges.mjs';

test('framingVerdict отличает запрет встраивания от нормы', () => {
  assert.equal(framingVerdict({ 'x-frame-options': 'DENY' }).slice(0, 16), 'X-Frame-Options:');
  assert.equal(framingVerdict({ 'x-frame-options': 'SAMEORIGIN' }).slice(0, 16), 'X-Frame-Options:');
  assert.ok(framingVerdict({ 'content-security-policy': "frame-ancestors 'none'" }));
  assert.equal(framingVerdict({}), null);
  assert.equal(framingVerdict({ 'x-frame-options': 'ALLOWALL' }), null);
});

test('bodyVerdict ловит meta-refresh на чужой origin (кейс ext-td)', () => {
  const stub = '<html><head><meta http-equiv="refresh" content="0; url=https://github.com/someone/game"></head></html>';
  const verdict = bodyVerdict(stub, 'https://oldj.net/static/game/td.html');
  assert.ok(verdict && verdict.includes('meta-refresh'), 'external refresh must be flagged');
  assert.equal(
    bodyVerdict('<html><head><meta http-equiv="refresh" content="0; url=/game/"></head></html>', 'https://a.test/game/'),
    null,
    'same-origin refresh is fine',
  );
});

test('bodyVerdict ловит антибот-заглушку хостинга', () => {
  const stub = '<script>var _0x49a6=["wyeCN"];document["cookie"]="__tst_status="+a(0);location.href=location.href;</script>';
  assert.ok(bodyVerdict(stub, 'https://freehost.test/game/'), 'antibot stub must be flagged');
  assert.equal(bodyVerdict('<canvas id="game"></canvas><script>play()</script>', 'https://a.test/'), null);
  assert.equal(bodyVerdict('', 'https://a.test/'), null);
});
