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
  if (host.cspHeader) {
    const csp = response.headers.get('content-security-policy');
    if (!csp) {
      throw new Error('missing Content-Security-Policy header');
    }
    // Распределённость: зеркало обязано разрешать фреймы мостов,
    // иначе каталог един, а игры на нём не открываются.
    for (const token of ['frame-src', 'bocaletto-luca.github.io']) {
      if (!csp.includes(token)) {
        throw new Error(`CSP header is missing "${token}" (bridge origins out of sync?)`);
      }
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

const CHECKS = [
  ['home page', checkHome],
  ['robots.txt', checkRobots],
  ['sitemap.xml', checkSitemap],
  ['stats.html', checkStats],
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
