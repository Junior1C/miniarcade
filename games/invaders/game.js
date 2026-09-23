(() => {
  'use strict';

  const W = 300;
  const H = 360;
  const PLAYER_Y = H - 30;
  const PLAYER_W = 30;
  const COLS = 6;
  const ROWS = 4;
  const CELL_W = 40;
  const CELL_H = 28;
  const SWARM_TOP = 40;
  const SWARM_LEFT = 30;

  const canvas = document.getElementById('board');
  const context = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const statusEl = document.getElementById('status');
  const startBtn = document.getElementById('start');

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  context.scale(dpr, dpr);

  let playerX;
  let swarm;
  let swarmDir;
  let bullets;
  let enemyBullets;
  let score;
  let best = 0;
  let level;
  let gameState = 'idle';
  let moveLeft = false;
  let moveRight = false;
  let shootCooldown = 0;

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
      osc.type = 'sawtooth';
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

  function swarmSpeed() {
    const alive = swarm.filter((alien) => alien.alive).length;
    const total = COLS * ROWS;
    return (0.5 + (level - 1) * 0.25) * (1 + ((total - alive) / total) * 2.2);
  }

  function buildSwarm() {
    swarm = [];
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) {
        swarm.push({
          ox: SWARM_LEFT + col * CELL_W,
          oy: SWARM_TOP + row * CELL_H,
          alive: true,
          color: ['#f87171', '#fb923c', '#facc15', '#4ade80'][row],
        });
      }
    }
    swarmDir = 1;
  }

  function startGame() {
    playerX = (W - PLAYER_W) / 2;
    bullets = [];
    enemyBullets = [];
    score = 0;
    level = 1;
    scoreEl.textContent = '0';
    statusEl.textContent = '';
    startBtn.textContent = 'Заново';
    buildSwarm();
    gameState = 'running';
    beep(520, 90);
  }

  function endGame(won) {
    gameState = 'over';
    if (score > best) {
      best = score;
      bestEl.textContent = String(best);
    }
    statusEl.textContent = won
      ? `Победа! Счёт: ${score}. Кнопка или пробел — заново.`
      : `Захватчики прорвались. Счёт: ${score}. Кнопка или пробел — заново.`;
    startBtn.textContent = 'Старт';
    beep(won ? 880 : 150, 250);
  }

  function shoot() {
    if (gameState === 'idle' || gameState === 'over') {
      startGame();
      return;
    }
    if (gameState === 'paused') {
      gameState = 'running';
      statusEl.textContent = '';
      return;
    }
    if (shootCooldown > 0 || bullets.length >= 3) return;
    bullets.push({ x: playerX + PLAYER_W / 2, y: PLAYER_Y - 8 });
    shootCooldown = 12;
    beep(900, 50);
  }

  function step() {
    if (moveLeft) playerX = Math.max(0, playerX - 4);
    if (moveRight) playerX = Math.min(W - PLAYER_W, playerX + 4);
    if (shootCooldown > 0) shootCooldown -= 1;

    const speed = swarmSpeed();
    let edge = false;
    for (const alien of swarm) {
      if (!alien.alive) continue;
      alien.ox += swarmDir * speed;
      if (alien.ox < 4 || alien.ox + 26 > W - 4) edge = true;
    }
    if (edge) {
      swarmDir *= -1;
      for (const alien of swarm) {
        if (!alien.alive) continue;
        alien.oy += 10;
        if (alien.oy + 18 >= PLAYER_Y) {
          endGame(false);
          return;
        }
      }
    }

    // Ответный огонь: случайный живой пришелец из нижней шеренги колонки.
    if (Math.random() < 0.02 + level * 0.004 && enemyBullets.length < 3) {
      const shooters = swarm.filter((alien) => alien.alive);
      if (shooters.length > 0) {
        const shooter = shooters[Math.floor(Math.random() * shooters.length)];
        enemyBullets.push({ x: shooter.ox + 13, y: shooter.oy + 18 });
      }
    }

    for (const bullet of bullets) bullet.y -= 7;
    for (const bullet of enemyBullets) bullet.y += 3 + level * 0.3;
    bullets = bullets.filter((bullet) => bullet.y > -6);
    enemyBullets = enemyBullets.filter((bullet) => bullet.y < H + 6);

    for (const bullet of bullets) {
      for (const alien of swarm) {
        if (!alien.alive) continue;
        if (bullet.x >= alien.ox && bullet.x <= alien.ox + 26 && bullet.y >= alien.oy && bullet.y <= alien.oy + 18) {
          alien.alive = false;
          bullet.y = -100;
          score += 10;
          scoreEl.textContent = String(score);
          beep(700, 50);
          break;
        }
      }
    }
    bullets = bullets.filter((bullet) => bullet.y > -50);

    for (const bullet of enemyBullets) {
      if (
        bullet.x >= playerX &&
        bullet.x <= playerX + PLAYER_W &&
        bullet.y >= PLAYER_Y - 8 &&
        bullet.y <= PLAYER_Y + 8
      ) {
        endGame(false);
        return;
      }
    }

    if (swarm.every((alien) => !alien.alive)) {
      level += 1;
      buildSwarm();
      bullets = [];
      enemyBullets = [];
      statusEl.textContent = `Волна ${level} — рой быстрее!`;
      beep(880, 150);
    }
  }

  function draw() {
    context.fillStyle = '#000';
    context.fillRect(0, 0, W, H);
    for (const alien of swarm || []) {
      if (!alien.alive) continue;
      context.fillStyle = alien.color;
      context.fillRect(alien.ox + 3, alien.oy, 20, 12);
      context.fillRect(alien.ox, alien.oy + 12, 26, 6);
    }
    context.fillStyle = '#4ade80';
    context.fillRect(playerX, PLAYER_Y - 8, PLAYER_W, 8);
    context.fillRect(playerX + PLAYER_W / 2 - 2, PLAYER_Y - 14, 4, 8);
    context.fillStyle = '#fef08a';
    for (const bullet of bullets) context.fillRect(bullet.x - 1, bullet.y - 5, 2, 6);
    context.fillStyle = '#f87171';
    for (const bullet of enemyBullets) context.fillRect(bullet.x - 1, bullet.y - 2, 2, 5);
  }

  document.addEventListener('keydown', (event) => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') {
      event.preventDefault();
      if (gameState === 'running') moveLeft = true;
    } else if (event.code === 'ArrowRight' || event.code === 'KeyD') {
      event.preventDefault();
      if (gameState === 'running') moveRight = true;
    } else if (event.code === 'Space') {
      event.preventDefault();
      shoot();
    }
  });
  document.addEventListener('keyup', (event) => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') moveLeft = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') moveRight = false;
  });

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    shoot();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (gameState !== 'running') return;
    if (event.pointerType === 'mouse' || event.pointerType === 'pen') {
      const rect = canvas.getBoundingClientRect();
      playerX = Math.max(0, Math.min(W - PLAYER_W, ((event.clientX - rect.left) / rect.width) * W - PLAYER_W / 2));
    }
  });
  canvas.addEventListener('touchmove', (event) => {
    event.preventDefault();
    if (gameState !== 'running') return;
    const rect = canvas.getBoundingClientRect();
    const touch = event.changedTouches[0];
    playerX = Math.max(0, Math.min(W - PLAYER_W, ((touch.clientX - rect.left) / rect.width) * W - PLAYER_W / 2));
  }, { passive: false });

  startBtn.addEventListener('click', startGame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameState === 'running') {
      gameState = 'paused';
      statusEl.textContent = 'Пауза — пробел или тап, чтобы продолжить.';
    }
  });

  // Первый кадр рисуется до старта: поле валидно и в idle.
  playerX = (W - PLAYER_W) / 2;
  swarm = [];
  bullets = [];
  enemyBullets = [];

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

  requestAnimationFrame(frame);
})();
