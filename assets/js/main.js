import { loadCatalog } from './catalog.js';
import { filterGames, normalizeQuery } from './search.js';
import { pluralizeRu } from './format.js';
import { createPlayer } from './player.js';
import { renderWithTransition } from './view-transition.js';
import { sendStats, statsEnabled } from './stats.js';

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
  dialog: document.getElementById('player'),
  frame: document.getElementById('player-frame'),
  title: document.getElementById('player-name'),
  emoji: document.getElementById('player-emoji'),
  closeBtn: document.getElementById('player-close'),
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
};

const player = createPlayer({
  dialog: elements.dialog,
  frame: elements.frame,
  titleEl: elements.title,
  emojiEl: elements.emoji,
  closeBtn: elements.closeBtn,
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
  return state.query ? `Найдено: ${count} ${word}` : `Всего: ${count} ${word}`;
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

  // Значок языка игры из каталога (build гарантирует наличие):
  // RU / EN / ZH / JA / 🌐 (смешанный или неопределённый). Не интерактивен.
  if (typeof game.lang === 'string' && game.lang) {
    const lang = document.createElement('span');
    lang.className = 'card__lang';
    if (game.lang === 'neutral') {
      lang.textContent = '🌐';
      lang.title = 'Язык интерфейса: смешанный или не определён';
    } else {
      const names = { ru: 'русский', en: 'английский', zh: 'китайский', ja: 'японский' };
      lang.textContent = game.lang.toUpperCase();
      lang.title = `Язык игры: ${names[game.lang] ?? game.lang}`;
    }
    title.append(lang);
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
    link.append(meta, cta);
  } else {
    link.append(visual, title, description);
    if (tagsList) link.append(tagsList);
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
  const filtered = filterGames(state.games, state.query);
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
  if (state.statsOn) sendStats('pv');
  try {
    state.games = await loadCatalog();
    elements.error.hidden = true;
    render();
    syncFromHash();
  } catch (error) {
    console.error(error);
    showError();
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
