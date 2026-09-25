import { SANDBOX_TOKENS } from './sandbox-tokens.js';

const BASE_SANDBOX = ['allow-scripts'];

export const SANDBOX_ALLOWLIST = new Set(SANDBOX_TOKENS);

function buildSandbox(game) {
  const extras = Array.isArray(game.sandbox) ? game.sandbox : [];
  const allowed = extras.filter((token) => SANDBOX_ALLOWLIST.has(token));
  return [...BASE_SANDBOX, ...allowed].join(' ');
}

export function createPlayer({ dialog, frame, titleEl, emojiEl, closeBtn, expandBtn, sourceLink, loadingEl, onOpen, onClose }) {
  let currentId = null;
  // Узел кадра: при закрытии выкидываем целиком, храним в замыкании.
  let currentFrame = frame;

  function onFrameLoad() {
    if (dialog.open) {
      if (loadingEl) loadingEl.hidden = true;
      closeBtn.focus({ preventScroll: true });
    }
  }

  function bindFrame(next) {
    currentFrame = next;
    next.addEventListener('load', onFrameLoad);
  }

  // Детерминированная остановка игры: одного src='about:blank' мало —
  // у части движков звук доживал до GC. Удаление узла рвёт процесс сразу.
  function teardownFrame() {
    try {
      currentFrame.contentWindow?.stop?.();
    } catch {
      // Opaque origin: доступ запрещён, идём к удалению узла.
    }
    // Отпускаем захваты, иначе курсор/экран остаются у мёртвой игры.
    try {
      if (document.pointerLockElement) document.exitPointerLock();
      if (document.fullscreenElement && typeof document.exitFullscreen === 'function') {
        document.exitFullscreen().catch(() => {});
      }
    } catch {
      // Узел ниже всё равно всё остановит.
    }
    // Новый чистый about:blank с тем же id/классом (CSS и e2e опираются).
    const fresh = document.createElement('iframe');
    fresh.id = currentFrame.id;
    fresh.className = currentFrame.className;
    fresh.title = currentFrame.title;
    fresh.loading = 'lazy';
    fresh.setAttribute('sandbox', currentFrame.getAttribute('sandbox') || 'allow-scripts');
    fresh.src = 'about:blank';
    currentFrame.replaceWith(fresh);
    bindFrame(fresh);
  }

  function open(game) {
    currentId = game.id;
    emojiEl.textContent = game.emoji ?? '';
    titleEl.textContent = game.title;
    // Игра/окно открывается не моментально (особенно внешние мосты):
    // показываем loading-шкалу до первого load кадра.
    if (loadingEl) loadingEl.hidden = false;
    currentFrame.setAttribute('sandbox', buildSandbox(game));
    // Мост: внешний URL грузится в том же sandbox; referrer режем —
    // чужому сайту не отдаём даже путь каталога.
    currentFrame.referrerPolicy = game.url ? 'no-referrer' : 'strict-origin-when-cross-origin';
    currentFrame.src = game.url ?? game.file;
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
    teardownFrame();
    // Разворот не переживает закрытие: следующее открытие — обычный размер.
    if (dialog.classList.contains('player--fullscreen')) {
      dialog.classList.remove('player--fullscreen');
      syncExpandBtn();
    }
    if (loadingEl) loadingEl.hidden = true;
    onClose(id);
  }

  function syncExpandBtn() {
    if (!expandBtn) return;
    const on = dialog.classList.contains('player--fullscreen');
    expandBtn.setAttribute('aria-pressed', String(on));
    // Иконки без видимых слов: имя — через aria-label/title (скринридер + тултип).
    expandBtn.textContent = on ? '🗗' : '⛶';
    const name = on ? 'Свернуть окно игры' : 'Развернуть на весь экран';
    expandBtn.setAttribute('aria-label', name);
    expandBtn.title = name;
  }

  function toggleExpand() {
    if (!dialog.open) return;
    dialog.classList.toggle('player--fullscreen');
    syncExpandBtn();
  }

  dialog.addEventListener('close', finalize);
  closeBtn.addEventListener('click', close);
  if (expandBtn) {
    syncExpandBtn();
    expandBtn.addEventListener('click', toggleExpand);
  }

  // Автофокус игры уводит Esc в iframe — возвращаем фокус на крестик.
  bindFrame(currentFrame);

  return {
    open,
    close,
    isOpen: () => dialog.open,
    currentGameId: () => currentId,
  };
}
