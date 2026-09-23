// Чистая логика приёмника аналитики (без привязки к рантайму —
// покрывается node --test со стаб-окружением).
// Храним минимум: никаких IP, UA, cookies и отпечатков.
// День (UTC), хостинг, игра, событие, секунды, страна (из заголовка CF),
// hostname реферера. Этого хватает на «визиты + кто во что играл + с
// какого зеркала», и ничего лишнего.
export const EVENTS = new Set(['pv', 'open', 'close']);

const GAME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HOST_PATTERN = /^[a-z0-9.-]{1,253}$/i;

// Подстроки ботов/мониторинга/автоматики (свои e2e тоже отсекаем).
const BOT_PATTERN =
  /bot|crawl|slurp|spider|mediapartners|baidu|yandex|sogou|exabot|facebot|ia_archiver|headless|playwright|phantom|selenium|python-|python\/|curl|wget|node-fetch|axios|go-http|java\/|ruby|perl|monitor|uptime|pingdom|nagios|prometheus|grafana|datadog|newrelic/i;

export function isBot(userAgent) {
  return BOT_PATTERN.test(String(userAgent || ''));
}

function refHost(ref) {
  try {
    return new URL(ref).hostname.slice(0, 200) || '';
  } catch {
    return '';
  }
}

export function parseHit(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad body' };
  if (body.v !== 1) return { ok: false, error: 'bad version' };
  if (!EVENTS.has(body.event)) return { ok: false, error: 'bad event' };
  const host = String(body.host || '');
  if (!HOST_PATTERN.test(host)) return { ok: false, error: 'bad host' };
  let game = '';
  if (body.event === 'open' || body.event === 'close') {
    game = String(body.game || '');
    if (!GAME_ID_PATTERN.test(game) || game.length > 64) {
      return { ok: false, error: 'bad game' };
    }
  }
  let secs = 0;
  if (body.event === 'close') {
    secs = Number(body.secs);
    if (!Number.isFinite(secs)) return { ok: false, error: 'bad secs' };
    secs = Math.max(0, Math.min(43200, Math.round(secs)));
  }
  return { ok: true, data: { host, game, event: body.event, secs, ref: refHost(body.ref) } };
}

export function countryOf(headers) {
  const country = String(headers.get('cf-ipcountry') || '').toUpperCase();
  return /^[A-Z]{2}$/.test(country) ? country : '';
}

export function dayOf(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export async function insertHit(db, hit, meta) {
  await db
    .prepare('INSERT INTO events (ts, day, host, game, event, secs, country, ref_host) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(meta.now, meta.day, hit.host, hit.game, hit.event, hit.secs, meta.country, hit.ref)
    .run();
}

export function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function handleHit(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders() });
  }
  // DNT уважаем и на сервере (второй рубеж после клиентского).
  if (request.headers.get('dnt') === '1') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (isBot(request.headers.get('user-agent'))) {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (!env || !env.STATS_DB) {
    return new Response('Stats DB is not bound', { status: 503, headers: corsHeaders() });
  }
  let body = null;
  try {
    body = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400, headers: corsHeaders() });
  }
  const parsed = parseHit(body);
  if (!parsed.ok) {
    return new Response('Bad Request', { status: 400, headers: corsHeaders() });
  }
  const now = Date.now();
  try {
    await insertHit(db(env), parsed.data, { now, day: dayOf(now), country: countryOf(request.headers) });
  } catch {
    return new Response('Internal Server Error', { status: 500, headers: corsHeaders() });
  }
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function db(env) {
  return env.STATS_DB;
}
