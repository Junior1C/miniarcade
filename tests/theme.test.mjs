import test from 'node:test';
import assert from 'node:assert/strict';

import { THEME_KEY, THEME_KEYS, applyTheme, isHexColor, loadTheme } from '../assets/js/theme.js';
import { clearTheme, parseTheme, saveTheme, serializeTheme } from '../assets/js/settings.js';

function memStorage(initial) {
  const store = new Map(Object.entries(initial || {}));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

function memStyle() {
  const props = new Map();
  return {
    setProperty: (key, value) => props.set(key, value),
    removeProperty: (key) => props.delete(key),
    get: (key) => props.get(key),
    size: () => props.size,
  };
}

test('isHexColor принимает только #rrggbb', () => {
  assert.equal(isHexColor('#5b8def'), true);
  assert.equal(isHexColor('#5B8DEF'), true);
  for (const bad of ['#fff', 'red', '#gggggg', '', null, 42, '#12345']) {
    assert.equal(isHexColor(bad), false);
  }
});

test('loadTheme чистит мусор и нижнит регистр', () => {
  const storage = memStorage({
    [THEME_KEY]: JSON.stringify({ '--bg': '#AABBCC', '--accent': 'oops', '--nope': '#112233' }),
  });
  assert.deepEqual(loadTheme(storage), { '--bg': '#aabbcc' });
  assert.deepEqual(loadTheme(memStorage()), {});
  assert.deepEqual(loadTheme(memStorage({ [THEME_KEY]: 'not json' })), {});
  assert.deepEqual(loadTheme(null), {});
});

test('saveTheme/clearTheme терпят приватный режим', () => {
  const broken = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
    removeItem: () => {
      throw new Error('denied');
    },
  };
  saveTheme(broken, { '--bg': '#000000' });
  clearTheme(broken);
  assert.deepEqual(loadTheme(broken), {});
  const storage = memStorage();
  saveTheme(storage, { '--bg': '#010203' });
  assert.deepEqual(loadTheme(storage), { '--bg': '#010203' });
  clearTheme(storage);
  assert.deepEqual(loadTheme(storage), {});
});

test('applyTheme ставит валидные и снимает пустые', () => {
  const style = memStyle();
  applyTheme({ style }, { '--bg': '#010203', '--accent': 'bad' });
  assert.equal(style.get('--bg'), '#010203');
  assert.equal(style.get('--accent'), undefined);
  assert.equal(style.size(), 1);
  applyTheme(null, {});
  applyTheme({}, {});
});

test('serializeTheme отдаёт JSON со всеми ключами', () => {
  const { json } = serializeTheme({ '--bg': '#010203' });
  const parsed = JSON.parse(json);
  assert.equal(parsed['--bg'], '#010203');
  assert.equal(parsed['--accent'], '#5b8def');
  assert.equal(Object.keys(parsed).length, THEME_KEYS.length);
});

test('parseTheme ест только валидное', () => {
  assert.deepEqual(parseTheme('{"--bg":"#112233","--x":"#445566"}'), { '--bg': '#112233' });
  assert.deepEqual(parseTheme('oops'), {});
  assert.deepEqual(parseTheme(null), {});
});
