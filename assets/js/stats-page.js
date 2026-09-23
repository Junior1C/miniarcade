// Чистые функции витрины статистики (без DOM на верхнем уровне —
// покрываются node --test). Рендер ниже использует их же.
import { pluralizeRu } from './format.js';

export function sumBy(rows, event, field = 'n') {
  let total = 0;
  for (const row of rows) {
    if (row && row.event === event) total += Number(row[field]) || 0;
  }
  return total;
}

export function visitsByDay(daily) {
  const byDay = new Map();
  for (const row of daily) {
    if (!row || row.event !== 'pv' || typeof row.day !== 'string') continue;
    byDay.set(row.day, (byDay.get(row.day) || 0) + (Number(row.n) || 0));
  }
  return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(-30);
}

export function topGames(totals, limit = 10) {
  return totals
    .filter((row) => row && row.event === 'open' && row.game)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit);
}

export function opensByHost(totals) {
  const byHost = new Map();
  for (const row of totals) {
    if (!row || row.event !== 'open' || !row.host) continue;
    const entry = byHost.get(row.host) || { host: row.host, n: 0, secs: 0 };
    entry.n += Number(row.n) || 0;
    entry.secs += Number(row.secs) || 0;
    byHost.set(row.host, entry);
  }
  return [...byHost.values()].sort((a, b) => b.n - a.n);
}

export function formatDuration(totalSecs) {
  const secs = Math.max(0, Math.round(Number(totalSecs) || 0));
  if (secs < 60) return `${secs} ${pluralizeRu(secs, 'секунда', 'секунды', 'секунд')}`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} ${pluralizeRu(mins, 'минута', 'минуты', 'минут')}`;
  const hours = Math.floor(mins / 60);
  const rest = mins % 60;
  return `${hours} ${pluralizeRu(hours, 'час', 'часа', 'часов')} ${rest} ${pluralizeRu(rest, 'минута', 'минуты', 'минут')}`;
}

// Ширина полоски бара квантуется в бакеты по 5% и кладётся в data-v.
// Почему не inline style: CSP style-src 'self' режет style-атрибуты
// (в т.ч. выставленные через el.style), полоски остались бы нулевыми.
// Классы/селекторы по data-v живут в main.css — CSP их не трогает.
export function widthBucket(value, max) {
  if (!(max > 0) || !(value > 0)) return 0;
  return Math.min(100, Math.max(5, Math.round((value / max) * 20) * 5));
}

function barRow(label, value, max, unit) {
  const item = document.createElement('li');
  item.className = 'stats-bar';
  const name = document.createElement('span');
  name.className = 'stats-bar__label';
  name.textContent = label;
  const track = document.createElement('span');
  track.className = 'stats-bar__track';
  track.setAttribute('aria-hidden', 'true');
  const fill = document.createElement('span');
  fill.className = 'stats-bar__fill';
  fill.dataset.v = String(widthBucket(value, max));
  track.append(fill);
  const count = document.createElement('span');
  count.className = 'stats-bar__value';
  count.textContent = unit;
  item.append(name, track, count);
  return item;
}

function renderSummary(totals) {
  const visits = sumBy(totals, 'pv');
  const opens = sumBy(totals, 'open');
  const secs = sumBy(totals, 'close', 'secs');
  const cards = [
    ['Визиты', `${visits}`],
    ['Запуски игр', `${opens}`],
    ['Время в играх', formatDuration(secs)],
  ];
  const list = document.getElementById('stats-summary');
  list.replaceChildren();
  for (const [label, value] of cards) {
    const item = document.createElement('li');
    item.className = 'stats-card';
    const big = document.createElement('span');
    big.className = 'stats-card__value';
    big.textContent = value;
    const caption = document.createElement('span');
    caption.className = 'stats-card__label';
    caption.textContent = label;
    item.append(big, caption);
    list.append(item);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function init() {
  const status = document.getElementById('stats-status');
  try {
    const [daily, totalsPayload] = await Promise.all([
      fetchJson('data/stats/daily.json'),
      fetchJson('data/stats/totals.json'),
    ]);
    const totals = Array.isArray(totalsPayload.totals) ? totalsPayload.totals : totalsPayload;
    if ((!Array.isArray(daily) || daily.length === 0) && totals.length === 0) {
      throw new Error('empty');
    }
    renderSummary(totals);

    const days = visitsByDay(daily);
    const daysMax = Math.max(0, ...days.map(([, n]) => n));
    const daysEl = document.getElementById('stats-days');
    daysEl.replaceChildren();
    for (const [day, n] of days) {
      daysEl.append(barRow(day.slice(5), n, daysMax, `${n}`));
    }

    const games = topGames(totals);
    const gamesMax = Math.max(0, ...games.map((row) => row.n));
    const gamesEl = document.getElementById('stats-games');
    gamesEl.replaceChildren();
    for (const row of games) {
      gamesEl.append(barRow(row.game, row.n, gamesMax, `${row.n}`));
    }

    const hosts = opensByHost(totals);
    const hostsMax = Math.max(0, ...hosts.map((row) => row.n));
    const hostsEl = document.getElementById('stats-hosts');
    hostsEl.replaceChildren();
    for (const row of hosts) {
      hostsEl.append(barRow(row.host, row.n, hostsMax, `${row.n}`));
    }

    status.textContent = totalsPayload.generatedAt
      ? `Обновлено: ${String(totalsPayload.generatedAt).slice(0, 10)}`
      : '';
    document.getElementById('stats-empty').hidden = true;
  } catch (error) {
    // Пустые данные — нормальное состояние (ночной забор ещё не работал
    // или зеркало без data/stats): показываем пустое состояние молча,
    // как и beacon в stats.js — тихо no-op. Логируем только настоящие сбои.
    const quiet =
      error instanceof Error && (error.message === 'empty' || error.message === 'HTTP 404');
    if (!quiet) console.error(error);
    status.textContent = '';
    document.getElementById('stats-empty').hidden = false;
  }
}

if (typeof document !== 'undefined') {
  init();
}
