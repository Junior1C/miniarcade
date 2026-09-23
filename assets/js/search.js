export function normalizeQuery(value) {
  return String(value ?? '').trim().toLocaleLowerCase('ru');
}

export function matchesQuery(game, normalizedQuery) {
  if (!normalizedQuery) return true;
  const haystack = [game.title, game.description, ...(game.tags ?? [])]
    .join('\n')
    .toLocaleLowerCase('ru');
  return haystack.includes(normalizedQuery);
}

export function filterGames(games, query) {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return games;
  return games.filter((game) => matchesQuery(game, normalizedQuery));
}
