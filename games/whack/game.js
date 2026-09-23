(() => {
  'use strict';

  const HOLES = 9;
  const DURATION_MS = 30_000;

  const fieldEl = document.getElementById('field');
  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const bestEl = document.getElementById('best');
  const statusEl = document.getElementById('status');
  const startBtn = document.getElementById('start');

  let running = false;
  let score = 0;
  let best = 0;
  let endAt = 0;
  let frameId = 0;
  let spawnTimer = 0;
  let shownSeconds = 30;
  let hiddenAt = 0;
  let holes = [];

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
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.07, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + ms / 1000);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + ms / 1000);
    } catch {
      // Без звука игра продолжается как раньше.
    }
  }

  function setRunning(next) {
    running = next;
    startBtn.disabled = running;
    for (const hole of holes) {
      hole.btn.disabled = !running;
    }
  }

  function hideAll() {
    for (const hole of holes) {
      hole.up = false;
      hole.btn.classList.remove('up');
    }
  }

  function popMole() {
    hideAll();
    const hole = holes[Math.floor(Math.random() * holes.length)];
    hole.up = true;
    hole.btn.classList.add('up');
    // Чем дольше игра, тем короче выглядывание.
    const elapsed = DURATION_MS - (endAt - performance.now());
    hole.hideAt = performance.now() + Math.max(450, 800 - elapsed * 0.012);
  }

  function bonk(index) {
    if (!running) return;
    const hole = holes[index];
    if (!hole.up) return;
    hole.up = false;
    hole.btn.classList.remove('up');
    score += 1;
    scoreEl.textContent = String(score);
    beep(500 + Math.min(score, 20) * 20, 60);
  }

  function finish() {
    cancelAnimationFrame(frameId);
    hiddenAt = 0;
    hideAll();
    setRunning(false);
    timeEl.textContent = '0';
    if (score > best) {
      best = score;
      bestEl.textContent = String(best);
      statusEl.textContent = `Финиш! Новый рекорд: ${score} 🎉`;
      beep(880, 200);
    } else {
      statusEl.textContent = `Финиш! Результат: ${score}.`;
      beep(220, 200);
    }
  }

  function tick(now) {
    if (!running) return;
    const remaining = endAt - now;
    const seconds = Math.max(0, Math.ceil(remaining / 1000));
    if (seconds !== shownSeconds) {
      shownSeconds = seconds;
      timeEl.textContent = String(seconds);
    }
    spawnTimer -= 16;
    if (spawnTimer <= 0) {
      popMole();
      spawnTimer = 650;
    }
    for (const hole of holes) {
      if (hole.up && now >= hole.hideAt) {
        hole.up = false;
        hole.btn.classList.remove('up');
      }
    }
    if (remaining <= 0) {
      finish();
      return;
    }
    frameId = requestAnimationFrame(tick);
  }

  function start() {
    if (running) return;
    score = 0;
    shownSeconds = 30;
    scoreEl.textContent = '0';
    timeEl.textContent = '30';
    statusEl.textContent = '';
    setRunning(true);
    endAt = performance.now() + DURATION_MS;
    hiddenAt = 0;
    spawnTimer = 0;
    beep(660, 100);
    frameId = requestAnimationFrame(tick);
  }

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < HOLES; i += 1) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hole';
    btn.disabled = true;
    btn.setAttribute('aria-label', `Норка ${i + 1}`);
    const mole = document.createElement('span');
    mole.className = 'mole';
    mole.textContent = '🐹';
    mole.setAttribute('aria-hidden', 'true');
    btn.append(mole);
    const index = i;
    btn.addEventListener('click', () => bonk(index));
    holes.push({ btn, up: false, hideAt: 0 });
    fragment.append(btn);
  }
  fieldEl.replaceChildren(fragment);

  // Пауза по visibilitychange: сдвигаем дедлайн раунда и выглядывания
  // кротов на время в фоне, иначе сворачивание наказывало бы игрока.
  document.addEventListener('visibilitychange', () => {
    if (!running) return;
    if (document.hidden) {
      hiddenAt = performance.now();
      cancelAnimationFrame(frameId);
      statusEl.textContent = 'Пауза — вернитесь во вкладку';
    } else if (hiddenAt > 0) {
      const away = performance.now() - hiddenAt;
      endAt += away;
      for (const hole of holes) {
        if (hole.up) hole.hideAt += away;
      }
      hiddenAt = 0;
      statusEl.textContent = '';
      frameId = requestAnimationFrame(tick);
    }
  });

  startBtn.addEventListener('click', start);
})();
