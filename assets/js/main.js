import { loadCatalog } from './catalog.js';
import { filterGames, normalizeQuery } from './search.js';
import { pluralizeRu } from './format.js';
import { createPlayer } from './player.js';
import { renderWithTransition } from './view-transition.js';
import { sendStats, statsEnabled } from './stats.js';
import { SORT_LABELS, buildGameStats, cardStatsLine, sortGames, validSortMode } from './sort.js';

const PAGE_SIZE = 24;
const HASH_PREFIX = '#/play/';
const BASE_TITLE = document.title;

const elements = {
  grid: document.getElementById('games'),
  status: document.getElementById('results-status'),
  empty: document.getElementById('empty-state'),
  error: document.getElementById('error-state'),
  retry: document.getElementById('retry'),
  loadMoreWrap: document.getElementById('load-more-wrap'),
  loadMore: document.getElementById('load-more'),
  search: document.getElementById('search'),
  sort: document.getElementById('sort'),
  dialog: document.getElementById('player'),
  frame: document.getElementById('player-frame'),
  title: document.getElementById('player-name'),
  emoji: document.getElementById('player-emoji'),
  closeBtn: document.getElementById('player-close'),
  expandBtn: document.getElementById('player-expand'),
  sourceLink: document.getElementById('player-source'),
  loading: document.getElementById('player-loading'),
};

const state = {
  games: [],
  query: '',
  shown: PAGE_SIZE,
  openedInternally: false,
  playStart: 0,
  statsOn: false,
  // Сортировка переживает перезагрузку (localStorage каталога, не игр).
  // Без цифр рейтинга честно: нули идут по алфавиту (см. sort.js).
  sort: loadSortMode(),
  gameStats: null,
};

function loadSortMode() {
  try {
    return validSortMode(localStorage.getItem('miniarcade-sort'));
  } catch {
    return 'top';
  }
}

function saveSortMode(mode) {
  try {
    localStorage.setItem('miniarcade-sort', mode);
  } catch {
    // Приватный режим: сортировка просто не запомнится.
  }
}

const player = createPlayer({
  dialog: elements.dialog,
  frame: elements.frame,
  titleEl: elements.title,
  emojiEl: elements.emoji,
  closeBtn: elements.closeBtn,
  expandBtn: elements.expandBtn,
  sourceLink: elements.sourceLink,
  loadingEl: elements.loading,
  onOpen: (game) => {
    document.title = `${game.title} — ${BASE_TITLE}`;
    state.playStart = Date.now();
    if (state.statsOn) sendStats('open', { game: game.id });
  },
  onClose: (id) => {
    document.title = BASE_TITLE;
    if (state.statsOn && state.playStart) {
      sendStats('close', { game: id, secs: (Date.now() - state.playStart) / 1000 });
    }
    state.playStart = 0;
    const openedInternally = state.openedInternally;
    state.openedInternally = false;
    if (location.hash === playHash(id)) {
      if (openedInternally) {
        history.back();
      } else {
        history.replaceState(null, '', location.pathname + location.search);
      }
    }
  },
});

function playHash(id) {
  return `${HASH_PREFIX}${id}`;
}

function parseHash() {
  if (!location.hash.startsWith(HASH_PREFIX)) return null;
  return location.hash.slice(HASH_PREFIX.length);
}

function findGame(id) {
  if (!id) return null;
  return state.games.find((game) => game.id === id) ?? null;
}

function syncFromHash() {
  const id = parseHash();
  const game = findGame(id);
  if (game) {
    if (player.currentGameId() !== game.id) {
      player.open(game);
    }
    return;
  }
  if (player.isOpen()) {
    player.close();
    return;
  }
  if (id) {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

function describeCount(count) {
  const word = pluralizeRu(count, 'игра', 'игры', 'игр');
  const base = state.query ? `Найдено: ${count} ${word}` : `Всего: ${count} ${word}`;
  return `${base} · ${SORT_LABELS[state.sort]}`;
}

function createCard(game) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  // Мост: угловая ленточка-перевязь (CSS) + класс-модификатор.
  const isExternal = Boolean(game.url);
  link.className = isExternal ? 'card card--bridge' : 'card';
  link.href = playHash(game.id);

  const emoji = document.createElement('span');
  emoji.className = 'card__emoji';
  emoji.setAttribute('aria-hidden', 'true');
  emoji.textContent = game.emoji ?? '🎮';

  // Превью вместо эмодзи, если игра его сгенерировала (gen-thumbs.mjs):
  // ленивая загрузка, фиксированный аспект против CLS, alt пустой —
  // название уже есть в заголовке рядом (как aria-hidden у эмодзи).
  let visual = emoji;
  if (typeof game.thumb === 'string' && game.thumb) {
    const shot = document.createElement('img');
    shot.className = 'card__thumb';
    shot.src = game.thumb;
    shot.alt = '';
    shot.setAttribute('aria-hidden', 'true');
    shot.loading = 'lazy';
    shot.decoding = 'async';
    shot.width = 440;
    shot.height = 440;
    visual = shot;
  }

  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = game.title;

  // Бейдж основного языка (первый из langs); neutral — без бейджа.
  // При нескольких языках подсказка перечисляет все.
  if (typeof game.lang === 'string' && game.lang && game.lang !== 'neutral') {
    const lang = document.createElement('span');
    lang.className = 'card__lang';
    const names = {
      ru: 'русский',
      en: 'английский',
      zh: 'китайский',
      ja: 'японский',
      it: 'итальянский',
      tr: 'турецкий',
      uk: 'украинский',
      es: 'испанский',
      fr: 'французский',
      de: 'немецкий',
      pt: 'португальский',
      pl: 'польский',
      nl: 'нидерландский',
      ko: 'корейский',
    };
    const all = Array.isArray(game.langs) && game.langs.length > 1 ? game.langs : [game.lang];
    lang.textContent = game.lang.toUpperCase();
    lang.title = `Языки игры: ${all.map((code) => names[code] ?? code).join(', ')}`;
    title.append(lang);
  }

  // Пометка ИИ-игр (тег «ии»): видна сразу, ищется по «ии».
  if (Array.isArray(game.tags) && game.tags.includes('ии')) {
    const ai = document.createElement('span');
    ai.className = 'card__ai';
    ai.textContent = 'ИИ';
    ai.title = 'Игра с искусственным интеллектом';
    title.append(ai);
  }

  const description = document.createElement('p');
  description.className = 'card__desc';
  description.textContent = game.description;

  // Теги игры: видны на карточке; клик подставляет тег в поиск
  // (делегировано на уровне сетки, см. обработчик ниже).
  let tagsList = null;
  if (Array.isArray(game.tags) && game.tags.length > 0) {
    tagsList = document.createElement('ul');
    tagsList.className = 'card__tags';
    for (const tag of game.tags) {
      const item = document.createElement('li');
      const chip = document.createElement('span');
      chip.className = 'card__tag';
      chip.dataset.tag = tag;
      chip.textContent = `#${tag}`;
      item.append(chip);
      tagsList.append(item);
    }
  }

  // Мост: честная атрибуция прямо на карточке — автор и лицензия,
  // код остаётся у автора, мы только ссылаемся.
  const cta = document.createElement('span');
  cta.className = 'card__cta';
  cta.textContent = 'Играть';

  // Строка честности на карточку — только при наличии plays.
  const statsLine = cardStatsLine(state.gameStats, game.id);
  let statsEl = null;
  if (statsLine) {
    statsEl = document.createElement('p');
    statsEl.className = 'card__stats';
    statsEl.textContent = statsLine;
  }

  if (isExternal) {
    // Декоративная перевязь сбоку без текста: распределяет визуально
    // внешние игры; смысл для скринридеров уже есть в строке meta ниже.
    const ribbon = document.createElement('span');
    ribbon.className = 'card__ribbon';
    ribbon.setAttribute('aria-hidden', 'true');
    const meta = document.createElement('p');
    meta.className = 'card__meta';
    const badge = document.createElement('span');
    badge.className = 'card__badge';
    badge.textContent = '↗ GitHub';
    meta.append(badge, ` ${game.author} • ${game.license}`);
    link.append(ribbon, visual, title, description);
    if (tagsList) link.append(tagsList);
    if (statsEl) link.append(statsEl);
    link.append(meta, cta);
  } else {
    link.append(visual, title, description);
    if (tagsList) link.append(tagsList);
    if (statsEl) link.append(statsEl);
    link.append(cta);
  }
  item.append(link);
  return item;
}

function render() {
  // View Transition — только анимация переключения списка;
  // без поддержки API работаем как раньше, синхронно.
  renderWithTransition(document, renderNow);
}

function renderNow() {
  const filtered = sortGames(filterGames(state.games, state.query), state.sort, state.gameStats);
  const visible = filtered.slice(0, state.shown);
  const fragment = document.createDocumentFragment();
  for (const game of visible) {
    fragment.append(createCard(game));
  }
  elements.grid.replaceChildren(fragment);

  elements.status.textContent = describeCount(filtered.length);
  elements.empty.hidden = filtered.length !== 0;

  const rest = filtered.length - visible.length;
  elements.loadMoreWrap.hidden = rest <= 0;
  elements.loadMore.textContent = `Показать ещё (${rest})`;
}

function showError() {
  state.games = [];
  elements.grid.replaceChildren();
  elements.status.textContent = '';
  elements.empty.hidden = true;
  elements.loadMoreWrap.hidden = true;
  elements.error.hidden = false;
}

async function init() {
  state.statsOn = statsEnabled();
  if (elements.sort) {
    elements.sort.value = state.sort;
    elements.sort.addEventListener('change', () => {
      state.sort = validSortMode(elements.sort.value);
      saveSortMode(state.sort);
      state.shown = PAGE_SIZE;
      render();
    });
  }
  if (state.statsOn) sendStats('pv');
  try {
    state.games = await loadCatalog();
    elements.error.hidden = true;
    render();
    syncFromHash();
    // Цифры рейтинга — неблокирующим запросом после первого рендера.
    loadGameStats();
  } catch (error) {
    console.error(error);
    showError();
  }
}

// Ночной агрегат D1 (публичный, те же данные stats.html).
// Нет файла — тихо: сортировка работает на нулях по алфавиту.
async function loadGameStats() {
  try {
    const response = await fetch('data/stats/totals.json', { headers: { Accept: 'application/json' } });
    if (!response.ok) return;
    const payload = await response.json();
    const totals = Array.isArray(payload.totals) ? payload.totals : payload;
    if (!Array.isArray(totals) || totals.length === 0) return;
    state.gameStats = buildGameStats(totals);
    render();
  } catch {
    // Статистика никогда не ломает каталог.
  }
}

let searchTimer = 0;
elements.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = normalizeQuery(elements.search.value);
    state.shown = PAGE_SIZE;
    render();
  }, 120);
});

elements.loadMore.addEventListener('click', () => {
  state.shown += PAGE_SIZE;
  render();
});

elements.retry.addEventListener('click', init);

elements.grid.addEventListener('click', (event) => {
  // Клик по тегу: вместо перехода в игру подставляем тег в поиск.
  const chip = event.target.closest('.card__tag');
  if (chip && chip.dataset.tag) {
    event.preventDefault();
    elements.search.value = chip.dataset.tag;
    state.query = normalizeQuery(chip.dataset.tag);
    state.shown = PAGE_SIZE;
    render();
    elements.search.focus();
    return;
  }
  const link = event.target.closest('a[href^="#/play/"]');
  if (link) {
    state.openedInternally = true;
  }
});

window.addEventListener('hashchange', syncFromHash);

init();
