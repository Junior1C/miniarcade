// Нормализованный поисковый индекс игры кэшируется в WeakMap:
// при сотнях игр повторная фильтрация (каждый ввод в поиск) не
// lower-case'ит одни и те же строки заново — важно для INP.
// Кэш привязан к объекту игры, поэтому пересборка каталога
// (новые объекты) автоматически даёт свежий индекс.
import { gameSource } from './source.js';

const haystackCache = new WeakMap();

export function normalizeQuery(value) {
  return String(value ?? '').trim().toLocaleLowerCase('ru');
}

export function getHaystack(game) {
  let cached = haystackCache.get(game);
  if (cached === undefined) {
    // Источник (GitHub/GitLab/MiniArcade/домен) — часть индекса:
    // запрос «gitlab» находит игры с GitLab.
    cached = [game.title, game.description, ...(game.tags ?? []), ...(game.author ? [game.author] : []), gameSource(game).label]
      .join('\n')
      .toLocaleLowerCase('ru');
    haystackCache.set(game, cached);
  }
  return cached;
}

export function matchesQuery(game, normalizedQuery) {
  if (!normalizedQuery) return true;
  return getHaystack(game).includes(normalizedQuery);
}

export function filterGames(games, query) {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return games;
  return games.filter((game) => matchesQuery(game, normalizedQuery));
}
