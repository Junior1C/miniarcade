import { SANDBOX_TOKENS } from './sandbox-tokens.js';

const BASE_SANDBOX = ['allow-scripts'];

export const SANDBOX_ALLOWLIST = new Set(SANDBOX_TOKENS);

function buildSandbox(game) {
  const extras = Array.isArray(game.sandbox) ? game.sandbox : [];
  const allowed = extras.filter((token) => SANDBOX_ALLOWLIST.has(token));
  return [...BASE_SANDBOX, ...allowed].join(' ');
}

export function createPlayer({ dialog, frame, titleEl, emojiEl, closeBtn, sourceLink, onOpen, onClose }) {
  let currentId = null;

  function open(game) {
    currentId = game.id;
    emojiEl.textContent = game.emoji ?? '';
    titleEl.textContent = game.title;
    frame.setAttribute('sandbox', buildSandbox(game));
    // Мост: внешний URL грузится в том же sandbox; referrer режем —
    // чужому сайту не отдаём даже путь каталога.
    frame.referrerPolicy = game.url ? 'no-referrer' : 'strict-origin-when-cross-origin';
    frame.src = game.url ?? game.file;
    if (sourceLink) {
      if (game.repo) {
        sourceLink.href = game.repo;
        sourceLink.hidden = false;
      } else {
        sourceLink.removeAttribute('href');
        sourceLink.hidden = true;
      }
    }
    if (!dialog.open) {
      dialog.showModal();
    }
    onOpen(game);
  }

  function close() {
    if (dialog.open) {
      dialog.close();
    }
  }

  function finalize() {
    if (!currentId) return;
    const id = currentId;
    currentId = null;
    frame.src = 'about:blank';
    onClose(id);
  }

  dialog.addEventListener('close', finalize);
  closeBtn.addEventListener('click', close);

  // Игра вправе увести фокус в свой iframe при загрузке (автофокус) —
  // тогда Esc уходит в игру, а не в диалог, и модалка «не закрывается».
  // Возвращаем фокус на крестик, пока диалог открыт: по семантике
  // showModal фокус принадлежит диалогу, в игру пользователь табнет сам.
  frame.addEventListener('load', () => {
    if (dialog.open) {
      closeBtn.focus({ preventScroll: true });
    }
  });

  return {
    open,
    close,
    isOpen: () => dialog.open,
    currentGameId: () => currentId,
  };
}
