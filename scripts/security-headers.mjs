// Single source of truth для security-заголовков каталога.
//
// Почему отдельный модуль, а не копипаст в 3 местах:
// _headers (Cloudflare), vercel.json (Vercel) и scripts/serve.mjs (локальный
// dev-сервер) обязаны отдавать одинаковую политику. Тест tests/headers.test.mjs
// сверяет их с этими константами на каждый `npm test`.
//
// Различие dev/prod осознанное и единственное:
// - prod добавляет `upgrade-insecure-requests` (там всегда HTTPS);
// - локально (`http://localhost:4173`) этот токен запрещён — иначе браузер
//   попытается уйти на https://localhost и dev-стенд сломается.
//
// Мост к внешним играм (каталог ссылается, код не копирует):
// frame-src разрешает ТОЛЬКО эти origins. build.mjs сверяет hostname
// каждого моста с этим списком, tests/headers.test.mjs — оба направления
// (мост без origin и origin без моста валят тесты).
export const FRAME_SRC_ORIGINS = [
  'https://gabrielecirulli.github.io',
  'https://wayou.github.io',
  'https://ellisonleao.github.io',
  'https://wwwtyro.github.io',
  'https://iamkun.github.io',
  'https://taniarascia.github.io',
  'https://flexboxfroggy.com',
  'https://cssgridgarden.com',
  'https://sandspiel.club',
  'https://victorribeiro.com',
  'https://muan.co',
  'https://demian.ferrei.ro',
  'https://duckhuntjs.com',
];
export const CSP_CORE = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "connect-src 'self'",
  `frame-src 'self' about: ${FRAME_SRC_ORIGINS.join(' ')}`,
  "object-src 'none'",
  "frame-ancestors 'self'",
].join('; ');

export const CSP_PROD = `${CSP_CORE}; upgrade-insecure-requests`;
export const CSP_DEV = CSP_CORE;

export const PERMISSIONS_POLICY =
  'camera=(), microphone=(), geolocation=(), payment=(), usb=()';

export const REFERRER_POLICY = 'strict-origin-when-cross-origin';

// Изоляция верхнего контекста: у каталога нет OAuth/popup-флоу,
// плеер — <dialog>, а не window.open, поэтому same-origin безопасен.
// CORP осознанно НЕ ставим: игры грузятся в sandbox с opaque origin,
// и `same-origin` мог бы заблокировать iframe на части движков.
export const CROSS_ORIGIN_OPENER_POLICY = 'same-origin';

export function devSecurityHeaders() {
  return {
    'Content-Security-Policy': CSP_DEV,
    'Permissions-Policy': PERMISSIONS_POLICY,
    'Referrer-Policy': REFERRER_POLICY,
    'Cross-Origin-Opener-Policy': CROSS_ORIGIN_OPENER_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
  };
}

export function prodSecurityHeaders() {
  return {
    ...devSecurityHeaders(),
    'Content-Security-Policy': CSP_PROD,
  };
}
