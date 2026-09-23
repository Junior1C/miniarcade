import test from 'node:test';
import assert from 'node:assert/strict';

import { auditGameHtml, auditGameJs, stripComments } from '../scripts/qa-games.mjs';

const GOOD_HTML = `<!DOCTYPE html>
<html lang="ru"><head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'">
<title>X</title>
<link rel="stylesheet" href="style.css">
<script src="game.js" defer></script>
</head><body></body></html>`;

test('stripComments режет // и /* */ (комментарий-пояснение не должен валить бот)', () => {
  const code = `// localStorage в sandbox недоступен\nconst a = 1; /* fetch( тоже в комменте */ e.code;`;
  const stripped = stripComments(code);
  assert.ok(!stripped.includes('localStorage'));
  assert.ok(!stripped.includes('fetch('));
  assert.ok(stripped.includes('e.code'));
});

test('auditGameHtml пропускает эталонную страницу игры', () => {
  const { fails } = auditGameHtml(GOOD_HTML);
  assert.deepEqual(fails, []);
});

test('auditGameHtml валит инлайн и слабый CSP', () => {
  const noCsp = auditGameHtml('<html><head></head><body></body></html>');
  assert.ok(noCsp.fails.some((f) => f.includes('CSP meta')));
  assert.ok(auditGameHtml(`${GOOD_HTML}<script>alert(1)</script>`).fails.some((f) => f.includes('инлайн')));
  assert.ok(auditGameHtml(GOOD_HTML.replace('</body>', '<div style="x"></div></body>')).fails.some((f) => f.includes('style-атрибут')));
  assert.ok(auditGameHtml(GOOD_HTML.replace('</body>', '<b onclick="x()">y</b></body>')).fails.some((f) => f.includes('on*')));
});

test('auditGameJs валит сеть, storage, модули и innerHTML', () => {
  assert.ok(auditGameJs('demo', 'fetch("/api")').fails.some((f) => f.includes('fetch(')));
  assert.ok(auditGameJs('demo', 'localStorage.getItem("x")').fails.some((f) => f.includes('localStorage')));
  assert.ok(auditGameJs('demo', 'import x from "y"').fails.some((f) => f.includes('ES-модули')));
  assert.ok(auditGameJs('demo', 'el.innerHTML = s').fails.some((f) => f.includes('innerHTML')));
  assert.ok(auditGameJs('demo', 'alert("x")').fails.some((f) => f.includes('alert(')));
});

test('auditGameJs: e.key запрещён всем, кроме буквенных игр', () => {
  assert.ok(auditGameJs('snake', 'if (e.key === "a")').fails.some((f) => f.includes('e.code')));
  assert.deepEqual(auditGameJs('hangman', 'const l = event.key;').fails, []);
});

test('auditGameJs: realtime без visibilitychange — только WARN', () => {
  const { fails, warns } = auditGameJs('demo', 'requestAnimationFrame(tick)');
  assert.deepEqual(fails, []);
  assert.equal(warns.length, 1);
  const withPause = auditGameJs('demo', `requestAnimationFrame(tick);
document.addEventListener('visibilitychange', () => {});`);
  assert.deepEqual(withPause.warns, []);
});
