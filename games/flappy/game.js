(() => {
  'use strict';

  const W = 300;
  const H = 420;
  const BIRD_X = 70;
  const BIRD_R = 12;
  const GRAVITY = 0.35;
  const FLAP = -6;
  const PIPE_W = 52;
  const GAP = 120;
  const SPACING = 170;

  const canvas = document.getElementById('board');
  const context = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const statusEl = document.getElementById('status');

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  context.scale(dpr, dpr);

  let birdY;
  let velocity;
  let pipes;
  let score;
  let best = 0;
  let gameState = 'ready';

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

  function speed() {
    return 2 + Math.floor(score / 10) * 0.3;
  }

  function reset() {
    birdY = H / 2;
    velocity = 0;
    pipes = [];
    score = 0;
    scoreEl.textContent = '0';
  }

  function addPipe() {
    const margin = 50;
    const gapY = margin + Math.random() * (H - GAP - margin * 2);
    pipes.push({ x: W, gapY, passed: false });
  }

  function flap() {
    if (gameState === 'ready') {
      reset();
      gameState = 'flying';
      statusEl.textContent = '';
      addPipe();
    } else if (gameState === 'over') {
      reset();
      gameState = 'flying';
      statusEl.textContent = '';
      addPipe();
    } else if (gameState === 'paused') {
      gameState = 'flying';
      statusEl.textContent = '';
      return;
    } else {
      velocity = FLAP;
      beep(500, 60);
      return;
    }
    velocity = FLAP;
    beep(500, 60);
  }

  function die() {
    gameState = 'over';
    if (score > best) {
      best = score;
      bestEl.textContent = String(best);
      statusEl.textContent = `Столкновение! Новый рекорд: ${score}. Взмах — заново.`;
    } else {
      statusEl.textContent = `Столкновение! Счёт: ${score}. Взмах — заново.`;
    }
    beep(150, 250);
  }

  function step() {
    velocity += GRAVITY;
    birdY += velocity;
    if (birdY + BIRD_R >= H || birdY - BIRD_R <= 0) {
      birdY = Math.max(BIRD_R, Math.min(H - BIRD_R, birdY));
      die();
      return;
    }
    const v = speed();
    if (pipes.length === 0 || pipes[pipes.length - 1].x < W - SPACING) {
      addPipe();
    }
    for (const pipe of pipes) {
      pipe.x -= v;
      if (!pipe.passed && pipe.x + PIPE_W < BIRD_X - BIRD_R) {
        pipe.passed = true;
        score += 1;
        scoreEl.textContent = String(score);
        beep(700 + Math.min(score, 20) * 15, 60);
      }
      if (
        BIRD_X + BIRD_R > pipe.x &&
        BIRD_X - BIRD_R < pipe.x + PIPE_W &&
        (birdY - BIRD_R < pipe.gapY || birdY + BIRD_R > pipe.gapY + GAP)
      ) {
        die();
        return;
      }
    }
    pipes = pipes.filter((pipe) => pipe.x + PIPE_W > 0);
  }

  function draw() {
    context.fillStyle = '#38bdf8';
    context.fillRect(0, 0, W, H);
    context.fillStyle = '#22c55e';
    for (const pipe of pipes) {
      context.fillRect(pipe.x, 0, PIPE_W, pipe.gapY);
      context.fillRect(pipe.x, pipe.gapY + GAP, PIPE_W, H - pipe.gapY - GAP);
    }
    context.fillStyle = '#16a34a';
    context.fillRect(0, H - 24, W, 24);
    context.font = '22px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const tilt = Math.max(-0.4, Math.min(0.5, velocity / 18));
    context.save();
    context.translate(BIRD_X, birdY);
    context.rotate(tilt);
    context.fillText('🐤', 0, 0);
    context.restore();
  }

  document.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      event.preventDefault();
      flap();
    }
  });
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    flap();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameState === 'flying') {
      gameState = 'paused';
      statusEl.textContent = 'Пауза — взмах, чтобы продолжить.';
    }
  });

  reset();
  gameState = 'ready';

  let lastTime = 0;

  function frame(now) {
    if (!lastTime) lastTime = now;
    lastTime = now;
    if (gameState === 'flying') {
      // Два подшага: на скорости птичка не пролетает сквозь трубу.
      step();
      if (gameState === 'flying') step();
    }
    draw();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
