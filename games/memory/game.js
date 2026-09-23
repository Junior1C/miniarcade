(() => {
  'use strict';

  const EMOJIS = ['🍎', '🚀', '🐱', '⚽', '🎧', '🌙', '🚗', '⭐'];
  const MISMATCH_DELAY_MS = 600;

  const gridEl = document.getElementById('grid');
  const statusEl = document.getElementById('status');
  const restartBtn = document.getElementById('restart');

  let firstCard = null;
  let locked = false;
  let matchedPairs = 0;

  function shuffle(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function updateStatus(message) {
    statusEl.textContent = message ?? `Найдено пар: ${matchedPairs} из ${EMOJIS.length}`;
  }

  function reveal(card) {
    card.classList.add('open');
    card.textContent = card.dataset.emoji;
  }

  function hide(card) {
    card.classList.remove('open');
    card.textContent = '❓';
  }

  function match(first, second) {
    first.classList.add('matched');
    second.classList.add('matched');
    first.disabled = true;
    second.disabled = true;
    matchedPairs += 1;
    firstCard = null;
    if (matchedPairs === EMOJIS.length) {
      updateStatus('Победа! Все пары найдены.');
      return;
    }
    updateStatus();
  }

  function mismatch(first, second) {
    locked = true;
    setTimeout(() => {
      hide(first);
      hide(second);
      firstCard = null;
      locked = false;
    }, MISMATCH_DELAY_MS);
  }

  function onCardClick(card) {
    if (locked || card.disabled || card === firstCard) return;
    reveal(card);
    if (!firstCard) {
      firstCard = card;
      return;
    }
    const first = firstCard;
    if (first.dataset.emoji === card.dataset.emoji) {
      match(first, card);
    } else {
      mismatch(first, card);
    }
  }

  function newGame() {
    firstCard = null;
    locked = false;
    matchedPairs = 0;

    const deck = shuffle([...EMOJIS, ...EMOJIS]);
    const fragment = document.createDocumentFragment();

    for (const emoji of deck) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card';
      card.dataset.emoji = emoji;
      card.textContent = '❓';
      card.setAttribute('aria-label', 'Закрытая карта');
      card.addEventListener('click', () => {
        if (card.classList.contains('open')) return;
        card.setAttribute('aria-label', `Открытая карта: ${emoji}`);
        onCardClick(card);
      });
      fragment.append(card);
    }

    gridEl.replaceChildren(fragment);
    updateStatus();
    restartBtn.focus();
  }

  restartBtn.addEventListener('click', newGame);

  newGame();
})();
