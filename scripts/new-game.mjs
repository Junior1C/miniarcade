import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildCatalog } from './build.mjs';

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
}

function templateHtml(title) {
  const safe = escapeHtml(title);
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'">
  <meta name="referrer" content="no-referrer">
  <title>${safe} — MiniArcade</title>
  <link rel="stylesheet" href="style.css">
  <script src="game.js" defer></script>
</head>
<body>
  <header class="hud">
    <h1><span aria-hidden="true">🎮</span> ${safe}</h1>
    <p class="hud__score">Счёт: <output id="score">0</output></p>
  </header>

  <main>
    <p id="status" class="status" role="status" aria-live="polite"></p>
    <p class="hint">Управление: Пробел</p>
  </main>
</body>
</html>
`;
}

const TEMPLATE_CSS = `body {
  margin: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  font-family: system-ui, Arial, sans-serif;
  background: #111827;
  color: #f3f4f6;
  /* Кнопки без 300мс дабл-тап-зума на мобильных. */
  touch-action: manipulation;
}

/* Canvas со свайпами — touch-action: none, чтобы палец не скроллил страницу. */
canvas {
  touch-action: none;
  max-width: 100%;
  height: auto;
}

.hud {
  display: flex;
  gap: 1rem;
  align-items: baseline;
}

.hud h1 {
  margin: 0;
  font-size: 1.25rem;
}

.hud__score {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.status {
  min-height: 1.5em;
  margin: 0;
}

.hint {
  margin: 0;
  color: #c4c9d4;
}

button {
  font: inherit;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: 1px solid #4b5563;
  background: #1f2937;
  color: inherit;
  cursor: pointer;
}

/* Видимый фокус только с клавиатуры: мышь не шумит обводкой. */
button:focus-visible {
  outline: 2px solid #60a5fa;
  outline-offset: 2px;
}

/* Уважение к reduced-motion: без резких анимаций по умолчанию в шаблоне нет,
   правило-маркер — чтобы автор не забыл обернуть свои keyframes. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
`;

const TEMPLATE_JS = `(() => {
  'use strict';

  const scoreEl = document.getElementById('score');
  const statusEl = document.getElementById('status');
  let score = 0;
  // Пауза по visibilitychange: realtime-цикл не крутится в фоне
  // (qa-games.mjs предупреждает, если флага нет). Шаблон — пошаговый,
  // поэтому флаг-маркер: автор realtime-игры обязан повесить паузу сюда.
  let paused = document.hidden;

  function setScore(value) {
    score = value;
    scoreEl.textContent = String(score);
  }

  // e.code, а не e.key: раскладка/CapsLock не ломают управление.
  // Пробел только на keydown + preventDefault: на Enter нативный клик
  // сфокусированной кнопки удвоил бы очки.
  window.addEventListener('keydown', (event) => {
    if (paused) return;
    if (event.code === 'Space') {
      event.preventDefault();
      setScore(score + 1);
      statusEl.textContent = 'Очки: ' + score;
    }
  });

  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    if (paused) statusEl.textContent = 'Пауза — вернитесь на вкладку';
  });

  statusEl.textContent = 'Нажмите Пробел, чтобы начать';
})();
`;

export async function createGame(rootDir, id, title) {
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) {
    throw new Error('id must be kebab-case (a-z, 0-9, dashes), e.g. "moya-igra"');
  }
  if (typeof title !== 'string' || title.trim() === '') {
    throw new Error('title must be a non-empty string');
  }

  const dir = path.join(rootDir, 'games', id);
  let exists = true;
  try {
    await stat(dir);
  } catch {
    exists = false;
  }
  if (exists) {
    throw new Error(`games/${id} already exists`);
  }

  await mkdir(dir, { recursive: true });
  const meta = {
    id,
    title: title.trim(),
    emoji: '🎮',
    description: `${title.trim()} — заполните описание в meta.json.`,
    tags: ['аркада'],
    controls: 'Пробел',
    lang: 'ru',
    // Дата добавления для сортировки «Новые» (build проверяет формат).
    added: new Date().toISOString().slice(0, 10),
  };
  await Promise.all([
    writeFile(path.join(dir, 'index.html'), templateHtml(meta.title), 'utf8'),
    writeFile(path.join(dir, 'style.css'), TEMPLATE_CSS, 'utf8'),
    writeFile(path.join(dir, 'game.js'), TEMPLATE_JS, 'utf8'),
    writeFile(path.join(dir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`, 'utf8'),
  ]);
  return dir;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const [id, ...titleParts] = process.argv.slice(2);
  const title = titleParts.join(' ').trim();
  try {
    if (!id || !title) {
      throw new Error('Usage: npm run new -- <id> "Название игры"');
    }
    await createGame(process.cwd(), id, title);
    const payload = await buildCatalog(process.cwd());
    console.log(`Created games/${id}/ — catalog: ${payload.games.length} games`);
    console.log('Next: заполните description/tags в meta.json и напишите игру.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
