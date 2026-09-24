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
  'https://wayou.github.io',
  'https://ellisonleao.github.io',
  'https://wwwtyro.github.io',
  'https://iamkun.github.io',
  'https://taniarascia.github.io',
  'https://flexboxfroggy.com',
  'https://cssgridgarden.com',
  'https://sandspiel.club',
  'https://victorribeiro.com',
  'https://muan.github.io',
  'https://duckhuntjs.com',
  'https://milsaware.github.io',
  'https://monkeyarms.github.io',
  'https://passer-by.com',
  'https://gcedo.github.io',
  'https://pshenok.github.io',
  'https://maxwellito.github.io',
  'https://billmei.github.io',
  'https://jasonlawrencewong.com',
  'https://www.lightsout.ir',
  'https://killedbyapixel.github.io',
  'https://bocaletto-luca.github.io',
  'https://www.mnimi.ir',
  'https://ab.muan.co',
  'https://vmikhav.github.io',
  'https://aerolab.github.io',
  'https://patorjk.github.io',
  'https://binaryify.github.io',
  'https://flbulgarelli.github.io',
  'https://silent-lad.github.io',
  'https://mateuszsokola.github.io',
  'https://selenebun.github.io',
  'https://handsomeone.github.io',
  'https://sibartlett.github.io',
  'https://itlwei.github.io',
  'https://clashjs.com',
  'https://frogger.adrianeyre.co.uk',
  'https://3kh0.github.io',
  'https://rfranks.github.io',
  'https://ryan-menezes.github.io',
  'https://ai-asteroids.richlewis007.com',
  'https://omariosouto.github.io',
  'https://www.iammaximo.com',
  'https://ramazancetinkaya.github.io',
  'https://yelynn1.github.io',
  'https://grimmer.io',
  'https://tictactoe.ucef.dev',
  'https://akicho8.github.io',
  'https://shenzhen-solitaire.tgratzer.com',
  'https://asteinheiser.github.io',
  'https://berkerol.github.io',
  'https://ajlovechina.github.io',
  'https://spookyball.com',
  // Волна 2026-09: +50 лёгких мостов (верифицированы: HTTP 200, iframe-тест,
  // лицензия; переезды зафиксированы финальным URL — pixelrun, star-battle).
  'https://4ark.me',
  'https://adamstirtan.github.io',
  'https://akaspanion.github.io',
  'https://akki-jaiswal.github.io',
  'https://alperencbn05.github.io',
  'https://angeluriot.com',
  'https://antonmedv.github.io',
  'https://armin-panahi.github.io',
  'https://attilahorvath.github.io',
  'https://bazhanius.github.io',
  'https://bcastell.github.io',
  'https://bibhuticoder.github.io',
  'https://blockly.games',
  'https://bodhiprotocol.github.io',
  'https://brm.io',
  'https://canvas-td.teddy.io',
  'https://chloeliang.github.io',
  'https://chromegaming.github.io',
  'https://davidnhill.github.io',
  'https://flukeout.github.io',
  'https://frosetrain.github.io',
  'https://ffalt.github.io',
  'https://gideonadeti.github.io',
  'https://henshmi.github.io',
  'https://jack-kraus.github.io',
  'https://jonatan5524.github.io',
  'https://krishealty.github.io',
  'https://kschuetz.github.io',
  'https://liukun2634.github.io',
  'https://lrq3000.github.io',
  'https://marouanbouderz.github.io',
  'https://nvios.github.io',
  'https://ogeon.github.io',
  'https://ovolve.github.io',
  'https://pacman.platzh1rsch.ch',
  'https://pieterd7.github.io',
  'https://pixelrun.localplayer.dev',
  'https://pwmarcz.pl',
  'https://quindici.io',
  'https://segheysens.github.io',
  'https://shifulegend.github.io',
  'https://takosenpai2687.github.io',
  'https://tassaron.com',
  'https://tetris-artificial-intelligence.github.io',
  'https://theinfamousgrim.github.io',
  'https://voxdroid.github.io',
  'https://wdfeer.github.io',
  'https://xviniette.github.io',
  'https://zombie-attack.netlify.app',
];
// Приёмник аналитики: один origin на все зеркала (Pages Function
// живёт на miniarcade.pages.dev и принимает beacon отовсюду).
// Тест проверяет, что connect-src его содержит во всех трёх носителях.
export const STATS_ORIGIN = 'https://miniarcade.pages.dev';
// CSP-отчёты о нарушениях: отдельный лёгкий endpoint (204, без записи),
// чтобы видеть рассинхрон frame-src и инъекции в поле, а не вслепую.
export const CSP_REPORT_URI = 'https://miniarcade.pages.dev/api/csp-report';
export const CSP_CORE = [
  "default-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  `connect-src 'self' ${STATS_ORIGIN}`,
  `frame-src 'self' about: ${FRAME_SRC_ORIGINS.join(' ')}`,
  "object-src 'none'",
  "frame-ancestors 'self'",
].join('; ');

export const CSP_PROD = `${CSP_CORE}; report-uri ${CSP_REPORT_URI}; upgrade-insecure-requests`;
export const CSP_DEV = CSP_CORE;

// CSP для <meta>-тега (GitHub Pages не умеет HTTP-заголовки):
// та же prod-политика, но БЕЗ frame-ancestors и report-uri — спека их
// в <meta> игнорирует, браузер только шумит в консоль («ignored when
// delivered via a <meta> element»), защиты ноль. Реальный канал отчётов —
// HTTP-заголовки (_headers, vercel.json, serve.mjs, worker.mjs).
export const CSP_META = CSP_PROD.split('; ')
  .filter((directive) => !directive.startsWith('frame-ancestors') && !directive.startsWith('report-uri'))
  .join('; ');

// HSTS целиком отдан хостингам через HTTP-заголовки (в <meta> не работает).
// Только prod: локально http://localhost с HSTS сломался бы.
export const STRICT_TRANSPORT_SECURITY = 'max-age=31536000; includeSubDomains; preload';

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
    'Strict-Transport-Security': STRICT_TRANSPORT_SECURITY,
  };
}
