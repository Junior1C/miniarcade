// Cloudflare Worker зеркала MiniArcade (РУЧНАЯ активация, см. README).
//
// Зачем он нужен: слой, который сейчас раздаёт miniarcade.pages.dev,
// отдаёт все заголовки из _headers КРОМЕ Content-Security-Policy,
// добавляет чужой Access-Control-Allow-Origin: * и отвечает SPA-index
// (200 text/html) на неизвестных путях — включая /functions/*.
// Этот воркер вместо этого:
// - ставит ПОЛНЫЙ prod-набор заголовков программно (включая CSP
//   с frame-src мостов и рабочий frame-ancestors 'self' — в HTTP
//   он действует, в отличие от <meta>);
// - раздаёт статику из ASSETS-биндинга;
// - обслуживает POST /api/hit тем же чистым stats/hit.mjs, что и
//   Pages Function (без привязки STATS_DB отвечает 503 — так же тихо);
// - отдаёт 404 (а не index) на неизвестных путях и блокирует
//   исходники/тулинг (/functions/, /scripts/, /stats/*.mjs …),
//   которые статике светить нечего.
//
// Безопасная активация: `wrangler deploy` публикует воркер на
// miniarcade.<subdomain>.workers.dev и НЕ трогает pages.dev — переключение
// трафика делается отдельно в dashboard (Routes). Откат — удалить роут.
import { handleHit } from './stats/hit.mjs';
import { prodSecurityHeaders } from './scripts/security-headers.mjs';

// Статика эти пути раздавать не должна (в stock-Pages functions/
// компилируется, а не светится наружу).
const BLOCKED_PREFIXES = [
  '/functions/',
  '/scripts/',
  '/tests/',
  '/stats/',
  '/.github/',
  '/.githooks/',
  '/node_modules/',
  '/test-results/',
];
const BLOCKED_SUFFIXES = ['/meta.json'];
const BLOCKED_EXACT = new Set([
  '/wrangler.jsonc',
  '/vercel.json',
  '/package.json',
  '/package-lock.json',
  '/.assetsignore',
  '/_headers',
]);

export function isBlocked(pathname) {
  if (BLOCKED_EXACT.has(pathname)) return true;
  if (BLOCKED_SUFFIXES.some((suffix) => pathname.endsWith(suffix))) return true;
  return BLOCKED_PREFIXES.some(
    (prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix),
  );
}

export function withSecurity(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(prodSecurityHeaders())) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleApi(request, env) {
  const res = await handleHit(request, env);
  // CORS-заголовки handleHit сохраняем, докидываем базовую защиту.
  const headers = new Headers(res.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return new Response(res.body, { status: res.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/hit') return handleApi(request, env);
    if (url.pathname.startsWith('/api/')) {
      return new Response('Not Found', { status: 404 });
    }
    if (isBlocked(url.pathname)) {
      return new Response('Not Found', { status: 404 });
    }
    const asset = await env.ASSETS.fetch(request);
    if (asset.status === 404) {
      return new Response('Not Found', { status: 404 });
    }
    return withSecurity(asset);
  },
};
