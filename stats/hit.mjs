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
    .prepare(
      'INSERT INTO events (ts, day, host, game, event, secs, country, ref_host, visitor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(meta.now, meta.day, hit.host, hit.game, hit.event, hit.secs, meta.country, hit.ref, hit.visitor ?? null)
    .run();
}

// Доверенные вебы-приёмники beacon: каталог един, зеркала известны.
// Origin/Referer проверяем только если заголовок есть (curl/e2e без
// Origin не режем); чужой Origin с телом — 403, host берём из Origin,
// а не из тела (иначе отравление разбивки по хостингам).
export const ALLOWED_HIT_ORIGINS = new Set([
  'https://junior1c.github.io',
  'https://miniarcade.pages.dev',
  'https://miniarcades.vercel.app',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'http://localhost:4174',
  'http://127.0.0.1:4174',
]);

// Best-effort троттлинг против спама в D1: 30 запросов/60с с одного IP.
// Память процесса (Pages/Worker могут дропать), поэтому лимит мягкий:
// честных пользователей не режет, потоп — да. Тесты сбрасывают через resetRateLimit().
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets = new Map();

export function resetRateLimit() {
  rateBuckets.clear();
}

function clientIp(request) {
  const headers = request.headers;
  const get = (name) => headers.get(name) || headers.get(name.toLowerCase());
  return (get('cf-connecting-ip') || get('x-forwarded-for') || get('x-real-ip') || 'unknown')
    .split(',')[0]
    .trim()
    .slice(0, 80);
}

export function isRateLimited(request, now = Date.now()) {
  const ip = clientIp(request);
  if (ip === 'unknown') return false;
  const hits = rateBuckets.get(ip) || [];
  const fresh = hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  fresh.push(now);
  rateBuckets.set(ip, fresh);
  return fresh.length > RATE_LIMIT_MAX;
}

export function requestOrigin(request) {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).origin;
    } catch {
      return '';
    }
  }
  const referer = request.headers.get('referer') || request.headers.get('referrer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return '';
    }
  }
  return '';
}

export function resolveHost(request, bodyHost) {
  const origin = requestOrigin(request);
  if (origin && ALLOWED_HIT_ORIGINS.has(origin)) {
    try {
      return new URL(origin).hostname;
    } catch {
      // ниже — fallback на тело.
    }
  }
  return bodyHost;
}

// Дневной анонимный посетитель (модель Plausible: без cookies, storage
// и отпечатков). Хеш считается из IP + User-Agent + день + соль и хранится
// вместо них: сырые IP/UA не попадают ни в базу, ни в логи. День внутри
// хеша даёт unlinkability между днями при ротации соли (STATS_SALT):
// вчерашний и сегодняшний визиты одного человека посчитать парой нельзя.
// Точность — в пределах ~10% от cookie-метода (NAT занижает, мобильные IP
// завышают); для рейтинга «уникальные игроки» этого достаточно, см. README.
// Без IP (dev, часть beacon) возвращаем '' — такие хиты в uniques не входят
// (COUNT DISTINCT игнорирует NULL), но в n/secs считаются как раньше.
export async function visitorHash(request, day, salt) {
  const ip = clientIp(request);
  if (!ip || ip === 'unknown') return '';
  const ua = String(request.headers.get('user-agent') || '').slice(0, 300);
  const input = `${day}\n${salt}\n${ip}\n${ua}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function statsSalt(env) {
  const salt = env && typeof env.STATS_SALT === 'string' ? env.STATS_SALT.trim() : '';
  // Фолбэк для dev/недоустановленного продан: хеш остаётся one-way,
  // но соль публична (см. README § «Аналитика» — задайте STATS_SALT).
  return salt || 'miniarcade-dev-salt-v1';
}

export const DEV_SALT = 'miniarcade-dev-salt-v1';

export function isDevSalt(env) {
  return statsSalt(env) === DEV_SALT;
}

export function corsHeaders(request) {
  // Beacon летит с 3 зеркал на один collector (pages.dev): вместо слепого
  // `*` отдаём эхо проверенного Origin (браузеры кэшируют по Vary: Origin),
  // пустой Origin (curl/beacon без заголовка) — как раньше `*`.
  // Учётных данных нет, поэтому `*` остаётся безопасным фолбэком.
  let allow = '*';
  try {
    const origin = request ? requestOrigin(request) : '';
    if (origin && ALLOWED_HIT_ORIGINS.has(origin)) allow = origin;
  } catch {
    // Фолбэк `*` ниже.
  }
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function handleHit(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders(request) });
  }
  // DNT уважаем и на сервере (второй рубеж после клиентского).
  if (request.headers.get('dnt') === '1') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (isBot(request.headers.get('user-agent'))) {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  // Чужой Origin/Referer с телом — не наша статистика: 403 до чтения D1.
  // Пустой Origin (curl, часть beacon) пропускаем — валидация тела ниже.
  const origin = requestOrigin(request);
  if (origin && !ALLOWED_HIT_ORIGINS.has(origin)) {
    return new Response('Forbidden', { status: 403, headers: corsHeaders(request) });
  }
  if (isRateLimited(request)) {
    return new Response('Too Many Requests', {
      status: 429,
      headers: { ...corsHeaders(request), 'Retry-After': '60' },
    });
  }
  if (!env || !env.STATS_DB) {
    return new Response('Stats DB is not bound', { status: 503, headers: corsHeaders(request) });
  }
  // Прод без STATS_SALT: хеши посетителей считаются на публичной соли —
  // брутфорс словаря IP/UA становится возможен. Сайт работает, но в лог
  // пишем предупреждение (видно в Pages/Worker Observability).
  if (isDevSalt(env) && (origin === 'https://miniarcade.pages.dev' || origin === 'https://junior1c.github.io' || origin === 'https://miniarcades.vercel.app')) {
    try {
      console.warn('STATS_SALT is not set: visitor hashes use public dev salt');
    } catch {
      // Логгер недоступен — статистика важнее.
    }
  }
  let body = null;
  try {
    body = await request.json();
  } catch {
    return new Response('Bad Request', { status: 400, headers: corsHeaders(request) });
  }
  const parsed = parseHit(body);
  if (!parsed.ok) {
    return new Response('Bad Request', { status: 400, headers: corsHeaders(request) });
  }
  // Host из проверенного Origin надёжнее тела: разбивку по зеркалам
  // нельзя отравить поддельным host в JSON.
  parsed.data.host = resolveHost(request, parsed.data.host);
  const now = Date.now();
  const day = dayOf(now);
  // Анонимный посетитель для uniques (Plausible-модель): сырые IP/UA
  // дальше этой функции не уходят. Пустой хеш → NULL в базе.
  const visitor = await visitorHash(request, day, statsSalt(env));
  parsed.data.visitor = visitor || null;
  try {
    await insertHit(db(env), parsed.data, { now, day, country: countryOf(request.headers) });
  } catch {
    return new Response('Internal Server Error', { status: 500, headers: corsHeaders(request) });
  }
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

function db(env) {
  return env.STATS_DB;
}
