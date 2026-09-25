(() => {
  'use strict';

  const MAP = [
    '###################',
    '#........#........#',
    '#.##.###.#.###.##.#',
    '#o##.###.#.###.##o#',
    '#.................#',
    '#.##.#.#####.#.##.#',
    '#....#...#...#....#',
    '####.###.#.###.####',
    '####.#.......#.####',
    '####.#.......#.####',
    '#........#........#',
    '#.##.###.#.###.##.#',
    '#o..#.......#....o#',
    '##.#.#.#####.#.#.##',
    '#....#...#...#....#',
  ];
  const COLS = 19;
  const ROWS = 15;
  const CELL = 16;
  const SWIPE_MIN_PX = 24;
  const FRIGHT_MS = 6000;

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  const canvas = document.getElementById('board');
  const context = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const livesEl = document.getElementById('lives');
  const bestEl = document.getElementById('best');
  const statusEl = document.getElementById('status');

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = COLS * CELL * dpr;
  canvas.height = ROWS * CELL * dpr;
  context.scale(dpr, dpr);

  let dots;
  let power;
  let totalDots;
  let player;
  let ghosts;
  let score;
  let best = 0;
  let lives;
  let level;
  let gameState = 'ready';
  let frightUntil = 0;
  let wakaHigh = false;

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
      parent.postMessage({ type: 'miniarcade:score', game: 'pacman', score: value }, '*');
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
      gain.gain.setValueAtTime(0.04, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + ms / 1000);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + ms / 1000);
    } catch {
      // Без звука игра продолжается как раньше.
    }
  }

  function isWall(x, y) {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true;
    return MAP[y][x] === '#';
  }

  function cellCenter(entity) {
    return { x: entity.x * CELL + CELL / 2, y: entity.y * CELL + CELL / 2 };
  }

  function buildDots() {
    dots = new Set();
    power = new Set();
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const cell = MAP[y][x];
        if (cell === '.') dots.add(`${x},${y}`);
        else if (cell === 'o') power.add(`${x},${y}`);
      }
    }
    totalDots = dots.size + power.size;
  }

  function resetActors() {
    player = { x: 9, y: 12, px: 0, py: 0, dir: DIRS.left, queued: DIRS.left };
    const p = cellCenter(player);
    player.px = p.x;
    player.py = p.y;
    ghosts = [
      { x: 6, y: 10, dir: DIRS.right, color: '#ef4444', home: { x: 6, y: 10 } },
      { x: 12, y: 10, dir: DIRS.left, color: '#f0abfc', home: { x: 12, y: 10 } },
    ];
    for (const ghost of ghosts) {
      const c = cellCenter(ghost);
      ghost.px = c.x;
      ghost.py = c.y;
    }
  }

  function startLevel() {
    buildDots();
    resetActors();
    frightUntil = 0;
  }

  function newGame() {
    score = 0;
    lives = 3;
    level = 1;
    scoreEl.textContent = '0';
    livesEl.textContent = '3';
    statusEl.textContent = '';
    startLevel();
    gameState = 'running';
    beep(520, 90);
  }

  function speed() {
    return 0.09 + (level - 1) * 0.012;
  }

  function ghostSpeed() {
    return gameState === 'fright' ? 0.055 : 0.075 + (level - 1) * 0.008;
  }

  function openDirs(x, y, exclude) {
    return Object.entries(DIRS).filter(([name, d]) => {
      if (exclude && d.x === -exclude.x && d.y === -exclude.y) return false;
      return !isWall(x + d.x, y + d.y) && name;
    });
  }

  function ghostThink(ghost, now) {
    const frightened = now < frightUntil;
    const options = openDirs(ghost.x, ghost.y, ghost.dir);
    if (options.length === 0) {
      ghost.dir = { x: -ghost.dir.x, y: -ghost.dir.y };
      return;
    }
    let choice;
    if (frightened || Math.random() < 0.25) {
      choice = options[Math.floor(Math.random() * options.length)];
    } else {
      let bestDist = Infinity;
      choice = options[0];
      for (const [name, d] of options) {
        const dist = Math.abs(ghost.x + d.x - player.x) + Math.abs(ghost.y + d.y - player.y);
        if (dist < bestDist) {
          bestDist = dist;
          choice = [name, d];
        }
      }
    }
    ghost.dir = choice[1];
  }

  function atCenter(entity) {
    const c = cellCenter(entity);
    return Math.abs(entity.px - c.x) < 0.6 && Math.abs(entity.py - c.y) < 0.6;
  }

  function snap(entity) {
    const c = cellCenter(entity);
    entity.px = c.x;
    entity.py = c.y;
  }

  function step(now) {
    const frightened = now < frightUntil;
    // Игрок: применяем queued при проходе центра клетки.
    if (atCenter(player)) {
      snap(player);
      player.x = Math.round((player.px - CELL / 2) / CELL);
      player.y = Math.round((player.py - CELL / 2) / CELL);
      eat(player.x, player.y);
      if (gameState !== 'running' && gameState !== 'fright') return;
      if (!isWall(player.x + player.queued.x, player.y + player.queued.y)) {
        player.dir = player.queued;
      }
      if (isWall(player.x + player.dir.x, player.y + player.dir.y)) {
        player.dir = { x: 0, y: 0 };
      }
    }
    const v = speed() * CELL;
    player.px += player.dir.x * v;
    player.py += player.dir.y * v;

    for (const ghost of ghosts) {
      if (atCenter(ghost)) {
        snap(ghost);
        ghost.x = Math.round((ghost.px - CELL / 2) / CELL);
        ghost.y = Math.round((ghost.py - CELL / 2) / CELL);
        ghostThink(ghost, now);
      }
      const gv = ghostSpeed() * CELL;
      ghost.px += ghost.dir.x * gv;
      ghost.py += ghost.dir.y * gv;
    }

    for (const ghost of ghosts) {
      const dx = Math.abs(ghost.px - player.px);
      const dy = Math.abs(ghost.py - player.py);
      if (dx < CELL * 0.6 && dy < CELL * 0.6) {
        if (frightened) {
          score += 200;
          scoreEl.textContent = String(score);
          const c = cellCenter(ghost.home);
          ghost.x = ghost.home.x;
          ghost.y = ghost.home.y;
          ghost.px = c.x;
          ghost.py = c.y;
          beep(880, 120);
        } else {
          caught();
          return;
        }
      }
    }
    gameState = frightened ? 'fright' : 'running';
  }

  function eat(x, y) {
    const key = `${x},${y}`;
    if (dots.delete(key)) {
      score += 10;
      scoreEl.textContent = String(score);
      wakaHigh = !wakaHigh;
      beep(wakaHigh ? 560 : 420, 40);
    } else if (power.delete(key)) {
      score += 50;
      scoreEl.textContent = String(score);
      frightUntil = performance.now() + FRIGHT_MS;
      beep(760, 150);
    }
    if (dots.size + power.size === 0) {
      level += 1;
      statusEl.textContent = `Уровень ${level} — привидения быстрее!`;
      startLevel();
      beep(880, 150);
    }
  }

  function caught() {
    lives -= 1;
    livesEl.textContent = String(lives);
    beep(160, 250, 'sawtooth');
    if (lives <= 0) {
      gameState = 'over';
      if (score > best) {
        best = score;
        bestEl.textContent = String(best);
        statusEl.textContent = `Поймали! Новый рекорд: ${score}. Стрелка или свайп — заново.`;
      } else {
        statusEl.textContent = `Поймали! Счёт: ${score}. Стрелка или свайп — заново.`;
      }
      reportScore(score);
      return;
    }
    resetActors();
    gameState = 'running';
    statusEl.textContent = `Осталось жизней: ${lives}.`;
  }

  function steer(name) {
    if (gameState === 'ready' || gameState === 'over') {
      newGame();
      // Новую партию сразу ведём в выбранном направлении.
      player.queued = DIRS[name];
      statusEl.textContent = '';
      return;
    }
    if (gameState === 'paused') {
      gameState = 'running';
      statusEl.textContent = '';
    }
    player.queued = DIRS[name];
  }

  const KEY_DIRS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };

  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM') {
      toggleMute();
      return;
    }
    if (event.code in KEY_DIRS) {
      event.preventDefault();
      steer(KEY_DIRS[event.code]);
    }
  });

  // Dpad поверх свайпов: на маленьком iframe свайпы промахиваются.
  for (const btn of document.querySelectorAll('.pad__btn')) {
    btn.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      steer(btn.dataset.dir);
    });
  }

  let touchStart = null;
  canvas.addEventListener('touchstart', (event) => {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', (event) => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_PX) return;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (gameState === 'running' || gameState === 'fright')) {
      gameState = 'paused';
      statusEl.textContent = 'Пауза — стрелка или свайп, чтобы продолжить.';
    }
  });

  function draw(now) {
    context.fillStyle = '#000';
    context.fillRect(0, 0, COLS * CELL, ROWS * CELL);
    context.strokeStyle = '#1d4ed8';
    context.lineWidth = 1;
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        if (MAP[y][x] === '#') {
          context.strokeRect(x * CELL + 0.5, y * CELL + 0.5, CELL - 1, CELL - 1);
        }
      }
    }
    const blink = Math.floor(now / 300) % 2 === 0;
    context.fillStyle = '#fbbf24';
    for (const key of dots) {
      const [x, y] = key.split(',').map(Number);
      context.fillRect(x * CELL + CELL / 2 - 1, y * CELL + CELL / 2 - 1, 2, 2);
    }
    if (blink) {
      for (const key of power) {
        const [x, y] = key.split(',').map(Number);
        context.beginPath();
        context.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, 4, 0, Math.PI * 2);
        context.fill();
      }
    }
    const frightened = now < frightUntil;
    for (const ghost of ghosts) {
      context.fillStyle = frightened ? '#3b82f6' : ghost.color;
      context.beginPath();
      context.arc(ghost.px, ghost.py - 1, 6, Math.PI, 0);
      context.fillRect(ghost.px - 6, ghost.py - 1, 12, 6);
      context.fillStyle = '#fff';
      context.fillRect(ghost.px - 4, ghost.py - 4, 3, 4);
      context.fillRect(ghost.px + 1, ghost.py - 4, 3, 4);
      context.fillStyle = '#000';
      context.fillRect(ghost.px - 3, ghost.py - 3, 2, 2);
      context.fillRect(ghost.px + 2, ghost.py - 3, 2, 2);
    }
    const mouth = Math.abs(Math.sin(now / 120)) * 0.5;
    context.fillStyle = '#facc15';
    context.beginPath();
    context.moveTo(player.px, player.py);
    const baseAngle = player.dir.x === 1 ? 0 : player.dir.x === -1 ? Math.PI : player.dir.y === -1 ? -Math.PI / 2 : Math.PI / 2;
    context.arc(player.px, player.py, 7, baseAngle + mouth, baseAngle + Math.PI * 2 - mouth);
    context.closePath();
    context.fill();
  }

  // Фиксированный шаг симуляции: два подшага за кадр 60 Гц, чтобы сущности
  // не пролетали друг сквозь друга. Аккумулятор отвязывает темп от частоты
  // экрана: на 120 Гц игра идёт так же, как на 60.
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
    if (gameState === 'running' || gameState === 'fright') {
      accumulator += delta;
      let guard = 0;
      while (
        accumulator >= STEP_MS &&
        (gameState === 'running' || gameState === 'fright') &&
        guard < 5
      ) {
        step(now);
        accumulator -= STEP_MS;
        guard += 1;
      }
      if (guard >= 5) accumulator = 0;
      draw(now);
    } else if (gameState === 'ready' || gameState === 'paused' || gameState === 'over') {
      accumulator = 0;
      if (!dots) {
        buildDots();
        resetActors();
      }
      draw(now);
    }
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
