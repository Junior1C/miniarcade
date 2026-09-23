(() => {
  'use strict';

  const COLS = 10;
  const ROWS = 20;
  const CELL = 20;
  const SWIPE_MIN_PX = 24;

  const SHAPES = {
    I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
    O: [[1, 1], [1, 1]],
    T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
    S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
    Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
    J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
    L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
  };
  const KEYS = Object.keys(SHAPES);
  const COLORS = { I: '#22d3ee', O: '#facc15', T: '#c084fc', S: '#4ade80', Z: '#f87171', J: '#60a5fa', L: '#fb923c' };
  const LINE_SCORE = [0, 100, 300, 500, 800];

  const canvas = document.getElementById('board');
  const context = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const levelEl = document.getElementById('level');
  const bestEl = document.getElementById('best');
  const statusEl = document.getElementById('status');
  const startBtn = document.getElementById('start');

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = COLS * CELL * dpr;
  canvas.height = ROWS * CELL * dpr;
  context.scale(dpr, dpr);

  let board;
  let piece;
  let score;
  let best = 0;
  let lines;
  let level;
  let gameState = 'idle';

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
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + ms / 1000);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + ms / 1000);
    } catch {
      // Без звука игра продолжается как раньше.
    }
  }

  function emptyBoard() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function spawn() {
    const kind = KEYS[Math.floor(Math.random() * KEYS.length)];
    piece = {
      kind,
      matrix: SHAPES[kind].map((row) => [...row]),
      x: Math.floor(COLS / 2) - 1,
      y: 0,
    };
    if (collides(piece.matrix, piece.x, piece.y)) {
      endGame();
    }
  }

  function collides(matrix, ox, oy) {
    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < matrix[y].length; x += 1) {
        if (!matrix[y][x]) continue;
        const bx = ox + x;
        const by = oy + y;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && board[by][bx]) return true;
      }
    }
    return false;
  }

  function rotate(matrix) {
    const n = matrix.length;
    const result = Array.from({ length: n }, () => Array(n).fill(0));
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        result[x][n - 1 - y] = matrix[y][x];
      }
    }
    return result;
  }

  function tryRotate() {
    if (gameState !== 'running') return;
    const turned = rotate(piece.matrix);
    for (const dx of [0, -1, 1, -2, 2]) {
      if (!collides(turned, piece.x + dx, piece.y)) {
        piece.matrix = turned;
        piece.x += dx;
        beep(500, 50);
        return;
      }
    }
  }

  function move(dx, dy) {
    if (gameState !== 'running') return false;
    if (!collides(piece.matrix, piece.x + dx, piece.y + dy)) {
      piece.x += dx;
      piece.y += dy;
      return true;
    }
    return false;
  }

  function drop() {
    if (gameState !== 'running') return;
    while (move(0, 1)) {
      score += 1;
    }
    lock();
    beep(300, 60);
  }

  function lock() {
    for (let y = 0; y < piece.matrix.length; y += 1) {
      for (let x = 0; x < piece.matrix[y].length; x += 1) {
        if (piece.matrix[y][x] && piece.y + y >= 0) {
          board[piece.y + y][piece.x + x] = piece.kind;
        }
      }
    }
    const cleared = clearLines();
    if (cleared > 0) {
      const gained = LINE_SCORE[cleared] * level;
      score += gained;
      lines += cleared;
      const nextLevel = Math.floor(lines / 10) + 1;
      if (nextLevel !== level) {
        level = nextLevel;
        levelEl.textContent = String(level);
        beep(880, 150);
      } else {
        beep(660, 100);
      }
      scoreEl.textContent = String(score);
    }
    spawn();
  }

  function clearLines() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= 0; y -= 1) {
      if (board[y].every((cell) => cell)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(null));
        cleared += 1;
        y += 1;
      }
    }
    return cleared;
  }

  function interval() {
    return Math.max(90, 700 - (level - 1) * 60);
  }

  function startGame() {
    board = emptyBoard();
    score = 0;
    lines = 0;
    level = 1;
    gameState = 'running';
    scoreEl.textContent = '0';
    levelEl.textContent = '1';
    statusEl.textContent = '';
    startBtn.textContent = 'Пауза';
    spawn();
    beep(520, 90);
  }

  function endGame() {
    gameState = 'over';
    if (score > best) {
      best = score;
      bestEl.textContent = String(best);
      statusEl.textContent = `Игра окончена. Новый рекорд: ${score}! Кнопка или клавиша — заново.`;
    } else {
      statusEl.textContent = `Игра окончена. Счёт: ${score}. Кнопка или клавиша — заново.`;
    }
    startBtn.textContent = 'Старт';
    beep(160, 250);
  }

  function togglePause() {
    if (gameState === 'running') {
      gameState = 'paused';
      statusEl.textContent = 'Пауза — кнопка или клавиша, чтобы продолжить.';
      startBtn.textContent = 'Продолжить';
    } else if (gameState === 'paused') {
      gameState = 'running';
      statusEl.textContent = '';
      startBtn.textContent = 'Пауза';
      lastTime = 0;
      accumulator = 0;
    }
  }

  function act(action) {
    if (gameState === 'idle' || gameState === 'over') {
      startGame();
      return;
    }
    if (gameState === 'paused' && action !== 'pause') {
      togglePause();
      return;
    }
    if (action === 'left') move(-1, 0);
    else if (action === 'right') move(1, 0);
    else if (action === 'down') {
      if (!move(0, 1)) lock();
    } else if (action === 'rotate') tryRotate();
    else if (action === 'drop') drop();
    else if (action === 'pause') togglePause();
  }

  document.addEventListener('keydown', (event) => {
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault();
        act('left');
        break;
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault();
        act('right');
        break;
      case 'ArrowDown':
      case 'KeyS':
        event.preventDefault();
        act('down');
        break;
      case 'ArrowUp':
      case 'KeyW':
        event.preventDefault();
        act('rotate');
        break;
      case 'Space':
        event.preventDefault();
        if (gameState === 'running') act('drop');
        else act('pause');
        break;
      case 'KeyP':
        if (gameState === 'running' || gameState === 'paused') togglePause();
        break;
      default:
        break;
    }
  });

  document.querySelectorAll('.pad__btn[data-act]').forEach((btn) => {
    btn.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      act(btn.dataset.act);
    });
  });

  startBtn.addEventListener('click', () => {
    if (gameState === 'idle' || gameState === 'over') startGame();
    else togglePause();
  });

  let touchStart = null;
  canvas.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY, time: performance.now() };
  }, { passive: true });
  canvas.addEventListener('touchend', (event) => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    const dt = performance.now() - touchStart.time;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) {
      if (dt < 300) act('rotate');
      return;
    }
    if (Math.abs(dx) > Math.abs(dy)) {
      act(dx > 0 ? 'right' : 'left');
    } else {
      act(dy > 0 ? 'down' : 'rotate');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameState === 'running') togglePause();
  });

  function drawCell(x, y, color, ghost = false) {
    context.fillStyle = ghost ? 'rgba(148, 163, 184, 0.25)' : color;
    context.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2);
  }

  function draw() {
    context.fillStyle = '#020617';
    context.fillRect(0, 0, COLS * CELL, ROWS * CELL);
    if (!board) return;
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (board[y][x]) drawCell(x, y, COLORS[board[y][x]]);
      }
    }
    if (piece && gameState !== 'idle') {
      let gy = piece.y;
      while (!collides(piece.matrix, piece.x, gy + 1)) gy += 1;
      piece.matrix.forEach((row, y) => {
        row.forEach((cell, x) => {
          if (cell && gy !== piece.y) drawCell(piece.x + x, gy + y, null, true);
        });
      });
      piece.matrix.forEach((row, y) => {
        row.forEach((cell, x) => {
          if (cell && piece.y + y >= 0) drawCell(piece.x + x, piece.y + y, COLORS[piece.kind]);
        });
      });
    }
  }

  let lastTime = 0;
  let accumulator = 0;

  function frame(now) {
    if (!lastTime) lastTime = now;
    const delta = Math.min(now - lastTime, 100);
    lastTime = now;
    if (gameState === 'running') {
      accumulator += delta;
      const step = interval();
      while (accumulator >= step) {
        if (gameState !== 'running') break;
        if (!move(0, 1)) lock();
        accumulator -= step;
      }
    } else {
      accumulator = 0;
    }
    draw();
    requestAnimationFrame(frame);
  }

  board = emptyBoard();
  requestAnimationFrame(frame);
})();
