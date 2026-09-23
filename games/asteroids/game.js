(() => {
  'use strict';

  const W = 320;
  const H = 320;
  const TURN = 0.09;
  const THRUST = 0.14;
  const FRICTION = 0.992;
  const BULLET_SPEED = 6;
  const FIRE_GAP = 9;

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

  let ship;
  let rocks;
  let bullets;
  let score;
  let best = 0;
  let lives;
  let level;
  let gameState = 'idle';
  let fireCooldown = 0;
  let invincibleUntil = 0;
  let keys = {};

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

  function wrap(value, max) {
    if (value < 0) return value + max;
    if (value >= max) return value - max;
    return value;
  }

  function spawnRocks(count) {
    rocks = [];
    for (let i = 0; i < count; i += 1) {
      let x;
      let y;
      do {
        x = Math.random() * W;
        y = Math.random() * H;
      } while (Math.hypot(x - W / 2, y - H / 2) < 90);
      const angle = Math.random() * Math.PI * 2;
      const v = 0.5 + Math.random() * 0.7 + level * 0.1;
      rocks.push({ x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, r: 22, spin: (Math.random() - 0.5) * 0.06, rot: 0 });
    }
  }

  function startGame() {
    ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2 };
    bullets = [];
    score = 0;
    lives = 3;
    level = 1;
    scoreEl.textContent = '0';
    livesEl.textContent = '3';
    statusEl.textContent = '';
    startBtn.textContent = 'Заново';
    spawnRocks(4);
    invincibleUntil = performance.now() + 2000;
    gameState = 'running';
    beep(520, 90);
  }

  function endGame() {
    gameState = 'over';
    if (score > best) {
      best = score;
      bestEl.textContent = String(best);
      statusEl.textContent = `Корабль разрушен. Новый рекорд: ${score}! Кнопка или пробел — заново.`;
    } else {
      statusEl.textContent = `Корабль разрушен. Счёт: ${score}. Кнопка или пробел — заново.`;
    }
    startBtn.textContent = 'Старт';
    beep(140, 300);
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
    if (fireCooldown > 0) return;
    fireCooldown = FIRE_GAP;
    bullets.push({
      x: ship.x + Math.cos(ship.angle) * 14,
      y: ship.y + Math.sin(ship.angle) * 14,
      vx: ship.vx + Math.cos(ship.angle) * BULLET_SPEED,
      vy: ship.vy + Math.sin(ship.angle) * BULLET_SPEED,
      life: 50,
    });
    beep(950, 40);
  }

  function splitRock(index) {
    const rock = rocks[index];
    rocks.splice(index, 1);
    score += rock.r > 16 ? 20 : rock.r > 10 ? 50 : 100;
    scoreEl.textContent = String(score);
    beep(rock.r > 10 ? 400 : 700, 70);
    if (rock.r > 10) {
      for (let i = 0; i < 2; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const v = Math.hypot(rock.vx, rock.vy) + 0.6;
        rocks.push({
          x: rock.x,
          y: rock.y,
          vx: Math.cos(angle) * v,
          vy: Math.sin(angle) * v,
          r: rock.r / 2,
          spin: (Math.random() - 0.5) * 0.1,
          rot: 0,
        });
      }
    }
    if (rocks.length === 0) {
      level += 1;
      statusEl.textContent = `Уровень ${level} — камней больше!`;
      spawnRocks(3 + level);
      beep(880, 150);
    }
  }

  function crash() {
    lives -= 1;
    livesEl.textContent = String(lives);
    beep(160, 250);
    if (lives <= 0) {
      endGame();
      return;
    }
    ship.x = W / 2;
    ship.y = H / 2;
    ship.vx = 0;
    ship.vy = 0;
    invincibleUntil = performance.now() + 2000;
    statusEl.textContent = `Осталось жизней: ${lives}.`;
  }

  function step(now) {
    if (keys.left) ship.angle -= TURN;
    if (keys.right) ship.angle += TURN;
    if (keys.thrust) {
      ship.vx += Math.cos(ship.angle) * THRUST;
      ship.vy += Math.sin(ship.angle) * THRUST;
    }
    ship.vx *= FRICTION;
    ship.vy *= FRICTION;
    ship.x = wrap(ship.x + ship.vx, W);
    ship.y = wrap(ship.y + ship.vy, H);
    if (fireCooldown > 0) fireCooldown -= 1;

    for (const bullet of bullets) {
      bullet.x = wrap(bullet.x + bullet.vx, W);
      bullet.y = wrap(bullet.y + bullet.vy, H);
      bullet.life -= 1;
    }
    bullets = bullets.filter((bullet) => bullet.life > 0);

    for (const rock of rocks) {
      rock.x = wrap(rock.x + rock.vx, W);
      rock.y = wrap(rock.y + rock.vy, H);
      rock.rot += rock.spin;
    }

    for (let i = rocks.length - 1; i >= 0; i -= 1) {
      const rock = rocks[i];
      for (const bullet of bullets) {
        if (bullet.life > 0 && Math.hypot(bullet.x - rock.x, bullet.y - rock.y) < rock.r) {
          bullet.life = 0;
          splitRock(i);
          break;
        }
      }
    }
    bullets = bullets.filter((bullet) => bullet.life > 0);

    if (now > invincibleUntil) {
      for (const rock of rocks) {
        if (Math.hypot(ship.x - rock.x, ship.y - rock.y) < rock.r + 7) {
          crash();
          break;
        }
      }
    }
  }

  function draw(now) {
    context.fillStyle = '#000';
    context.fillRect(0, 0, W, H);
    context.strokeStyle = '#94a3b8';
    context.lineWidth = 1.5;
    for (const rock of rocks) {
      context.beginPath();
      const sides = 7;
      for (let i = 0; i <= sides; i += 1) {
        const angle = rock.rot + (i / sides) * Math.PI * 2;
        const px = rock.x + Math.cos(angle) * rock.r;
        const py = rock.y + Math.sin(angle) * rock.r;
        if (i === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      }
      context.stroke();
    }
    const blink = now < invincibleUntil && Math.floor(now / 150) % 2 === 0;
    if (!blink) {
      context.save();
      context.translate(ship.x, ship.y);
      context.rotate(ship.angle + Math.PI / 2);
      context.beginPath();
      context.moveTo(0, -12);
      context.lineTo(-8, 10);
      context.lineTo(0, 5);
      context.lineTo(8, 10);
      context.closePath();
      context.strokeStyle = '#f8fafc';
      context.stroke();
      if (keys.thrust && gameState === 'running') {
        context.beginPath();
        context.moveTo(-4, 10);
        context.lineTo(0, 18);
        context.lineTo(4, 10);
        context.strokeStyle = '#facc15';
        context.stroke();
      }
      context.restore();
    }
    context.fillStyle = '#fef08a';
    for (const bullet of bullets) {
      context.fillRect(bullet.x - 1, bullet.y - 1, 2, 2);
    }
  }

  document.addEventListener('keydown', (event) => {
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        event.preventDefault();
        keys.left = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        event.preventDefault();
        keys.right = true;
        break;
      case 'ArrowUp':
      case 'KeyW':
        event.preventDefault();
        keys.thrust = true;
        break;
      case 'Space':
        event.preventDefault();
        shoot();
        break;
      default:
        break;
    }
  });
  document.addEventListener('keyup', (event) => {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') keys.left = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') keys.right = false;
    if (event.code === 'ArrowUp' || event.code === 'KeyW') keys.thrust = false;
  });

  startBtn.addEventListener('click', startGame);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameState === 'running') {
      gameState = 'paused';
      statusEl.textContent = 'Пауза — пробел, чтобы продолжить.';
    }
  });

  // Первый кадр рисуется до старта: поле валидно и в idle.
  ship = { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2 };
  rocks = [];
  bullets = [];

  let lastTime = 0;

  function frame(now) {
    if (!lastTime) lastTime = now;
    lastTime = now;
    if (gameState === 'running') {
      step(now);
      if (gameState === 'running') step(now);
    }
    draw(now);
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
