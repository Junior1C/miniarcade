// Личные рекорды каталога: игры живут в sandbox с opaque origin
// (storage запрещён) и шлют счёт родителю через postMessage, а портал
// хранит best в своём localStorage. Внутриигровой best — рекорд сессии.
// Модуль крошечный и синхронный — импортируется и критическим путём
// (строка на карточке), и deferred-плеером (приём сообщений).
export const BEST_PREFIX = 'miniarcade-best:';
export const SCORE_GAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCORE_MAX = 1000000000;

export function bestOf(gameId) {
  try {
    const value = Math.floor(Number(localStorage.getItem(BEST_PREFIX + gameId)));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

// Возвращает true, только если рекорд реально записан.
export function storeBest(gameId, score) {
  const value = Math.floor(Number(score));
  if (!SCORE_GAME_RE.test(String(gameId || ''))) return false;
  if (!Number.isFinite(value) || value <= 0 || value > SCORE_MAX) return false;
  try {
    if (value > bestOf(gameId)) {
      localStorage.setItem(BEST_PREFIX + gameId, String(value));
    }
    return true;
  } catch {
    return false;
  }
}

export function isScoreMessage(data) {
  return Boolean(data) && data.type === 'miniarcade:score';
}
