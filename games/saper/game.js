(() => {
  'use strict';

  const SIZE = 9;
  const MINES = 10;

  const gridEl = document.getElementById('grid');
  const minesEl = document.getElementById('mines');
  const flagsEl = document.getElementById('flags');
  const statusEl = document.getElementById('status');
  const modeBtn = document.getElementById('mode');
  const restartBtn = document.getElementById('restart');

  let mines;
  let revealed;
  let flagged;
  let placed;
  let flagMode;
  let finished;

  let audioCtx = null;

  function beep(freq, ms = 70) {
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
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE) {
          result.push(ny * SIZE + nx);
        }
      }
    }
    return result;
  }

  // Мины ставим после первого клика, исключая его и соседей.
  function placeMines(safe) {
    const forbidden = new Set([safe, ...neighbours(safe)]);
    const pool = [];
    for (let i = 0; i < SIZE * SIZE; i += 1) {
      if (!forbidden.has(i)) pool.push(i);
    }
    mines = new Set();
    while (mines.size < MINES) {
      const pick = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      mines.add(pick);
    }
    placed = true;
  }

  function countMines(index) {
    return neighbours(index).filter((i) => mines.has(i)).length;
  }

  function paint(cell, index) {
    if (flagged.has(index)) {
      cell.textContent = '🚩';
      cell.classList.add('flagged');
      return;
    }
    cell.classList.remove('flagged');
    if (!revealed.has(index)) {
      cell.textContent = '';
      return;
    }
    if (mines.has(index)) {
      cell.textContent = '💥';
      cell.classList.add('boom');
      return;
    }
    const count = countMines(index);
    cell.textContent = count === 0 ? '' : String(count);
    cell.classList.add('open');
    if (count > 0) cell.classList.add(`n${count}`);
  }

  function refresh() {
    const cells = gridEl.children;
    for (let i = 0; i < cells.length; i += 1) {
      paint(cells[i], i);
    }
    flagsEl.textContent = String(flagged.size);
  }

  function reveal(index) {
    if (revealed.has(index) || flagged.has(index)) return;
    if (!placed) placeMines(index);
    revealed.add(index);
    if (mines.has(index)) {
      lose(index);
      return;
    }
    beep(520, 50);
    if (countMines(index) === 0) {
      const stack = [index];
      while (stack.length > 0) {
        const current = stack.pop();
        for (const next of neighbours(current)) {
          if (!revealed.has(next) && !flagged.has(next) && !mines.has(next)) {
            revealed.add(next);
            if (countMines(next) === 0) stack.push(next);
          }
        }
      }
    }
    refresh();
    if (revealed.size === SIZE * SIZE - MINES) {
      win();
    }
  }

  function toggleFlag(index) {
    if (revealed.has(index) || finished) return;
    if (!placed) placeMines(index);
    if (flagged.has(index)) {
      flagged.delete(index);
    } else {
      if (flagged.size >= MINES) return;
      flagged.add(index);
      beep(700, 60);
    }
    refresh();
  }

  function activate(index) {
    if (finished) return;
    if (flagMode) {
      toggleFlag(index);
    } else {
      reveal(index);
    }
  }

  function lockAll() {
    for (const cell of gridEl.children) {
      cell.disabled = true;
    }
  }

  function win() {
    finished = true;
    for (const mine of mines) flagged.add(mine);
    refresh();
    lockAll();
    statusEl.textContent = 'Победа! Поле разминировано. 🎉';
    beep(660, 100);
    setTimeout(() => beep(880, 150), 110);
  }

  function lose(hit) {
    finished = true;
    for (const mine of mines) revealed.add(mine);
    refresh();
    const cells = gridEl.children;
    cells[hit].classList.add('boom');
    lockAll();
    statusEl.textContent = 'Бум! Вы попали на мину. Попробуйте ещё раз.';
    beep(140, 300);
  }

  function newGame() {
    mines = new Set();
    revealed = new Set();
    flagged = new Set();
    placed = false;
    flagMode = false;
    finished = false;
    minesEl.textContent = String(MINES);
    flagsEl.textContent = '0';
    statusEl.textContent = '';
    modeBtn.textContent = '⛏ Копать';
    modeBtn.setAttribute('aria-pressed', 'false');
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < SIZE * SIZE; i += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.setAttribute('aria-label', `Клетка ${i + 1}`);
      const index = i;
      cell.addEventListener('click', () => activate(index));
      cell.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        toggleFlag(index);
      });
      fragment.append(cell);
    }
    gridEl.replaceChildren(fragment);
    refresh();
  }

  modeBtn.addEventListener('click', () => {
    flagMode = !flagMode;
    modeBtn.textContent = flagMode ? '🚩 Флаги' : '⛏ Копать';
    modeBtn.setAttribute('aria-pressed', String(flagMode));
  });

  restartBtn.addEventListener('click', newGame);

  newGame();
})();
