(() => {
  'use strict';

  const SIZE = 4;
  const SHUFFLE_MOVES = 200;

  const gridEl = document.getElementById('grid');
  const movesEl = document.getElementById('moves');
  const bestEl = document.getElementById('best');
  const statusEl = document.getElementById('status');
  const restartBtn = document.getElementById('restart');

  let tiles;
  let hole;
  let moves;
  let best = null;
  let finished;

  let audioCtx = null;

  function beep(freq, ms = 60) {
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
      osc.type = 'triangle';
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

  function neighbours(index) {
    const x = index % SIZE;
    const y = Math.floor(index / SIZE);
    const result = [];
    if (x > 0) result.push(index - 1);
    if (x < SIZE - 1) result.push(index + 1);
    if (y > 0) result.push(index - SIZE);
    if (y < SIZE - 1) result.push(index + SIZE);
    return result;
  }

  function isSolved() {
    for (let i = 0; i < SIZE * SIZE - 1; i += 1) {
      if (tiles[i] !== i + 1) return false;
    }
    return tiles[SIZE * SIZE - 1] === 0;
  }

  function slide(index, countMove = true) {
    if (finished) return;
    if (!neighbours(hole).includes(index)) return;
    tiles[hole] = tiles[index];
    tiles[index] = 0;
    hole = index;
    if (countMove) {
      moves += 1;
      movesEl.textContent = String(moves);
      beep(500, 50);
    }
    render();
    if (moves > 0 && isSolved()) {
      finished = true;
      if (best === null || moves < best) {
        best = moves;
        bestEl.textContent = String(best);
        statusEl.textContent = `Собрано за ${moves} ходов — новый рекорд! 🎉`;
      } else {
        statusEl.textContent = `Собрано за ${moves} ходов!`;
      }
      beep(660, 100);
      setTimeout(() => beep(880, 150), 110);
      render();
    }
  }

  function render() {
    const cells = gridEl.children;
    for (let i = 0; i < cells.length; i += 1) {
      const cell = cells[i];
      const value = tiles[i];
      cell.textContent = value === 0 ? '' : String(value);
      cell.classList.toggle('hole', value === 0);
      cell.disabled = finished || value === 0;
      cell.setAttribute('aria-label', value === 0 ? 'Пустая клетка' : `Костяшка ${value}`);
    }
  }

  function newGame() {
    tiles = Array.from({ length: SIZE * SIZE }, (_, i) => (i + 1) % (SIZE * SIZE));
    hole = SIZE * SIZE - 1;
    // Тасуем случайными валидными ходами из сборки — всегда решаемо.
    for (let i = 0; i < SHUFFLE_MOVES; i += 1) {
      const options = neighbours(hole);
      const pick = options[Math.floor(Math.random() * options.length)];
      tiles[hole] = tiles[pick];
      tiles[pick] = 0;
      hole = pick;
    }
    moves = 0;
    finished = false;
    movesEl.textContent = '0';
    statusEl.textContent = '';
    if (gridEl.children.length === 0) {
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < SIZE * SIZE; i += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'tile';
        const index = i;
        cell.addEventListener('click', () => slide(index));
        fragment.append(cell);
      }
      gridEl.replaceChildren(fragment);
    }
    render();
  }

  // Стрелки двигают дырку: костяшка едет навстречу.
  document.addEventListener('keydown', (event) => {
    const holeX = hole % SIZE;
    const holeY = Math.floor(hole / SIZE);
    let target = -1;
    if (event.code === 'ArrowLeft' && holeX < SIZE - 1) target = hole + 1;
    else if (event.code === 'ArrowRight' && holeX > 0) target = hole - 1;
    else if (event.code === 'ArrowUp' && holeY < SIZE - 1) target = hole + SIZE;
    else if (event.code === 'ArrowDown' && holeY > 0) target = hole - SIZE;
    if (target >= 0) {
      event.preventDefault();
      slide(target);
    }
  });

  restartBtn.addEventListener('click', newGame);

  newGame();
})();
