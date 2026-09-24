import test from 'node:test';
import assert from 'node:assert/strict';

import worker, { isBlocked, withSecurity } from '../worker.mjs';
import { FRAME_SRC_ORIGINS } from '../scripts/security-headers.mjs';

function stubAssets(handler) {
  return {
    fetch: async (request) => handler(new URL(request.url).pathname),
  };
}

const okAssets = stubAssets(
  (pathname) =>
    new Response('<hi>', {
      status: pathname === '/missing' ? 404 : 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
);

function callWorker(pathname, { method = 'GET', body = null, env = {} } = {}) {
  const request = new Request(`https://mirror.test${pathname}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body,
  });
  return worker.fetch(request, { ASSETS: okAssets, ...env });
}

test('isBlocked прячет исходники и тулинг, но не трогает сайт', () => {
  for (const blocked of [
    '/functions/api/hit.js',
    '/scripts/security-headers.mjs',
    '/tests/worker.test.mjs',
    '/stats/hit.mjs',
    '/stats/schema.sql',
    '/.github/workflows/stats.yml',
    '/node_modules/wrangler/x',
    '/games/snake/meta.json',
    '/wrangler.jsonc',
    '/package.json',
  ]) {
    assert.ok(isBlocked(blocked), `${blocked} must be blocked`);
  }
  for (const allowed of [
    '/',
    '/stats.html',
    '/robots.txt',
    '/sitemap.xml',
    '/data/catalog.json',
    '/data/stats/daily.json',
    '/games/snake/index.html',
    '/games/snake/game.js',
    '/games/snake/thumb.webp',
    '/assets/js/main.js',
    '/assets/og.png',
  ]) {
    assert.ok(!isBlocked(allowed), `${allowed} must be served`);
  }
});

test('статика получает полный prod-набор заголовков (включая CSP)', async () => {
  const res = await callWorker('/');
  assert.equal(res.status, 200);
  const csp = res.headers.get('content-security-policy');
  assert.ok(csp, 'CSP must be set by the worker');
  for (const origin of FRAME_SRC_ORIGINS) {
    assert.ok(csp.includes(origin), `CSP must allow framing ${origin}`);
  }
  assert.ok(csp.includes("frame-ancestors 'self'"), 'header CSP keeps frame-ancestors');
  assert.ok(csp.includes('upgrade-insecure-requests'), 'header CSP keeps upgrade flag');
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin');
});

test('неизвестные пути — 404, а не SPA-index', async () => {
  const res = await callWorker('/missing');
  assert.equal(res.status, 404);
  const blocked = await callWorker('/functions/api/hit.js');
  assert.equal(blocked.status, 404);
});

test('/api/hit без базы отвечает 503 (как Pages Function)', async () => {
  const res = await callWorker('/api/hit', {
    method: 'POST',
    body: JSON.stringify({ v: 1, event: 'pv', host: 'mirror.test' }),
  });
  assert.equal(res.status, 503);
});

test('/api/hit с базой пишет строку и отвечает 204', async () => {
  const bound = [];
  const fakeDb = {
    prepare: (sql) => ({
      bind: (...args) => ({
        run: async () => {
          bound.push({ sql, args });
        },
      }),
    }),
  };
  const res = await callWorker('/api/hit', {
    method: 'POST',
    body: JSON.stringify({ v: 1, event: 'pv', host: 'mirror.test' }),
    env: { STATS_DB: fakeDb },
  });
  assert.equal(res.status, 204);
  assert.equal(bound.length, 1);
  assert.ok(bound[0].sql.startsWith('INSERT INTO events'));
});

test('withSecurity не трогает тело ответа', async () => {
  const res = withSecurity(new Response('hello', { headers: { 'content-type': 'text/plain' } }));
  assert.equal(await res.text(), 'hello');
  assert.equal(res.headers.get('content-type'), 'text/plain');
});
