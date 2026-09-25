(() => {
  'use strict';

  const SIZE = 4;
  const TARGET = 2048;
  const SWIPE_MIN_PX = 24;

  const gridEl = document.getElementById('grid');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const statusEl = document.getElementById('status');
  const restartBtn = document.getElementById('restart');

  let board;
  let score;
  let best = 0;
  let over;
  let won;

  let audioCtx = null;
  let muted = false;

  // M — глушить/вернуть звук (сессия). Вне игровых клавиш.
  function toggleMute() {
    muted = !muted;
    statusEl.textContent = muted ? 'Звук выключен (M — вернуть).' : 'Звук включён.';
  }

  // Рекорд — в портал (портал хранит best, см. assets/js/best.js).
  function reportScore(value) {
    try {
      parent.postMessage({ type: 'miniarcade:score', game: '2048', score: value }, '*');
    } catch {
      // Вне каталога — некому слушать.
    }
  }

  function beep(freq, ms = 70, type = 'triangle') {
    try {
      if (muted) return;
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
      osc.type = type;
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

  function emptyRow() {
    return Array(SIZE).fill(0);
  }

  function addRandom() {
    const free = [];
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        if (board[y][x] === 0) free.push([x, y]);
      }
    }
    if (free.length === 0) return;
    const [x, y] = free[Math.floor(Math.random() * free.length)];
    board[y][x] = Math.random() < 0.9 ? 2 : 4;
  }

  function slide(row) {
    const packed = row.filter((value) => value !== 0);
    let gained = 0;
    for (let i = 0; i < packed.length - 1; i += 1) {
      if (packed[i] === packed[i + 1]) {
        packed[i] *= 2;
        gained += packed[i];
        packed.splice(i + 1, 1);
      }
    }
    while (packed.length < SIZE) packed.push(0);
    return { row: packed, gained };
  }

  // Поворот доски по часовой (имя честное: (0,0) -> (0,3)).
  function rotateCW(matrix) {
    return matrix[0].map((_, x) => matrix.map((row) => row[x]).reverse());
  }

  // Направление 0=влево, 1=вниз, 2=вправо, 3=вверх: сдвиг влево в доске,
  // повёрнутой k раз по часовой, эквивалентен исходному направлению
  // (проверено численно: колонка сверху при k=1 сливается вниз).
  function shift(dir) {
    if (over) return;
    let work = board.map((row) => [...row]);
    for (let i = 0; i < dir; i += 1) work = rotateCW(work);
    let gained = 0;
    let moved = false;
    const next = work.map((row) => {
      const { row: slid, gained: rowGained } = slide(row);
      gained += rowGained;
      if (slid.some((value, x) => value !== row[x])) moved = true;
      return slid;
    });
    let result = next;
    for (let i = 0; i < (4 - dir) % 4; i += 1) result = rotateCW(result);
    if (!moved) return;
    board = result;
    score += gained;
    scoreEl.textContent = String(score);
    if (gained > 0) beep(440 + Math.min(gained, 512), 70);
    addRandom();
    render();
    if (!won && board.some((row) => row.includes(TARGET))) {
      won = true;
      statusEl.textContent = '2048! Можно играть дальше — побейте рекорд.';
      beep(880, 200, 'square');
    }
    if (isOver()) {
      over = true;
      if (score > best) {
        best = score;
        bestEl.textContent = String(best);
        statusEl.textContent = `Игра окончена. Новый рекорд: ${score}!`;
      } else {
        statusEl.textContent = `Игра окончена. Счёт: ${score}.`;
      }
      reportScore(score);
      beep(160, 250, 'sawtooth');
    }
  }

  function isOver() {
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        if (board[y][x] === 0) return false;
        if (x + 1 < SIZE && board[y][x] === board[y][x + 1]) return false;
        if (y + 1 < SIZE && board[y][x] === board[y + 1][x]) return false;
      }
    }
    return true;
  }

  function render() {
    const fragment = document.createDocumentFragment();
    for (let y = 0; y < SIZE; y += 1) {
      for (let x = 0; x < SIZE; x += 1) {
        const value = board[y][x];
        const cell = document.createElement('div');
        cell.className = value === 0 ? 'tile' : `tile t-${value > 2048 ? 'super' : value}`;
        cell.textContent = value === 0 ? '' : String(value);
        fragment.append(cell);
      }
    }
    gridEl.replaceChildren(fragment);
  }

  function newGame() {
    board = Array.from({ length: SIZE }, emptyRow);
    score = 0;
    over = false;
    won = false;
    scoreEl.textContent = '0';
    statusEl.textContent = '';
    addRandom();
    addRandom();
    render();
  }

  const KEY_DIRS = {
    ArrowLeft: 0, KeyA: 0,
    ArrowDown: 1, KeyS: 1,
    ArrowRight: 2, KeyD: 2,
    ArrowUp: 3, KeyW: 3,
  };

  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM') {
      toggleMute();
      return;
    }
    if (event.code in KEY_DIRS) {
      event.preventDefault();
      shift(KEY_DIRS[event.code]);
    }
  });

  let touchStart = null;
  gridEl.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  gridEl.addEventListener('touchend', (event) => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;
    if (Math.abs(dx) > Math.abs(dy)) {
      shift(dx > 0 ? 2 : 0);
    } else {
      shift(dy > 0 ? 1 : 3);
    }
  });

  restartBtn.addEventListener('click', newGame);

  newGame();
})();
