(() => {
  'use strict';

  const DURATION_MS = 10_000;
  const URGENT_MS = 3000;

  const scoreEl = document.getElementById('score');
  const timeEl = document.getElementById('time');
  const resultEl = document.getElementById('result');
  const bestEl = document.getElementById('best');
  const hitBtn = document.getElementById('hit');
  const startBtn = document.getElementById('start');

  let running = false;
  let score = 0;
  let best = 0;
  let endAt = 0;
  let frameId = 0;
  let shownSeconds = 10;

  // SFX без ассетов: чистый WebAudio, офлайн и CSP-safe (нет внешних файлов).
  // Контекст ленивый — создаётся по первому жесту (требование autoplay-политики).
  // localStorage в sandbox недоступен, поэтому рекорд — только на сессию.
  let audioCtx = null;

  function beep(freq, ms = 80) {
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
      gain.gain.setValueAtTime(0.08, now);
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
    hitBtn.disabled = !running;
    startBtn.disabled = running;
  }

  function finish() {
    cancelAnimationFrame(frameId);
    setRunning(false);
    timeEl.textContent = 'Осталось: 0';
    timeEl.classList.remove('urgent');
    if (score > best) {
      best = score;
      bestEl.textContent = `Рекорд сессии: ${best}`;
      resultEl.textContent = `Финиш! Новый рекорд: ${score} 🎉`;
      beep(880, 200);
    } else {
      resultEl.textContent = `Финиш! Результат: ${score}`;
      beep(220, 200);
    }
  }

  function tick(now) {
    if (!running) return;
    const remaining = endAt - now;
    const seconds = Math.max(0, Math.ceil(remaining / 1000));
    if (seconds !== shownSeconds) {
      shownSeconds = seconds;
      timeEl.textContent = `Осталось: ${seconds}`;
    }
    if (remaining <= URGENT_MS) {
      timeEl.classList.add('urgent');
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
    timeEl.classList.remove('urgent');
    resultEl.textContent = '';
    setRunning(true);
    endAt = performance.now() + DURATION_MS;
    beep(660, 100);
    frameId = requestAnimationFrame(tick);
  }

  function hit() {
    if (!running) return;
    score += 1;
    scoreEl.textContent = String(score);
    beep(440 + Math.min(score, 20) * 20, 60);
  }

  hitBtn.addEventListener('click', hit);

  document.addEventListener('keydown', (event) => {
    // Только Space: Enter на сфокусированной кнопке и так даёт click на keyup —
    // свой инкремент на Enter удвоил бы очки. preventDefault на keydown гасит
    // и скролл страницы, и нативную активацию кнопки — дабла нет.
    if (event.code === 'Space') {
      event.preventDefault();
      if (running) {
        hit();
      } else {
        start();
      }
    }
  });

  startBtn.addEventListener('click', start);
})();
