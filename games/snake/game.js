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
  const bestEl = document.getElementById('best');
  const statusEl = document.getElementById('status');
  const padBtns = [...document.querySelectorAll('.pad__btn')];

  // SFX без ассетов: чистый WebAudio, офлайн и CSP-safe.
  // M — глушить/вернуть звук (сессия); глаголы различаются тембром.
  let audioCtx = null;
  let muted = false;

  function beep(freq, ms = 80, type = 'triangle') {
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

  function toggleMute() {
    muted = !muted;
    statusEl.textContent = muted ? 'Звук выключен (M — вернуть).' : 'Звук включён.';
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
  let best = 0;
  let gameState;

  // Juice: пул частиц без аллокаций в кадре + тряска экрана на смерть.
  // Всё за гардом reduced-motion (CSS-медиа canvas-цикл не глушит).
  const reduceMotion =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const particles = [];
  let shakeUntil = 0;

  function burst(x, y, color, count = 10) {
    if (reduceMotion) return;
    for (let i = 0; i < count; i += 1) {
      if (particles.length >= 40) particles.shift();
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 90;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 300,
        color,
      });
    }
  }

  function tickParticles(dtMs) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const part = particles[i];
      part.life -= dtMs;
      if (part.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      part.x += (part.vx * dtMs) / 1000;
      part.y += (part.vy * dtMs) / 1000;
    }
  }

  // Протокол рекордов каталога: портал хранит best в своём localStorage
  // (игре storage недоступен — opaque origin), внутриигровой best — сессия.
  function reportScore() {
    if (score > best) {
      best = score;
      if (bestEl) bestEl.textContent = String(best);
    }
    try {
      parent.postMessage({ type: 'miniarcade:score', game: 'snake', score }, '*');
    } catch {
      // Вне каталога (прямая страница) — некому слушать.
    }
  }

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
    beep(520, 90, 'square');
  }

  function showReady() {
    snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ];
    direction = { x: 1, y: 0 };
    queuedDirection = null;
    score = 0;
    gameState = 'ready';
    scoreEl.textContent = '0';
    if (bestEl) bestEl.textContent = String(best);
    statusEl.textContent = 'Нажмите клавишу, стрелку, кнопку или свайп — старт.';
    placeFood();
  }

  function endGame() {
    gameState = 'over';
    const isRecord = score > best && score > 0;
    reportScore();
    if (!reduceMotion) shakeUntil = performance.now() + 150;
    if (isRecord) {
      statusEl.textContent = `Игра окончена. Новый рекорд: ${score}! Клавиша или кнопка — заново.`;
    } else {
      statusEl.textContent = `Игра окончена. Счёт: ${score}. Нажмите клавишу или кнопку, чтобы начать заново.`;
    }
    beep(160, 250, 'sawtooth');
  }

  // Разгон: каждая еда ускоряет шаг, пол — 60мс. Первые 3 еды —
  // grace-период без ускорения: новичок осваивается до разгона.
  function stepInterval() {
    return Math.max(MIN_STEP_MS, STEP_MS - Math.max(0, score - 3) * SPEEDUP_PER_FOOD);
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
      beep(600 + Math.min(score, 20) * 15, 70, 'square');
      burst(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, '#ef4444');
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
  // M — звук вкл/выкл (вне directions, чтобы не стартовать игру).
  function press(code) {
    if (code === 'KeyM') {
      toggleMute();
      return;
    }
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
    if (gameState === 'over' || gameState === 'ready') {
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
    context.save();
    if (!reduceMotion && performance.now() < shakeUntil) {
      context.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    }
    context.fillStyle = '#111';
    context.fillRect(-8, -8, BOARD_SIZE + 16, BOARD_SIZE + 16);

    context.fillStyle = '#ef4444';
    context.fillRect(food.x * CELL, food.y * CELL, CELL, CELL);

    context.fillStyle = '#22c55e';
    for (const part of snake) {
      context.fillRect(part.x * CELL, part.y * CELL, CELL - 1, CELL - 1);
    }
    for (const part of particles) {
      context.globalAlpha = Math.max(0, part.life / 300);
      context.fillStyle = part.color;
      context.fillRect(part.x - 2, part.y - 2, 4, 4);
    }
    context.globalAlpha = 1;
    context.restore();
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

    tickParticles(delta);
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
  showReady();
  requestAnimationFrame(frame);
})();
