import { loadCatalog } from './catalog.js';
import { filterGames, normalizeQuery } from './search.js';
import { pluralizeRu } from './format.js';
import { createPlayer } from './player.js';
import { renderWithTransition } from './view-transition.js';

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
};

const state = {
  games: [],
  query: '',
  shown: PAGE_SIZE,
  openedInternally: false,
};

const player = createPlayer({
  dialog: elements.dialog,
  frame: elements.frame,
  titleEl: elements.title,
  emojiEl: elements.emoji,
  closeBtn: elements.closeBtn,
  sourceLink: elements.sourceLink,
  onOpen: (game) => {
    document.title = `${game.title} — ${BASE_TITLE}`;
  },
  onClose: (id) => {
    document.title = BASE_TITLE;
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
  // External-запись: та же ленточка-перевязь, что у мостов.
  const isExternal = Boolean(game.url || game.link);
  link.className = isExternal ? 'card card--bridge' : 'card';
  if (game.link) {
    // Сайт не разрешает встраивание — уходим наружу в новой вкладке,
    // плеер и hash-роутинг не участвуют.
    link.href = game.link;
    link.target = '_blank';
    link.rel = 'noopener';
  } else {
    link.href = playHash(game.id);
  }

  const emoji = document.createElement('span');
  emoji.className = 'card__emoji';
  emoji.setAttribute('aria-hidden', 'true');
  emoji.textContent = game.emoji ?? '🎮';

  const title = document.createElement('h3');
  title.className = 'card__title';
  title.textContent = game.title;

  const description = document.createElement('p');
  description.className = 'card__desc';
  description.textContent = game.description;

  // Мост: честная атрибуция прямо на карточке — автор и лицензия,
  // код остаётся у автора, мы только ссылаемся.
  const cta = document.createElement('span');
  cta.className = 'card__cta';
  cta.textContent = game.link ? 'Открыть ↗' : 'Играть';

  if (isExternal) {
    // Декоративная перевязь сбоку: смысл для скринридеров уже есть
    // в текстовой строке meta ниже, поэтому aria-hidden.
    const ribbon = document.createElement('span');
    ribbon.className = 'card__ribbon';
    ribbon.setAttribute('aria-hidden', 'true');
    ribbon.textContent = 'External';
    const meta = document.createElement('p');
    meta.className = 'card__meta';
    const badge = document.createElement('span');
    badge.className = 'card__badge';
    if (game.link) {
      badge.textContent = '↗ Сайт';
      meta.append(badge, ` ${game.source}`);
    } else {
      badge.textContent = '↗ GitHub';
      meta.append(badge, ` ${game.author} • ${game.license}`);
    }
    link.append(ribbon, emoji, title, description, meta, cta);
  } else {
    link.append(emoji, title, description, cta);
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
  const link = event.target.closest('a[href^="#/play/"]');
  if (link) {
    state.openedInternally = true;
  }
});

window.addEventListener('hashchange', syncFromHash);

init();
