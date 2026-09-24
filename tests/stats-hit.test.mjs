import test from 'node:test';
import assert from 'node:assert/strict';

import {
  countryOf,
  dayOf,
  handleHit,
  insertHit,
  isBot,
  isRateLimited,
  parseHit,
  requestOrigin,
  resetRateLimit,
  resolveHost,
} from '../stats/hit.mjs';

function stubRequest({ method = 'POST', body = {}, headers = {} } = {}) {
  const store = new Map(Object.entries(headers));
  return {
    method,
    headers: {
      get: (name) => store.get(String(name).toLowerCase()) ?? null,
    },
    json: async () => {
      if (body instanceof Error) throw body;
      return body;
    },
  };
}

function stubDb() {
  const rows = [];
  return {
    rows,
    prepare: () => ({
      bind: (...args) => ({
        run: async () => {
          rows.push(args);
        },
      }),
    }),
  };
}

test('parseHit accepts pv/open/close with sane fields', () => {
  assert.deepEqual(parseHit({ v: 1, event: 'pv', host: 'miniarcade.pages.dev' }), {
    ok: true,
    data: { host: 'miniarcade.pages.dev', game: '', event: 'pv', secs: 0, ref: '' },
  });
  const open = parseHit({ v: 1, event: 'open', host: 'junior1c.github.io', game: 'snake' });
  assert.equal(open.ok, true);
  const close = parseHit({
    v: 1,
    event: 'close',
    host: 'x',
    game: 'ext-trex',
    secs: 95.6,
    ref: 'https://example.com/a?b=c',
  });
  assert.equal(close.ok, true);
  assert.equal(close.data.secs, 96);
  assert.equal(close.data.ref, 'example.com');
});

test('parseHit rejects garbage', () => {
  for (const body of [
    null,
    {},
    { v: 2, event: 'pv', host: 'x' },
    { v: 1, event: 'hack', host: 'x' },
    { v: 1, event: 'pv', host: 'not a host!!' },
    { v: 1, event: 'open', host: 'x', game: '../../etc' },
    { v: 1, event: 'close', host: 'x', game: 'snake', secs: 'lots' },
  ]) {
    assert.equal(parseHit(body).ok, false, JSON.stringify(body));
  }
});

test('close secs are clamped, open ignores secs', () => {
  assert.equal(parseHit({ v: 1, event: 'close', host: 'x', game: 'y', secs: 1e9 }).data.secs, 43200);
  assert.equal(parseHit({ v: 1, event: 'open', host: 'x', game: 'y', secs: 999 }).data.secs, 0);
});

test('isBot catches crawlers and headless automation', () => {
  assert.equal(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)'), true);
  assert.equal(isBot('Mozilla/5.0 HeadlessChrome/120.0'), true);
  assert.equal(isBot('python-requests/2.31'), true);
  assert.equal(
    isBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'),
    false,
  );
  assert.equal(isBot(''), false);
});

test('countryOf keeps only ISO codes', () => {
  const headers = (country) => ({ get: () => country });
  assert.equal(countryOf(headers('ru')), 'RU');
  assert.equal(countryOf(headers('xx1')), '');
  assert.equal(countryOf(headers(null)), '');
});

test('dayOf formats UTC date', () => {
  assert.equal(dayOf(Date.UTC(2026, 8, 23, 12)), '2026-09-23');
});

test('handleHit: OPTIONS/GET/DNT/bot/no-db/malformed paths', async () => {
  const db = stubDb();
  const env = { STATS_DB: db };

  const options = await handleHit(stubRequest({ method: 'OPTIONS' }), env);
  assert.equal(options.status, 204);

  const get = await handleHit(stubRequest({ method: 'GET' }), env);
  assert.equal(get.status, 405);

  const dnt = await handleHit(
    stubRequest({ body: { v: 1, event: 'pv', host: 'x' }, headers: { dnt: '1' } }),
    env,
  );
  assert.equal(dnt.status, 204);
  assert.equal(db.rows.length, 0);

  const bot = await handleHit(
    stubRequest({ body: { v: 1, event: 'pv', host: 'x' }, headers: { 'user-agent': 'Googlebot' } }),
    env,
  );
  assert.equal(bot.status, 204);
  assert.equal(db.rows.length, 0);

  const noDb = await handleHit(stubRequest({ body: { v: 1, event: 'pv', host: 'x' } }), {});
  assert.equal(noDb.status, 503);

  const badJson = await handleHit(stubRequest({ body: new Error('nope') }), env);
  assert.equal(badJson.status, 400);

  const badBody = await handleHit(stubRequest({ body: { v: 1, event: 'nope', host: 'x' } }), env);
  assert.equal(badBody.status, 400);
  assert.equal(db.rows.length, 0);
});

test('handleHit: valid hit is stored with 8 columns', async () => {
  const db = stubDb();
  const res = await handleHit(
    stubRequest({
      body: { v: 1, event: 'open', host: 'miniarcades.vercel.app', game: 'snake' },
      headers: { 'cf-ipcountry': 'de', 'user-agent': 'Mozilla/5.0 Chrome/120' },
    }),
    { STATS_DB: db },
  );
  assert.equal(res.status, 204);
  assert.equal(db.rows.length, 1);
  const [ts, day, host, game, event, secs, country, ref] = db.rows[0];
  assert.ok(Number.isFinite(ts));
  assert.match(day, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(host, 'miniarcades.vercel.app');
  assert.equal(game, 'snake');
  assert.equal(event, 'open');
  assert.equal(secs, 0);
  assert.equal(country, 'DE');
  assert.equal(ref, '');
});

test('insertHit binds in column order', async () => {
  const db = stubDb();
  await insertHit(
    db,
    { host: 'h', game: 'g', event: 'close', secs: 7, ref: 'r' },
    { now: 123, day: '2026-09-23', country: 'RU' },
  );
  assert.deepEqual(db.rows[0], [123, '2026-09-23', 'h', 'g', 'close', 7, 'RU', 'r']);
});

test('requestOrigin prefers Origin over Referer, empty when absent', () => {
  const withOrigin = stubRequest({ headers: { origin: 'https://miniarcade.pages.dev' } });
  assert.equal(requestOrigin(withOrigin), 'https://miniarcade.pages.dev');
  const withRef = stubRequest({ headers: { referer: 'https://junior1c.github.io/miniarcade/' } });
  assert.equal(requestOrigin(withRef), 'https://junior1c.github.io');
  assert.equal(requestOrigin(stubRequest()), '');
});

test('resolveHost trusts verified Origin over body (anti-poisoning)', () => {
  const req = stubRequest({ headers: { origin: 'https://miniarcades.vercel.app' } });
  assert.equal(resolveHost(req, 'evil.example'), 'miniarcades.vercel.app');
  assert.equal(resolveHost(stubRequest(), 'miniarcade.pages.dev'), 'miniarcade.pages.dev');
});

test('handleHit: foreign Origin is 403 before DB write', async () => {
  resetRateLimit();
  const db = stubDb();
  const res = await handleHit(
    stubRequest({
      body: { v: 1, event: 'pv', host: 'x' },
      headers: { origin: 'https://evil.example', 'user-agent': 'Mozilla/5.0 Chrome/120' },
    }),
    { STATS_DB: db },
  );
  assert.equal(res.status, 403);
  assert.equal(db.rows.length, 0);
});

test('handleHit: verified Origin rewrites host to mirror hostname', async () => {
  resetRateLimit();
  const db = stubDb();
  const res = await handleHit(
    stubRequest({
      body: { v: 1, event: 'pv', host: 'spoofed.example' },
      headers: { origin: 'https://miniarcade.pages.dev', 'user-agent': 'Mozilla/5.0 Chrome/120' },
    }),
    { STATS_DB: db },
  );
  assert.equal(res.status, 204);
  assert.equal(db.rows[0][2], 'miniarcade.pages.dev');
});

test('handleHit: rate limit trips at 31st hit from one IP', async () => {
  resetRateLimit();
  const db = stubDb();
  const env = { STATS_DB: db };
  let last = null;
  for (let i = 0; i < 31; i += 1) {
    last = await handleHit(
      stubRequest({
        body: { v: 1, event: 'pv', host: 'x' },
        headers: { 'user-agent': 'Mozilla/5.0 Chrome/120', 'cf-connecting-ip': '1.2.3.4' },
      }),
      env,
    );
  }
  assert.equal(last.status, 429);
  resetRateLimit();
});

test('isRateLimited is per-IP and windowed', () => {
  resetRateLimit();
  const req = (ip) => stubRequest({ headers: { 'cf-connecting-ip': ip } });
  for (let i = 0; i < 30; i += 1) assert.equal(isRateLimited(req('9.9.9.9'), 1000), false);
  assert.equal(isRateLimited(req('9.9.9.9'), 1000), true);
  assert.equal(isRateLimited(req('8.8.8.8'), 1000), false);
  assert.equal(isRateLimited(req('9.9.9.9'), 1000 + 61_000), false);
  resetRateLimit();
});
