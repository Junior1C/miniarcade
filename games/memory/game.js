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
  let moves = 0;
  // Токен партии: протухший setTimeout несовпадения после рестарта
  // трогает только откреплённые ноды и не разблокирует новое поле раньше времени.
  let round = 0;

  // SFX без ассетов: чистый WebAudio, офлайн и CSP-safe.
  let audioCtx = null;

  function beep(freq, ms = 80) {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') {
        void audioCtx.resume();
      }
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + ms / 1000);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + ms / 1000);
    } catch {
      // Без звука игра продолжается как раньше.
    }
  }

  function shuffle(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function updateStatus(message) {
    statusEl.textContent =
      message ?? `Найдено пар: ${matchedPairs} из ${EMOJIS.length} • Ходов: ${moves}`;
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
    beep(660, 90);
    setTimeout(() => beep(880, 120), 90);
    if (matchedPairs === EMOJIS.length) {
      updateStatus(`Победа за ${moves} ходов! Все пары найдены. 🎉`);
      setTimeout(() => beep(784, 160), 220);
      return;
    }
    updateStatus();
  }

  function mismatch(first, second) {
    locked = true;
    const token = round;
    beep(200, 120);
    updateStatus();
    setTimeout(() => {
      if (token !== round) return;
      hide(first);
      hide(second);
      firstCard = null;
      locked = false;
    }, MISMATCH_DELAY_MS);
  }

  function onCardClick(card) {
    if (locked || card.disabled || card === firstCard) return;
    reveal(card);
    beep(520, 60);
    if (!firstCard) {
      firstCard = card;
      return;
    }
    const first = firstCard;
    moves += 1;
    if (first.dataset.emoji === card.dataset.emoji) {
      match(first, card);
    } else {
      mismatch(first, card);
    }
  }

  function newGame() {
    round += 1;
    firstCard = null;
    locked = false;
    matchedPairs = 0;
    moves = 0;

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
