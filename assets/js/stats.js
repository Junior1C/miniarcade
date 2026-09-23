// Сквозная аналитика каталога: pv (визит), open/close игры с длительностью.
// Принципы: без cookies и storage, без отпечатков, уважение DNT,
// тихий no-op вне продакшн-зеркал (localhost/127 — только с ?stats=1,
// чтобы e2e и dev не пачкали прод-статистику). Ошибки сети глушатся:
// каталог обязан работать даже при мёртвом приёмнике.
export const STATS_URL = 'https://miniarcade.pages.dev/api/hit';

const GAME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function statsEnabled() {
  try {
    // DNT — жёсткий запрет всегда, даже с явным opt-in.
    if (typeof navigator !== 'undefined' && navigator.doNotTrack === '1') return false;
    const { hostname, search } = location;
    // Явный opt-in (?stats=1) перевешивает эвристики: так e2e проверяет
    // проводку, а боты параметр не ставят.
    if (new URLSearchParams(search).has('stats')) return true;
    if (typeof navigator !== 'undefined' && /headless|playwright|phantom|selenium/i.test(navigator.userAgent || '')) {
      return false;
    }
    if (hostname === 'localhost' || hostname === '127.0.0.1') return false;
    return true;
  } catch {
    return false;
  }
}

export function validGameId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 64 && GAME_ID_PATTERN.test(id);
}

export function sendStats(event, fields = {}) {
  try {
    if (event !== 'pv' && event !== 'open' && event !== 'close') return;
    if ((event === 'open' || event === 'close') && !validGameId(fields.game)) return;
    const body = JSON.stringify({
      v: 1,
      event,
      host: location.hostname.slice(0, 253),
      game: typeof fields.game === 'string' ? fields.game.slice(0, 64) : undefined,
      secs: Number.isFinite(fields.secs) ? Math.max(0, Math.min(43200, Math.round(fields.secs))) : undefined,
      path: location.pathname.slice(0, 200),
      ref: typeof document.referrer === 'string' ? document.referrer.slice(0, 200) : undefined,
    });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(STATS_URL, body)) return;
    }
    fetch(STATS_URL, { method: 'POST', body, keepalive: true }).catch(() => {});
  } catch {
    // Статистика никогда не ломает каталог.
  }
}
