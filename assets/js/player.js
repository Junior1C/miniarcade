import { SANDBOX_TOKENS } from './sandbox-tokens.js';

const BASE_SANDBOX = ['allow-scripts'];

export const SANDBOX_ALLOWLIST = new Set(SANDBOX_TOKENS);

function buildSandbox(game) {
  const extras = Array.isArray(game.sandbox) ? game.sandbox : [];
  const allowed = extras.filter((token) => SANDBOX_ALLOWLIST.has(token));
  return [...BASE_SANDBOX, ...allowed].join(' ');
}

export function createPlayer({ dialog, frame, titleEl, emojiEl, closeBtn, onOpen, onClose }) {
  let currentId = null;

  function open(game) {
    currentId = game.id;
    emojiEl.textContent = game.emoji ?? '';
    titleEl.textContent = game.title;
    frame.setAttribute('sandbox', buildSandbox(game));
    frame.src = game.file;
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

  return {
    open,
    close,
    isOpen: () => dialog.open,
    currentGameId: () => currentId,
  };
}
