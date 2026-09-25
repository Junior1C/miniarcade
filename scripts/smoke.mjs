const HOSTS = [
  { name: 'GitHub Pages', url: 'https://junior1c.github.io/miniarcade/', cspHeader: false },
  { name: 'Cloudflare Pages', url: 'https://miniarcade.pages.dev/', cspHeader: true },
  { name: 'Vercel', url: 'https://miniarcades.vercel.app/', cspHeader: true },
];

const BODY_MARKERS = ['skip-link', 'MiniArcade', 'Content-Security-Policy'];

async function fetchText(url) {
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(25000) });
  return { response, text: await response.text() };
}

async function checkHome(host) {
  const { response, text } = await fetchText(host.url);
  if (response.status !== 200) throw new Error(`home page returned ${response.status}`);
  for (const marker of BODY_MARKERS) {
    if (!text.includes(marker)) throw new Error(`home page is missing marker "${marker}" (stale content?)`);
  }
  // SEO-дубли зеркал гасятся каноникалом на основной хостинг: все три
  // хоста обязаны отдавать одинаковый canonical, иначе — рассинхрон сборки.
  if (!text.includes('<link rel="canonical" href="https://junior1c.github.io/miniarcade/">')) {
    throw new Error('home page canonical is not the GitHub Pages URL (mirror desync?)');
  }
  if (host.cspHeader) {
    const csp = response.headers.get('content-security-policy');
    if (!csp) {
      throw new Error('missing Content-Security-Policy header');
    }
    // Распределённость: зеркало обязано разрешать фреймы мостов,
    // иначе каталог един, а игры на нём не открываются. Проверяем
    // директивы, а не один случайный origin: так трим allowlist не
    // роняет проверку, а рассинхрон мостов всё равно ловится.
    // connect-src со STATS_ORIGIN — второй контракт зеркал: иначе
    // beacon аналитики молча режется CSP на части зеркал.
    // report-uri — третий: без него нарушения CSP не видны в поле.
    for (const token of ['frame-src', 'connect-src', 'https://miniarcade.pages.dev', 'report-uri']) {
      if (!csp.includes(token)) {
        throw new Error(`CSP header is missing "${token}" (bridge origins out of sync?)`);
      }
    }
    // Заголовок обязан покрывать meta-политику страницы (GH Pages живёт
    // только на meta): каждая директива из <meta> должна быть в header,
    // иначе зеркала разъезжаются молча (прецедент 2026-09-24).
    const meta = text.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/);
    if (meta) {
      for (const directive of meta[1].split(';').map((part) => part.trim()).filter(Boolean)) {
        if (!csp.includes(directive)) {
          throw new Error(`CSP header is missing meta directive "${directive.slice(0, 60)}"`);
        }
      }
    }
    const hsts = response.headers.get('strict-transport-security');
    if (!hsts || !hsts.includes('max-age=')) {
      throw new Error('missing Strict-Transport-Security header');
    }
  }
}

async function checkRobots(host) {
  const { response, text } = await fetchText(new URL('robots.txt', host.url));
  if (response.status !== 200) throw new Error(`robots.txt returned ${response.status}`);
  if (!text.includes('Sitemap:')) throw new Error('robots.txt has no Sitemap directive');
}

async function checkSitemap(host) {
  const { response, text } = await fetchText(new URL('sitemap.xml', host.url));
  if (response.status !== 200) throw new Error(`sitemap.xml returned ${response.status}`);
  if (!text.includes('<urlset')) throw new Error('sitemap.xml is not a sitemap');
}

async function checkStats(host) {
  const { response, text } = await fetchText(new URL('stats.html', host.url));
  if (response.status !== 200) throw new Error(`stats.html returned ${response.status}`);
  for (const marker of ['stats-empty', 'Content-Security-Policy']) {
    if (!text.includes(marker)) throw new Error(`stats.html is missing marker "${marker}" (stale content?)`);
  }
}

async function checkNotFound(host) {
  // Неизвестный путь обязан быть 404, а не SPA-index: иначе битый деплой
  // маскируется под живую главную (прецедент pages.dev 2026-09-24).
  const { response } = await fetchText(new URL('definitely-not-a-page-xyz123', host.url));
  if (response.status !== 404) throw new Error(`unknown path returned ${response.status}, want 404`);
}

async function checkApi(host) {
  // Только preflight: OPTIONS ничего не пишет в D1, но проверяет,
  // что приёмник жив и CORS-контракт на месте. POST здесь не делаем —
  // каждый POST создал бы строку в прод-статистике.
  // Архитектура — единый коллектор на Cloudflare Pages: у GitHub Pages
  // и Vercel своего /api/hit нет (каталог шлёт beacon на pages.dev).
  if (host.name === 'GitHub Pages') return;
  const { status, headers } = await (async () => {
    const response = await fetch(new URL('api/hit', host.url), {
      method: 'OPTIONS',
      signal: AbortSignal.timeout(25000),
    });
    await response.text().catch(() => {});
    return { status: response.status, headers: response.headers };
  })();
  if (host.name === 'Vercel') {
    if (status !== 404) throw new Error(`/api/hit OPTIONS returned ${status}, want 404 (no collector on Vercel)`);
    return;
  }
  if (status !== 204) throw new Error(`/api/hit OPTIONS returned ${status}, want 204`);
  if (!headers.get('access-control-allow-origin')) {
    throw new Error('/api/hit OPTIONS has no CORS headers');
  }
}

const CHECKS = [
  ['home page', checkHome],
  ['robots.txt', checkRobots],
  ['sitemap.xml', checkSitemap],
  ['stats.html', checkStats],
  ['unknown path 404', checkNotFound],
  ['api/hit OPTIONS', checkApi],
];

const failures = [];
for (const host of HOSTS) {
  for (const [label, run] of CHECKS) {
    try {
      await run(host);
      console.log(`ok   ${host.name} — ${label}`);
    } catch (error) {
      failures.push(`${host.name} — ${label}: ${error.message}`);
      console.error(`FAIL ${host.name} — ${label}: ${error.message}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${HOSTS.length * CHECKS.length} live checks passed`);
}
