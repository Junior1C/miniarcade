(() => {
  'use strict';

  const W = 320;
  const H = 200;
  const GROUND = 160;
  const DINO_X = 40;
  const DINO_W = 22;
  const DINO_H = 30;
  const DUCK_H = 16;
  const GRAVITY = 0.7;
  const JUMP_V = -11.5;
  const BASE_SPEED = 4;

  const canvas = document.getElementById('board');
  const context = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const statusEl = document.getElementById('status');

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  context.scale(dpr, dpr);

  let dinoY;
  let velocity;
  let ducking;
  let obstacles;
  let distance;
  let best = 0;
  let gameState = 'ready';
  let spawnIn;
  let spawned = 0;
  let legFrame;

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
      parent.postMessage({ type: 'miniarcade:score', game: 'dino', score: value }, '*');
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
    return BASE_SPEED + Math.floor(distance / 500) * 0.4;
  }

  function reset() {
    dinoY = GROUND - DINO_H;
    velocity = 0;
    ducking = false;
    obstacles = [];
    distance = 0;
    // Grace-период: первый кактус далеко, птеров в начале нет —
    // новичок успевает понять управление до первого препятствия.
    spawnIn = 110;
    spawned = 0;
    scoreEl.textContent = '0';
  }

  function start() {
    reset();
    gameState = 'running';
    statusEl.textContent = '';
    beep(520, 90);
  }

  function jump() {
    if (gameState === 'ready' || gameState === 'over') {
      start();
      return;
    }
    if (gameState === 'paused') {
      gameState = 'running';
      statusEl.textContent = '';
      return;
    }
    if (dinoY >= GROUND - DINO_H - 1) {
      velocity = JUMP_V;
      beep(600, 60);
    }
  }

  function spawnObstacle() {
    spawned += 1;
    // Первые два препятствия — низкие кактусы с запасом: вход мягкий.
    if (spawned <= 2) {
      obstacles.push({ kind: 'cactus', x: W, y: GROUND - 20, w: 12, h: 20 });
      return;
    }
    const fast = distance > 300;
    if (fast && Math.random() < 0.3) {
      obstacles.push({ kind: 'ptero', x: W, y: GROUND - 34 - Math.random() * 18, w: 26, h: 16 });
    } else {
      const big = Math.random() < 0.35;
      obstacles.push({
        kind: 'cactus',
        x: W,
        y: GROUND - (big ? 30 : 20),
        w: big ? 16 : 12,
        h: big ? 30 : 20,
      });
    }
  }

  function dinoBox() {
    const h = ducking ? DUCK_H : DINO_H;
    return { x: DINO_X + 3, y: dinoY + (DINO_H - h), w: DINO_W - 6, h: h - 2 };
  }

  function hit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function die() {
    gameState = 'over';
    const score = Math.floor(distance / 10);
    if (score > best) {
      best = score;
      bestEl.textContent = String(best);
      statusEl.textContent = `Столкновение! Новый рекорд: ${score}. Прыжок — заново.`;
    } else {
      statusEl.textContent = `Столкновение! Счёт: ${score}. Прыжок — заново.`;
    }
    reportScore(score);
    beep(150, 250, 'sawtooth');
  }

  function step() {
    distance += speed();
    if (Math.floor(distance / 10) !== Number(scoreEl.textContent)) {
      scoreEl.textContent = String(Math.floor(distance / 10));
      if (Math.floor(distance / 10) % 100 === 0) beep(880, 100);
    }
    velocity += GRAVITY;
    dinoY += velocity;
    if (dinoY >= GROUND - DINO_H) {
      dinoY = GROUND - DINO_H;
      velocity = 0;
    }
    legFrame = (legFrame + speed() * 0.02) % 2;
    spawnIn -= 1;
    if (spawnIn <= 0) {
      spawnObstacle();
      spawnIn = Math.max(45, 110 - speed() * 8) + Math.random() * 60;
    }
    const box = dinoBox();
    for (const obstacle of obstacles) {
      obstacle.x -= speed();
      if (hit(box, obstacle)) {
        die();
        return;
      }
    }
    obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.w > 0);
  }

  function draw() {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, W, H);
    context.fillStyle = '#a16207';
    context.fillRect(0, GROUND, W, 2);
    context.fillStyle = '#78716c';
    for (const obstacle of obstacles) {
      if (obstacle.kind === 'cactus') {
        context.fillRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h);
        context.fillRect(obstacle.x - 4, obstacle.y + 8, 4, 6);
        context.fillRect(obstacle.x + obstacle.w, obstacle.y + 6, 4, 6);
      } else {
        context.fillRect(obstacle.x, obstacle.y + 6, obstacle.w, 4);
        const wing = Math.floor(performance.now() / 150) % 2 === 0 ? -6 : 6;
        context.fillRect(obstacle.x + 6, obstacle.y + 6 + wing, 12, 4);
      }
    }
    const h = ducking ? DUCK_H : DINO_H;
    const y = dinoY + (DINO_H - h);
    context.fillStyle = '#422006';
    if (ducking) {
      context.fillRect(DINO_X - 6, y, DINO_W + 12, h);
    } else {
      context.fillRect(DINO_X, y, DINO_W, h);
      context.fillRect(DINO_X + 2, y - 8, 14, 10);
      const leg = Math.floor(legFrame) === 0 ? 0 : 5;
      context.fillRect(DINO_X + 3 + leg, y + h, 5, 6);
      context.fillRect(DINO_X + 14 - leg, y + h, 5, 6);
    }
    context.fillStyle = '#422006';
    context.beginPath();
    context.arc(DINO_X + DINO_W + 4, y + 2, 2, 0, Math.PI * 2);
    context.fill();
  }

  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM') {
      toggleMute();
      return;
    }
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault();
      jump();
    } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      event.preventDefault();
      if (gameState === 'running') ducking = true;
    }
  });
  document.addEventListener('keyup', (event) => {
    if (event.code === 'ArrowDown' || event.code === 'KeyS') ducking = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    jump();
  });

  // Кнопка пригибания для тача: птеры после distance > 300 иначе
  // непроходимы без клавиатуры. Удержание = ducking, отпускание = встать.
  const duckBtn = document.getElementById('duck');
  if (duckBtn) {
    const duckDown = (event) => {
      event.preventDefault();
      if (gameState === 'running') ducking = true;
    };
    const duckUp = () => {
      ducking = false;
    };
    duckBtn.addEventListener('pointerdown', duckDown);
    duckBtn.addEventListener('pointerup', duckUp);
    duckBtn.addEventListener('pointercancel', duckUp);
    duckBtn.addEventListener('pointerleave', duckUp);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameState === 'running') {
      gameState = 'paused';
      statusEl.textContent = 'Пауза — прыжок, чтобы продолжить.';
    }
  });

  reset();

  // Фиксированный шаг симуляции: два подшага за кадр 60 Гц.
  // Аккумулятор отвязывает скорость от частоты экрана: на 120 Гц
  // игра идёт так же, как на 60 (как в snake/tetris).
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

  requestAnimationFrame(frame);
})();
