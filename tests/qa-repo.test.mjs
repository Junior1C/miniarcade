import test from 'node:test';
import assert from 'node:assert/strict';

import { eolStatus, scanSecrets, stripTrailingWhitespace } from '../scripts/qa-repo.mjs';
import { framingVerdict } from '../scripts/qa-bridges.mjs';

test('scanSecrets ловит токены и ключи, молчит на обычном коде', () => {
  // Образцы разорваны конкатенацией: иначе сканер найдёт «секрет»
  // в самом тестовом файле (самопроверка стенда).
  assert.ok(scanSecrets('token = "ghp_' + 'abcdefgh12345678"').length > 0);
  assert.ok(scanSecrets('AKIA' + 'IOSFODNN7EXAMPLE').length > 0);
  assert.ok(scanSecrets('-----BEGIN ' + 'RSA PRIVATE KEY-----').length > 0);
  assert.deepEqual(scanSecrets('const STATS_URL = "https://miniarcade.pages.dev/api/hit";'), []);
});

test('eolStatus различает lf, crlf и mixed', () => {
  assert.equal(eolStatus(Buffer.from('a\nb\n')), 'lf');
  assert.equal(eolStatus(Buffer.from('a\r\nb\r\n')), 'crlf');
  assert.equal(eolStatus(Buffer.from('a\r\nb\n')), 'mixed');
});

test('stripTrailingWhitespace чистит хвосты, сохраняя EOL', () => {
  assert.equal(stripTrailingWhitespace('a  \nb\t\n', '\n'), 'a\nb\n');
  assert.equal(stripTrailingWhitespace('a  \r\nb\r\n', '\r\n'), 'a\r\nb\r\n');
});

test('framingVerdict отличает запрет встраивания от нормы', () => {
  assert.ok(framingVerdict({ 'x-frame-options': 'DENY' }));
  assert.ok(framingVerdict({ 'x-frame-options': 'SAMEORIGIN' }));
  assert.equal(framingVerdict({}), null);
  assert.equal(framingVerdict({ 'content-security-policy': "default-src 'none'" }), null);
});
