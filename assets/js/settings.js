// Панель «Оформление»: ленивый импорт по первому клику.
// Превью, localStorage, сброс, экспорт JSON мейнтейнеру.
import { THEME_KEYS, applyTheme, isHexColor, loadTheme } from './theme.js';

// Подписи и дефолты (= :root в main.css) нужны только панели.
const THEME_LABELS = {
  '--bg': ['Фон страницы', '#04060d'],
  '--surface': ['Поверхности', '#0a0f1e'],
  '--text': ['Текст', '#e8edff'],
  '--text-muted': ['Приглушённый текст', '#8b98b8'],
  '--accent': ['Акцент синий', '#5b8def'],
  '--violet': ['Акцент фиолет', '#a78bfa'],
  '--violet-deep': ['Фиолет глубокий', '#8b5cf6'],
  '--danger': ['Опасность', '#ef4444'],
};

export function saveTheme(storage, theme) {  try {
    storage.setItem('miniarcade-theme', JSON.stringify(theme));
  } catch {
    // Приватный режим — просто не запомнится.
  }
}

export function clearTheme(storage) {
  try {
    storage.removeItem('miniarcade-theme');
  } catch {
    // Нечего чистить.
  }
}

// Экспорт: JSON для отправки мейнтейнеру.
export function serializeTheme(theme) {
  const full = {};
  for (const key of THEME_KEYS) {
    const fallback = (THEME_LABELS[key] || [])[1] || '#000000';
    full[key] = isHexColor(theme[key]) ? theme[key] : fallback;
  }
  return { json: JSON.stringify(full) };
}

// Импорт обратно (вставка из буфера): только валидные hex.
export function parseTheme(text) {
  const theme = {};
  if (!text || typeof text !== 'string') return theme;
  let parsed = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    return theme;
  }
  if (!parsed || typeof parsed !== 'object') return theme;
  for (const key of THEME_KEYS) {
    if (isHexColor(parsed[key])) theme[key] = parsed[key].toLowerCase();
  }
  return theme;
}

function rowFor(doc, root, storage, theme, key) {
  const [label, fallback] = THEME_LABELS[key] || [key, '#000000'];
  const row = doc.createElement('div');
  row.className = 'theme-row';
  const text = doc.createElement('label');
  text.className = 'theme-row__label';
  const current = isHexColor(theme[key]) ? theme[key] : fallback;
  text.textContent = label;
  const picker = doc.createElement('input');
  picker.className = 'theme-row__picker';
  picker.type = 'color';
  picker.value = current;
  picker.setAttribute('aria-label', `${label} (палитра)`);
  const hex = doc.createElement('input');
  hex.className = 'theme-row__hex';
  hex.value = current;
  hex.maxLength = 7;
  hex.spellcheck = false;
  hex.setAttribute('aria-label', `${label} (hex)`);
  const sync = (value, source) => {
    const v = String(value).trim().toLowerCase();
    if (!isHexColor(v)) return;
    theme[key] = v;
    if (source !== picker) picker.value = v;
    if (source !== hex) hex.value = v;
    applyTheme(root, theme);
    saveTheme(storage, theme);
  };
  picker.addEventListener('input', () => sync(picker.value, picker));
  hex.addEventListener('change', () => sync(hex.value, hex));
  row.append(text, picker, hex);
  return row;
}

export function openSettings(doc, root, storage) {
  const dialog = doc.getElementById('settings');
  const form = doc.getElementById('settings-form');
  const out = doc.getElementById('settings-export');
  if (!dialog || !form || typeof dialog.showModal !== 'function') return;
  const theme = loadTheme(storage);
  applyTheme(root, theme);
  form.replaceChildren();
  for (const key of THEME_KEYS) {
    form.append(rowFor(doc, root, storage, theme, key));
  }
  const buttons = doc.createElement('div');
  buttons.className = 'theme-actions';
  const copy = doc.createElement('button');
  copy.className = 'button button--secondary';
  copy.type = 'button';
  copy.textContent = 'Скопировать стиль';
  const reset = doc.createElement('button');
  reset.className = 'button button--secondary';
  reset.type = 'button';
  reset.textContent = 'Сбросить';
  const close = doc.createElement('button');
  close.className = 'button';
  close.type = 'button';
  close.textContent = 'Готово';
  copy.addEventListener('click', async () => {
    const { json } = serializeTheme({ ...theme });
    try {
      await navigator.clipboard.writeText(json);
      copy.textContent = 'Скопировано!';
    } catch {
      out.value = json;
      out.hidden = false;
      out.select();
      copy.textContent = 'Скопируйте вручную';
    }
    setTimeout(() => {
      copy.textContent = 'Скопировать стиль';
    }, 2000);
  });
  reset.addEventListener('click', () => {
    clearTheme(storage);
    for (const key of THEME_KEYS) delete theme[key];
    applyTheme(root, theme);
    openSettings(doc, root, storage);
  });
  close.addEventListener('click', () => dialog.close());
  // Вставка своего JSON обратно (кнопки нет — вставил и Enter).
  out.value = '';
  out.hidden = true;
  out.placeholder = 'Вставьте JSON стиля и нажмите Enter…';
  out.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const next = parseTheme(out.value);
    Object.assign(theme, next);
    applyTheme(root, theme);
    saveTheme(storage, theme);
    openSettings(doc, root, storage);
  });
  buttons.append(copy, reset, close);
  form.append(buttons);
  if (!dialog.open) dialog.showModal();
}
