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
  homeRows: document.getElementById('home-rows'),
  genreList: document.getElementById('genre-list'),
  mobileGenreList: document.getElementById('mobile-genre-list'),
  menuToggle: document.getElementById('menu-toggle'),
  mobileSidebar: document.getElementById('mobile-sidebar'),
  homeLogo: document.getElementById('home-logo'),
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
  // Главная без запроса — ряды; запрос или смена сортировки — сетка.
  gridLock: false,
  genreTags: [],
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

  // Бейдж основного языка (первый из langs — английский, если есть,
  // иначе первый по мировой популярности) + «+» при нескольких языках;
  // neutral — без бейджа. Подсказка перечисляет все языки.
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
    lang.textContent = all.length > 1 ? `${game.lang.toUpperCase()}+` : game.lang.toUpperCase();
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
  const gridMode = state.query !== '' || state.gridLock;
  if (!gridMode && state.games.length > 0) {
    renderRows();
    return;
  }
  renderGrid();
}

function renderGrid() {
  if (elements.homeRows) {
    // Ряды выкидываем из DOM целиком: иначе дубли id-free карточек
    // (один href дважды) ломают строгие селекторы и жрут память.
    elements.homeRows.replaceChildren();
    elements.homeRows.hidden = true;
  }
  elements.grid.hidden = false;
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

// Главная: ряды «Популярное», «Новые», топ-теги. Сетка прячется.
const ROW_SIZE = 12;
const ROW_TAGS = 5;

function topTags(limit) {
  const counts = new Map();
  for (const game of state.games) {
    if (!Array.isArray(game.tags)) continue;
    for (const tag of game.tags) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'ru'))
    .slice(0, limit)
    .map(([tag, n]) => ({ tag, n }));
}

function renderRows() {
  elements.grid.replaceChildren();
  elements.grid.hidden = true;
  elements.loadMoreWrap.hidden = true;
  elements.empty.hidden = true;
  elements.status.textContent = describeCount(state.games.length);
  const sections = [
    { title: 'Популярное', games: sortGames(state.games, 'top', state.gameStats).slice(0, ROW_SIZE) },
    { title: 'Новые', games: sortGames(state.games, 'new', state.gameStats).slice(0, ROW_SIZE) },
  ];
  for (const { tag } of topTags(ROW_TAGS)) {
    const inTag = state.games.filter((g) => Array.isArray(g.tags) && g.tags.includes(tag));
    sections.push({
      title: `#${tag}`,
      games: sortGames(inTag, 'top', state.gameStats).slice(0, ROW_SIZE),
      tag,
    });
  }
  const wrap = document.createDocumentFragment();
  sections.forEach((section, index) => {
    if (section.games.length === 0) return;
    const sectionEl = document.createElement('section');
    sectionEl.className = 'row-section';
    const head = document.createElement('h2');
    head.className = 'row-head';
    head.textContent = section.title;
    const carousel = document.createElement('div');
    carousel.className = 'row-carousel';
    const trackId = `row-track-${index}`;
    const prev = document.createElement('button');
    prev.className = 'scroll-btn scroll-btn--left';
    prev.type = 'button';
    prev.setAttribute('aria-label', `Листать «${section.title}» назад`);
    prev.textContent = '‹';
    const next = document.createElement('button');
    next.className = 'scroll-btn scroll-btn--right';
    next.type = 'button';
    next.setAttribute('aria-label', `Листать «${section.title}» вперёд`);
    next.textContent = '›';
    const track = document.createElement('ul');
    track.className = 'row-track';
    track.id = trackId;
    track.setAttribute('aria-label', section.title);
    for (const game of section.games) track.append(createCard(game));
    prev.addEventListener('click', () => scrollTrack(trackId, -1));
    next.addEventListener('click', () => scrollTrack(trackId, 1));
    track.addEventListener('scroll', () => checkScrollButtons(trackId), { passive: true });
    carousel.append(prev, track, next);
    sectionEl.append(head, carousel);
    wrap.append(sectionEl);
  });
  elements.homeRows.replaceChildren(wrap);
  elements.homeRows.hidden = false;
  requestAnimationFrame(() => {
    elements.homeRows.querySelectorAll('.row-track').forEach((track) => checkScrollButtons(track.id));
  });
}

function scrollTrack(trackId, direction) {
  const track = document.getElementById(trackId);
  if (!track) return;
  const amount = Math.max(300, track.clientWidth * 0.8);
  track.scrollBy({ left: direction * amount, behavior: 'smooth' });
  setTimeout(() => checkScrollButtons(trackId), 350);
}

function checkScrollButtons(trackId) {
  const track = document.getElementById(trackId);
  if (!track) return;
  const left = track.parentElement.querySelector('.scroll-btn--left');
  const right = track.parentElement.querySelector('.scroll-btn--right');
  const canLeft = track.scrollLeft > 5;
  const canRight = track.scrollLeft + track.clientWidth < track.scrollWidth - 5;
  const scrollable = track.scrollWidth > track.clientWidth + 5;
  if (left) left.classList.toggle('visible', scrollable && canLeft);
  if (right) right.classList.toggle('visible', scrollable && canRight);
}

function showError() {
  state.games = [];
  elements.grid.replaceChildren();
  if (elements.homeRows) {
    elements.homeRows.replaceChildren();
    elements.homeRows.hidden = true;
  }
  elements.status.textContent = '';
  elements.empty.hidden = true;
  elements.loadMoreWrap.hidden = true;
  elements.error.hidden = false;
}

// Сайдбар жанров: топ-теги + Главная; тот же набор в drawer.
function renderGenres() {
  state.genreTags = topTags(8);
  for (const list of [elements.genreList, elements.mobileGenreList]) {
    if (!list) continue;
    list.replaceChildren();
    list.append(genreItem('Главная', null, state.query === ''));
    for (const { tag } of state.genreTags) {
      list.append(genreItem(`#${tag}`, tag, state.query === tag));
    }
  }
}

function genreItem(label, tag, active) {
  const item = document.createElement('li');
  const btn = document.createElement('button');
  btn.className = 'genre-button';
  btn.type = 'button';
  if (active) btn.setAttribute('aria-current', 'true');
  const icon = document.createElement('span');
  icon.className = 'genre-button__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = tag ? '#' : '⌂';
  const text = document.createElement('span');
  text.textContent = label;
  btn.append(icon, text);
  btn.addEventListener('click', () => applyGenre(tag));
  item.append(btn);
  return item;
}

// Жанр = поиск по тегу, как клик по чипу.
function applyGenre(tag) {
  const value = tag ?? '';
  elements.search.value = value;
  state.query = normalizeQuery(value);
  state.shown = PAGE_SIZE;
  state.gridLock = false;
  closeDrawer();
  render();
  renderGenres();
  elements.search.focus({ preventScroll: true });
}

function openDrawer() {
  if (!elements.mobileSidebar || !elements.menuToggle) return;
  elements.mobileSidebar.hidden = false;
  elements.menuToggle.setAttribute('aria-expanded', 'true');
}

function closeDrawer() {
  if (!elements.mobileSidebar || !elements.menuToggle) return;
  elements.mobileSidebar.hidden = true;
  elements.menuToggle.setAttribute('aria-expanded', 'false');
}

function toggleDrawer() {
  if (!elements.mobileSidebar || elements.mobileSidebar.hidden) openDrawer();
  else closeDrawer();
}

async function init() {
  state.statsOn = statsEnabled();
  if (elements.sort) {
    elements.sort.value = state.sort;
    elements.sort.addEventListener('change', () => {
      state.sort = validSortMode(elements.sort.value);
      saveSortMode(state.sort);
      state.shown = PAGE_SIZE;
      // Смена сортировки — всегда сетка (ряды зафиксированы).
      state.gridLock = true;
      render();
    });
  }
  if (elements.menuToggle) elements.menuToggle.addEventListener('click', toggleDrawer);
  if (elements.homeLogo) {
    elements.homeLogo.addEventListener('click', () => {
      elements.search.value = '';
      state.query = '';
      state.shown = PAGE_SIZE;
      state.gridLock = false;
      closeDrawer();
      render();
      renderGenres();
    });
  }
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && elements.mobileSidebar && !elements.mobileSidebar.hidden && !player.isOpen()) {
      closeDrawer();
    }
  });
  if (state.statsOn) sendStats('pv');
  try {
    state.games = await loadCatalog();
    elements.error.hidden = true;
    renderGenres();
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
    renderGenres();
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
    applyGenre(chip.dataset.tag);
    return;
  }
  const link = event.target.closest('a[href^="#/play/"]');
  if (link) {
    state.openedInternally = true;
  }
});

// Теги работают и в рядах главной (делегирование на контейнер).
if (elements.homeRows) {
  elements.homeRows.addEventListener('click', (event) => {
    const chip = event.target.closest('.card__tag');
    if (chip && chip.dataset.tag) {
      event.preventDefault();
      applyGenre(chip.dataset.tag);
      return;
    }
    const link = event.target.closest('a[href^="#/play/"]');
    if (link) {
      state.openedInternally = true;
    }
  });
}

window.addEventListener('hashchange', syncFromHash);

init();
