(() => {
  'use strict';

  const W = 320;
  const H = 220;
  const PADDLE_W = 8;
  const PADDLE_H = 52;
  const BALL_R = 5;
  const WIN_SCORE = 7;
  const PLAYER_X = 12;
  const AI_X = W - 12 - PADDLE_W;
  const AI_SPEED = 3.1;

  const canvas = document.getElementById('board');
  const context = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const statusEl = document.getElementById('status');
  const startBtn = document.getElementById('start');

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  context.scale(dpr, dpr);

  let playerY;
  let aiY;
  let ball;
  let playerScore;
  let aiScore;
  let gameState = 'idle';
  let keyUp = false;
  let keyDown = false;

  let audioCtx = null;

  function beep(freq, ms = 50) {
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

  function serve(towardPlayer) {
    const angle = (Math.random() * 0.7 - 0.35) * (towardPlayer ? 1 : -1);
    const dir = towardPlayer ? -1 : 1;
    const speed = 3 + Math.min(playerScore + aiScore, 8) * 0.15;
    ball = {
      x: W / 2,
      y: H / 2,
      vx: Math.cos(angle) * speed * dir,
      vy: Math.sin(angle) * speed,
    };
  }

  function startGame() {
    playerY = (H - PADDLE_H) / 2;
    aiY = (H - PADDLE_H) / 2;
    playerScore = 0;
    aiScore = 0;
    scoreEl.textContent = '0 : 0';
    statusEl.textContent = '';
    startBtn.textContent = 'Заново';
    serve(Math.random() < 0.5);
    gameState = 'running';
    beep(520, 90);
  }

  function point(winner) {
    if (winner === 'player') {
      playerScore += 1;
      beep(760, 100);
    } else {
      aiScore += 1;
      beep(240, 120);
    }
    scoreEl.textContent = `${playerScore} : ${aiScore}`;
    if (playerScore >= WIN_SCORE || aiScore >= WIN_SCORE) {
      gameState = 'over';
      statusEl.textContent = playerScore >= WIN_SCORE
        ? 'Победа! Вы взяли матч. Кнопка — реванш.'
        : 'ИИ взял матч. Кнопка — реванш.';
      startBtn.textContent = 'Старт';
      return;
    }
    serve(winner !== 'player');
  }

  function bounce(paddleY) {
    const hit = (ball.y - paddleY) / PADDLE_H - 0.5;
    const v = Math.min(6, Math.hypot(ball.vx, ball.vy) * 1.04);
    const dir = ball.vx < 0 ? 1 : -1;
    ball.vx = Math.cos(hit * 1.1) * v * dir;
    ball.vy = Math.sin(hit * 1.1) * v;
    beep(500 + Math.abs(Math.round(hit * 200)), 40);
  }

  function step() {
    if (keyUp) playerY = Math.max(0, playerY - 5);
    if (keyDown) playerY = Math.min(H - PADDLE_H, playerY + 5);

    // ИИ: идёт за мячом с ограничением скорости и мёртвой зоной — иначе непобедим.
    const aiCenter = aiY + PADDLE_H / 2;
    if (ball.vx > 0) {
      if (aiCenter < ball.y - 6) aiY = Math.min(H - PADDLE_H, aiY + AI_SPEED);
      else if (aiCenter > ball.y + 6) aiY = Math.max(0, aiY - AI_SPEED);
    } else {
      if (aiCenter < H / 2 - 10) aiY = Math.min(H - PADDLE_H, aiY + AI_SPEED * 0.5);
      else if (aiCenter > H / 2 + 10) aiY = Math.max(0, aiY - AI_SPEED * 0.5);
    }

    ball.x += ball.vx;
    ball.y += ball.vy;
    if (ball.y < BALL_R || ball.y > H - BALL_R) {
      ball.vy = -ball.vy;
      ball.y = Math.max(BALL_R, Math.min(H - BALL_R, ball.y));
      beep(320, 40);
    }
    if (ball.vx < 0 && ball.x - BALL_R <= PLAYER_X + PADDLE_W && ball.x > PLAYER_X && ball.y >= playerY && ball.y <= playerY + PADDLE_H) {
      ball.x = PLAYER_X + PADDLE_W + BALL_R;
      bounce(playerY);
    } else if (ball.vx > 0 && ball.x + BALL_R >= AI_X && ball.x < AI_X + PADDLE_W && ball.y >= aiY && ball.y <= aiY + PADDLE_H) {
      ball.x = AI_X - BALL_R;
      bounce(aiY);
    }
    if (ball.x < -10) point('ai');
    else if (ball.x > W + 10) point('player');
  }

  function draw() {
    context.fillStyle = '#000';
    context.fillRect(0, 0, W, H);
    context.fillStyle = '#14532d';
    for (let y = 6; y < H; y += 16) {
      context.fillRect(W / 2 - 1, y, 2, 8);
    }
    context.fillStyle = '#4ade80';
    context.fillRect(PLAYER_X, playerY ?? (H - PADDLE_H) / 2, PADDLE_W, PADDLE_H);
    context.fillStyle = '#f87171';
    context.fillRect(AI_X, aiY ?? (H - PADDLE_H) / 2, PADDLE_W, PADDLE_H);
    if (ball) {
      context.fillStyle = '#fff';
      context.beginPath();
      context.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
      context.fill();
    }
  }

  function canvasY(clientY) {
    const rect = canvas.getBoundingClientRect();
    return ((clientY - rect.top) / rect.height) * H;
  }

  function movePlayerTo(clientY) {
    playerY = Math.max(0, Math.min(H - PADDLE_H, canvasY(clientY) - PADDLE_H / 2));
  }

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') movePlayerTo(event.clientY);
  });
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (gameState === 'idle' || gameState === 'over') {
      startGame();
      return;
    }
    if (gameState === 'paused') {
      gameState = 'running';
      statusEl.textContent = '';
      return;
    }
    movePlayerTo(event.clientY);
  });
  canvas.addEventListener('touchmove', (event) => {
    event.preventDefault();
    movePlayerTo(event.changedTouches[0].clientY);
  }, { passive: false });

  document.addEventListener('keydown', (event) => {
    if (event.code === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault();
      keyUp = true;
    } else if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      event.preventDefault();
      keyDown = true;
    } else if (event.code === 'Space') {
      event.preventDefault();
      if (gameState === 'idle' || gameState === 'over') startGame();
    }
  });
  document.addEventListener('keyup', (event) => {
    if (event.code === 'ArrowUp' || event.code === 'KeyW') keyUp = false;
    if (event.code === 'ArrowDown' || event.code === 'KeyS') keyDown = false;
  });

  startBtn.addEventListener('click', startGame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameState === 'running') {
      gameState = 'paused';
      statusEl.textContent = 'Пауза — клик, чтобы продолжить.';
    }
  });

  let lastTime = 0;

  function frame(now) {
    if (!lastTime) lastTime = now;
    lastTime = now;
    if (gameState === 'running') {
      step();
      if (gameState === 'running') step();
    }
    draw();
    requestAnimationFrame(frame);
  }

  playerY = (H - PADDLE_H) / 2;
  aiY = (H - PADDLE_H) / 2;
  requestAnimationFrame(frame);
})();
