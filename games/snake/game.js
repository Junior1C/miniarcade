(() => {
  'use strict';

  const BOARD_SIZE = 300;
  const CELL = 15;
  const COLS = BOARD_SIZE / CELL;
  const STEP_MS = 120;
  const MIN_STEP_MS = 60;
  const SPEEDUP_PER_FOOD = 3;
  const MAX_DELTA_MS = 100;
  const SWIPE_MIN_PX = 24;

  const DIRECTIONS = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    KeyW: { x: 0, y: -1 },
    KeyS: { x: 0, y: 1 },
    KeyA: { x: -1, y: 0 },
    KeyD: { x: 1, y: 0 },
  };

  const canvas = document.getElementById('board');
  const context = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const statusEl = document.getElementById('status');
  const padBtns = [...document.querySelectorAll('.pad__btn')];

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

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = BOARD_SIZE * dpr;
  canvas.height = BOARD_SIZE * dpr;
  context.scale(dpr, dpr);

  let snake;
  let direction;
  let queuedDirection;
  let food;
  let score;
  let gameState;

  function placeFood() {
    do {
      food = {
        x: Math.floor(Math.random() * COLS),
        y: Math.floor(Math.random() * COLS),
      };
    } while (snake.some((part) => part.x === food.x && part.y === food.y));
  }

  function startGame() {
    snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ];
    direction = { x: 1, y: 0 };
    queuedDirection = null;
    score = 0;
    gameState = 'running';
    scoreEl.textContent = '0';
    statusEl.textContent = '';
    placeFood();
    beep(520, 90);
  }

  function endGame() {
    gameState = 'over';
    statusEl.textContent = `Игра окончена. Счёт: ${score}. Нажмите клавишу или кнопку, чтобы начать заново.`;
    beep(160, 250);
  }

  // Разгон: каждая еда ускоряет шаг, пол — 60мс. Кривая сложности без левел-дизайна.
  function stepInterval() {
    return Math.max(MIN_STEP_MS, STEP_MS - score * SPEEDUP_PER_FOOD);
  }

  function step() {
    if (queuedDirection) {
      direction = queuedDirection;
      queuedDirection = null;
    }

    const head = {
      x: snake[0].x + direction.x,
      y: snake[0].y + direction.y,
    };

    const outside =
      head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= COLS;
    const hitSelf = snake.some((part) => part.x === head.x && part.y === head.y);
    if (outside || hitSelf) {
      endGame();
      return;
    }

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 1;
      scoreEl.textContent = String(score);
      beep(600 + Math.min(score, 20) * 15, 70);
      placeFood();
    } else {
      snake.pop();
    }
  }

  function queueTurn(next) {
    const base = queuedDirection ?? direction;
    if (next.x === -base.x && next.y === -base.y) return;
    if (next.x === base.x && next.y === base.y) return;
    queuedDirection = next;
  }

  // Единая точка ввода: клавиатура, dpad-кнопки и свайпы идут сюда.
  function press(code) {
    const turn = DIRECTIONS[code];
    if (turn) {
      if (gameState === 'paused') {
        resumeGame();
      }
      if (gameState !== 'running') {
        startGame();
        queueTurn(turn);
        return;
      }
      queueTurn(turn);
      return;
    }
    if (gameState === 'over') {
      startGame();
    } else if (gameState === 'paused') {
      resumeGame();
    }
  }

  function onKeyDown(event) {
    if (DIRECTIONS[event.code]) {
      event.preventDefault();
    }
    press(event.code);
  }

  function pauseGame() {
    if (gameState !== 'running') return;
    gameState = 'paused';
    statusEl.textContent = 'Пауза — нажмите клавишу или кнопку, чтобы продолжить.';
  }

  function resumeGame() {
    if (gameState !== 'paused') return;
    gameState = 'running';
    statusEl.textContent = '';
    lastTime = 0;
    accumulator = 0;
  }

  function draw() {
    context.fillStyle = '#111';
    context.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    context.fillStyle = '#ef4444';
    context.fillRect(food.x * CELL, food.y * CELL, CELL, CELL);

    context.fillStyle = '#22c55e';
    for (const part of snake) {
      context.fillRect(part.x * CELL, part.y * CELL, CELL - 1, CELL - 1);
    }
  }

  let lastTime = 0;
  let accumulator = 0;

  function frame(now) {
    if (!lastTime) lastTime = now;
    const delta = Math.min(now - lastTime, MAX_DELTA_MS);
    lastTime = now;

    if (gameState === 'running') {
      accumulator += delta;
      const interval = stepInterval();
      while (accumulator >= interval) {
        if (gameState !== 'running') break;
        step();
        accumulator -= interval;
      }
    } else {
      accumulator = 0;
    }

    draw();
    requestAnimationFrame(frame);
  }

  // Dpad: pointerdown ради latency; preventDefault гасит фокус-скролл и даблтапы.
  for (const btn of padBtns) {
    btn.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      press(btn.dataset.code);
    });
  }

  // Свайпы по полю: мобильный ввод без кнопок.
  let touchStart = null;
  canvas.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.changedTouches[0];
      touchStart = { x: touch.clientX, y: touch.clientY };
    },
    { passive: true },
  );
  canvas.addEventListener('touchend', (event) => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;
    press(
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? 'ArrowRight'
          : 'ArrowLeft'
        : dy > 0
          ? 'ArrowDown'
          : 'ArrowUp',
    );
  });

  // Вкладка скрыта — пауза вместо тихого проигрыша за кадром.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pauseGame();
    }
  });

  document.addEventListener('keydown', onKeyDown);
  startGame();
  requestAnimationFrame(frame);
})();
