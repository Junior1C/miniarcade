(() => {
  'use strict';

  const W = 320;
  const H = 360;
  const PADDLE_W = 64;
  const PADDLE_H = 10;
  const PADDLE_Y = H - 28;
  const BALL_R = 5;
  const BRICK_COLS = 6;
  const BRICK_ROWS = 5;
  const BRICK_W = W / BRICK_COLS;
  const BRICK_H = 20;
  const BRICK_TOP = 40;
  const BRICK_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'];
  const BASE_SPEED = 3;

  const canvas = document.getElementById('board');
  const context = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const bestEl = document.getElementById('best');
  const statusEl = document.getElementById('status');
  const startBtn = document.getElementById('start');

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  context.scale(dpr, dpr);

  let paddleX;
  let ball;
  let bricks;
  let score;
  let best = 0;
  let lives;
  let level;
  let gameState = 'idle';
  let keysLeft = false;
  let keysRight = false;

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
      parent.postMessage({ type: 'miniarcade:score', game: 'breakout', score: value }, '*');
    } catch {
      // Вне каталога — некому слушать.
    }
  }

  function beep(freq, ms = 60, type = 'square') {
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
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + ms / 1000);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + ms / 1000);
    } catch {
      // Без звука игра продолжается как раньше.
    }
  }

  function speed() {
    return BASE_SPEED + (level - 1) * 0.7;
  }

  function buildBricks() {
    bricks = [];
    for (let row = 0; row < BRICK_ROWS; row += 1) {
      for (let col = 0; col < BRICK_COLS; col += 1) {
        bricks.push({ x: col * BRICK_W, y: BRICK_TOP + row * BRICK_H, alive: true, color: BRICK_COLORS[row] });
      }
    }
  }

  function resetBall() {
    ball = { x: W / 2, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, stuck: true };
  }

  function startGame() {
    score = 0;
    lives = 3;
    level = 1;
    paddleX = (W - PADDLE_W) / 2;
    buildBricks();
    resetBall();
    gameState = 'serve';
    scoreEl.textContent = '0';
    livesEl.textContent = '3';
    statusEl.textContent = 'Клик, тап или пробел — запуск мяча.';
    startBtn.textContent = 'Заново';
    beep(520, 90);
  }

  function launch() {
    if (gameState === 'idle' || gameState === 'over' || gameState === 'win') {
      startGame();
      return;
    }
    if (gameState === 'paused') {
      gameState = ball.stuck ? 'serve' : 'running';
      statusEl.textContent = '';
      return;
    }
    if (gameState === 'serve' && ball.stuck) {
      const angle = (Math.random() * 0.6 + 0.2) * (Math.random() < 0.5 ? 1 : -1);
      const v = speed();
      ball.vx = Math.sin(angle) * v;
      ball.vy = -Math.cos(angle) * v;
      ball.stuck = false;
      gameState = 'running';
      statusEl.textContent = '';
      beep(600, 70);
    }
  }

  function loseLife() {
    lives -= 1;
    livesEl.textContent = String(lives);
      beep(180, 200, 'sawtooth');
    if (lives <= 0) {
      gameState = 'over';
      if (score > best) {
        best = score;
        bestEl.textContent = String(best);
        statusEl.textContent = `Игра окончена. Новый рекорд: ${score}!`;
      } else {
        statusEl.textContent = `Игра окончена. Счёт: ${score}.`;
      }
      reportScore(score);
      return;
    }
    resetBall();
    gameState = 'serve';
    statusEl.textContent = `Осталось жизней: ${lives}. Запуск — клик или пробел.`;
  }

  function nextLevel() {
    level += 1;
    buildBricks();
    resetBall();
    gameState = 'serve';
    statusEl.textContent = `Уровень ${level} — мяч быстрее! Запуск — клик или пробел.`;
    beep(880, 150);
  }

  function step() {
    if (keysLeft) paddleX = Math.max(0, paddleX - 6);
    if (keysRight) paddleX = Math.min(W - PADDLE_W, paddleX + 6);
    if (ball.stuck) {
      ball.x = paddleX + PADDLE_W / 2;
      ball.y = PADDLE_Y - BALL_R - 1;
      return;
    }
    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x < BALL_R || ball.x > W - BALL_R) {
      ball.vx = -ball.vx;
      ball.x = Math.max(BALL_R, Math.min(W - BALL_R, ball.x));
      beep(300, 40);
    }
    if (ball.y < BALL_R) {
      ball.vy = -ball.vy;
      ball.y = BALL_R;
      beep(300, 40);
    }
    if (ball.y > H) {
      loseLife();
      return;
    }
    if (
      ball.vy > 0 &&
      ball.y + BALL_R >= PADDLE_Y &&
      ball.y + BALL_R <= PADDLE_Y + PADDLE_H + 6 &&
      ball.x >= paddleX &&
      ball.x <= paddleX + PADDLE_W
    ) {
      const hit = (ball.x - paddleX) / PADDLE_W - 0.5;
      const v = Math.hypot(ball.vx, ball.vy);
      ball.vx = hit * 2 * v * 0.75;
      ball.vy = -Math.sqrt(Math.max(1, v * v - ball.vx * ball.vx));
      ball.y = PADDLE_Y - BALL_R;
      beep(440, 50);
    }
    for (const brick of bricks) {
      if (!brick.alive) continue;
      if (
        ball.x + BALL_R >= brick.x &&
        ball.x - BALL_R <= brick.x + BRICK_W &&
        ball.y + BALL_R >= brick.y &&
        ball.y - BALL_R <= brick.y + BRICK_H
      ) {
        brick.alive = false;
        ball.vy = -ball.vy;
        score += 10;
        scoreEl.textContent = String(score);
        beep(700 + Math.min(score, 500), 50);
        break;
      }
    }
    if (bricks.every((brick) => !brick.alive)) {
      nextLevel();
    }
  }

  function draw() {
    context.fillStyle = '#0a0a0a';
    context.fillRect(0, 0, W, H);
    for (const brick of bricks || []) {
      if (!brick.alive) continue;
      context.fillStyle = brick.color;
      context.fillRect(brick.x + 1, brick.y + 1, BRICK_W - 2, BRICK_H - 2);
    }
    context.fillStyle = '#fafafa';
    context.fillRect(paddleX ?? (W - PADDLE_W) / 2, PADDLE_Y, PADDLE_W, PADDLE_H);
    if (ball) {
      context.beginPath();
      context.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      context.fillStyle = '#facc15';
      context.fill();
    }
  }

  // Фиксированный шаг симуляции: два подшага за кадр 60 Гц, чтобы мяч
  // не пролетал сквозь кирпич на скорости. Аккумулятор отвязывает темп
  // от частоты экрана: на 120 Гц игра идёт так же, как на 60.
  const STEP_MS = 1000 / 120;
  const MAX_DELTA_MS = 250;
  let lastTime = 0;
  let accumulator = 0;

  function frame(now) {
    if (!lastTime) lastTime = now;
    let delta = now - lastTime;
    lastTime = now;
    if (!(delta >= 0)) delta = 0;
    if (delta > MAX_DELTA_MS) delta = MAX_DELTA_MS;
    if (gameState === 'running') {
      accumulator += delta;
      let guard = 0;
      while (accumulator >= STEP_MS && gameState === 'running' && guard < 5) {
        step();
        accumulator -= STEP_MS;
        guard += 1;
      }
      if (guard >= 5) accumulator = 0;
    } else {
      accumulator = 0;
    }
    draw();
    requestAnimationFrame(frame);
  }

  function canvasX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * W;
  }

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
      paddleX = Math.max(0, Math.min(W - PADDLE_W, canvasX(event.clientX) - PADDLE_W / 2));
    }
  });
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') {
      paddleX = Math.max(0, Math.min(W - PADDLE_W, canvasX(event.clientX) - PADDLE_W / 2));
    }
    launch();
  });
  canvas.addEventListener('touchmove', (event) => {
    event.preventDefault();
    const touch = event.changedTouches[0];
    paddleX = Math.max(0, Math.min(W - PADDLE_W, canvasX(touch.clientX) - PADDLE_W / 2));
  }, { passive: false });

  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM') {
      toggleMute();
      return;
    }
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      event.preventDefault();
      keysLeft = true;
    } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      event.preventDefault();
      keysRight = true;
    } else if (event.code === 'Space') {
      event.preventDefault();
      launch();
    }
  });
  document.addEventListener('keyup', (event) => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') keysLeft = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') keysRight = false;
  });

  startBtn.addEventListener('click', startGame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameState === 'running') {
      gameState = 'paused';
      statusEl.textContent = 'Пауза — клик или пробел, чтобы продолжить.';
    }
  });

  paddleX = (W - PADDLE_W) / 2;
  requestAnimationFrame(frame);
})();
