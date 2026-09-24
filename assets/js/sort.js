// Сортировка каталога по поведенческим метрикам (без DOM — node --test).
// Цифры — data/stats/totals.json (ночной агрегат D1 за 90 дней).
// top: уникальные игроки (open), затем запуски — людей больше, чем кликов.
// popular: суммарные секунды игры (close). alpha: название (ru).
// new: added из meta.json, без даты — в конец.
import { pluralizeRu } from './format.js';

export const SORT_MODES = ['top', 'popular', 'alpha', 'new'];

export const SORT_LABELS = {
  top: 'По рейтингу',
  popular: 'Популярное',
  alpha: 'По алфавиту',
  new: 'Новые',
};

export function validSortMode(mode) {
  return SORT_MODES.includes(mode) ? mode : 'top';
}

// totals: строки {game, event, n, secs, uniques}; хосты схлопываем.
export function buildGameStats(totals) {
  const map = new Map();
  for (const row of totals) {
    if (!row || !row.game) continue;
    const entry = map.get(row.game) || { opens: 0, uniques: 0, secs: 0 };
    if (row.event === 'open') {
      entry.opens += Number(row.n) || 0;
      entry.uniques += Number(row.uniques) || 0;
    } else if (row.event === 'close') {
      entry.secs += Number(row.secs) || 0;
    }
    map.set(row.game, entry);
  }
  return map;
}

function statsOf(stats, id) {
  return (stats && stats.get(id)) || { opens: 0, uniques: 0, secs: 0 };
}

function compareTitle(a, b) {
  return String(a.title).localeCompare(String(b.title), 'ru');
}

export function compareGames(mode, stats) {
  switch (mode) {
    case 'popular':
      return (a, b) =>
        statsOf(stats, b.id).secs - statsOf(stats, a.id).secs ||
        statsOf(stats, b.id).opens - statsOf(stats, a.id).opens ||
        compareTitle(a, b);
    case 'alpha':
      return (a, b) => compareTitle(a, b);
    case 'new':
      return (a, b) => (b.added || '').localeCompare(a.added || '') || compareTitle(a, b);
    case 'top':
    default:
      return (a, b) =>
        statsOf(stats, b.id).uniques - statsOf(stats, a.id).uniques ||
        statsOf(stats, b.id).opens - statsOf(stats, a.id).opens ||
        compareTitle(a, b);
  }
}

export function sortGames(games, mode, stats) {
  return [...games].sort(compareGames(validSortMode(mode), stats));
}

// «45 сек» / «12 мин» / «3 ч» для строки на карточке.
export function formatPlayTime(totalSecs) {
  const secs = Math.max(0, Math.round(Number(totalSecs) || 0));
  if (secs < 60) return `${secs} сек`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} мин`;
  return `${Math.floor(mins / 60)} ч`;
}

// «14 запусков · 9 игроков · 15 мин». Пусто без данных — не врём.
export function cardStatsLine(stats, id) {
  const { opens, uniques, secs } = statsOf(stats, id);
  if (!opens) return '';
  const plays = `${opens} ${pluralizeRu(opens, 'запуск', 'запуска', 'запусков')}`;
  const players = `${uniques} ${pluralizeRu(uniques, 'игрок', 'игрока', 'игроков')}`;
  return secs > 0 ? `${plays} · ${players} · ${formatPlayTime(secs)}` : `${plays} · ${players}`;
}
