export async function loadCatalog(url = 'data/catalog.json') {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Catalog request failed with status ${response.status}`);
  }
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.games)) {
    throw new Error('Catalog payload is malformed');
  }
  for (const entry of payload.games) {
    if (
      typeof entry.id !== 'string' ||
      typeof entry.title !== 'string' ||
      typeof entry.file !== 'string'
    ) {
      throw new Error('Catalog contains an invalid game entry');
    }
  }
  return payload.games;
}
