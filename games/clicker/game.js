(() => {
  'use strict';

  const DURATION_MS = 10_000;

  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const resultEl = document.getElementById('result');
  const hitBtn = document.getElementById('hit');
  const startBtn = document.getElementById('start');

  let running = false;
  let score = 0;
  let endAt = 0;
  let frameId = 0;
  let shownSeconds = 10;

  function setRunning(next) {
    running = next;
    hitBtn.disabled = !running;
    startBtn.disabled = running;
  }

  function finish() {
    cancelAnimationFrame(frameId);
    setRunning(false);
    timeEl.textContent = 'Осталось: 0';
    resultEl.textContent = `Финиш! Результат: ${score}`;
  }

  function tick(now) {
    if (!running) return;
    const remaining = endAt - now;
    const seconds = Math.max(0, Math.ceil(remaining / 1000));
    if (seconds !== shownSeconds) {
      shownSeconds = seconds;
      timeEl.textContent = `Осталось: ${seconds}`;
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
    shownSeconds = 10;
    scoreEl.textContent = '0';
    timeEl.textContent = 'Осталось: 10';
    resultEl.textContent = '';
    setRunning(true);
    endAt = performance.now() + DURATION_MS;
    frameId = requestAnimationFrame(tick);
  }

  hitBtn.addEventListener('click', () => {
    if (!running) return;
    score += 1;
    scoreEl.textContent = String(score);
  });

  startBtn.addEventListener('click', start);
})();
