// Ядро темы главной (критический путь): ключи, чтение, применение.
// Без DOM — node --test со стаб-стилем. Значения по умолчанию живут
// в :root main.css; подписи/экспорт — в settings.js (ленивый импорт).
export const THEME_KEY = 'miniarcade-theme';

export const THEME_KEYS = [
  '--bg',
  '--surface',
  '--text',
  '--text-muted',
  '--accent',
  '--violet',
  '--violet-deep',
  '--danger',
];

export function isHexColor(value) {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

// Читаем сохранённое (только валидные hex, мусор игнорируем).
export function loadTheme(storage) {
  const theme = {};
  let raw = null;
  try {
    raw = storage ? storage.getItem(THEME_KEY) : null;
  } catch {
    return theme;
  }
  if (!raw) return theme;
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return theme;
  }
  if (!parsed || typeof parsed !== 'object') return theme;
  for (const key of THEME_KEYS) {
    if (isHexColor(parsed[key])) theme[key] = parsed[key].toLowerCase();
  }
  return theme;
}

// Применяем поверх CSS: inline-переменные на root бьют :root из main.css.
// Пустое значение снимает override (возврат к стилю проекта).
export function applyTheme(root, theme) {
  if (!root || !theme) return;
  const style = root.style;
  if (!style || typeof style.setProperty !== 'function') return;
  for (const key of THEME_KEYS) {
    if (isHexColor(theme[key])) style.setProperty(key, theme[key]);
    else if (typeof style.removeProperty === 'function') style.removeProperty(key);
  }
}
