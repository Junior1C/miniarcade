// Источник игры для бейджа на карточке: единый для всех игр,
// без деления интерфейса (слово «мост» — только внутренний термин
// сборки, посетителю показываем источник).
// Портал определяем по РЕПОЗИТОРИЮ-донору (откуда взято), а не по
// хосту игровой страницы: игра может быть задеплоена куда угодно
// (vercel.app, netlify.app, личный домен), а код взят с GitHub/GitLab.
// href — куда ссылаюсь: страница донора (совпадает с «исходник ↗» в плеере).
// Своя игра (нет url) — MiniArcade без ссылки.
// Чистый модуль без зависимостей — покрыт node --test.
export function gameSource(game) {
  if (!game || typeof game.url !== 'string' || !game.url) {
    return { key: 'miniarcade', label: 'MiniArcade', external: false, href: null };
  }
  const donor = typeof game.repo === 'string' && game.repo ? game.repo : game.url;
  const host = hostOf(donor) ?? hostOf(game.url);
  if (!host) return { key: 'web', label: 'Web', external: true, href: donor };
  if (host === 'github.com' || host.endsWith('.github.io')) {
    return { key: 'github', label: 'GitHub', external: true, href: donor };
  }
  if (host === 'gitlab.com' || host.endsWith('.gitlab.io')) {
    return { key: 'gitlab', label: 'GitLab', external: true, href: donor };
  }
  const bare = host.startsWith('www.') ? host.slice(4) : host;
  const key = bare.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'web';
  return { key, label: bare, external: true, href: donor };
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
