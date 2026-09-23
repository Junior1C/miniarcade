(() => {
  'use strict';

  const FREQS = [329.63, 440, 523.25, 659.25];
  const TONE_MS = 320;
  const GAP_MS = 180;

  const padsEl = [...document.querySelectorAll('.pad')];
  const levelEl = document.getElementById('level');
  const bestEl = document.getElementById('best');
  const statusEl = document.getElementById('status');
  const startBtn = document.getElementById('start');

  let sequence;
  let inputIndex;
  let accepting;
  let level;
  let best = 0;
  let round = 0;

  let audioCtx = null;

  function tone(freq, ms = TONE_MS) {
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
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + ms / 1000);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + ms / 1000);
    } catch {
      // Без звука игра продолжается как раньше.
    }
  }

  function light(index, ms = TONE_MS) {
    const pad = padsEl[index];
    pad.classList.add('lit');
    setTimeout(() => pad.classList.remove('lit'), ms);
  }

  function setPadsEnabled(enabled) {
    for (const pad of padsEl) {
      pad.disabled = !enabled;
    }
  }

  function tempo() {
    return Math.max(0.55, 1 - level * 0.03);
  }

  function playSequence() {
    accepting = false;
    setPadsEnabled(false);
    inputIndex = 0;
    statusEl.textContent = `Уровень ${level}: слушайте…`;
    const token = round;
    const toneMs = Math.round(TONE_MS * tempo());
    const stepMs = Math.round((TONE_MS + GAP_MS) * tempo());
    sequence.forEach((pad, i) => {
      setTimeout(() => {
        if (token !== round) return;
        light(pad, toneMs);
        tone(FREQS[pad], toneMs);
      }, 500 + i * stepMs);
    });
    setTimeout(() => {
      if (token !== round) return;
      accepting = true;
      setPadsEnabled(true);
      statusEl.textContent = `Уровень ${level}: ваш ход — повторите ${sequence.length}.`;
    }, 500 + sequence.length * stepMs);
  }

  function nextLevel() {
    level += 1;
    levelEl.textContent = String(level);
    if (level - 1 > best) {
      best = level - 1;
      bestEl.textContent = String(best);
    }
    sequence.push(Math.floor(Math.random() * 4));
    playSequence();
  }

  function press(index) {
    if (!accepting) return;
    light(index, 180);
    tone(FREQS[index], 180);
    if (index === sequence[inputIndex]) {
      inputIndex += 1;
      if (inputIndex === sequence.length) {
        accepting = false;
        setPadsEnabled(false);
        statusEl.textContent = 'Верно! Следующий уровень…';
        const token = round;
        setTimeout(() => {
          if (token !== round) return;
          nextLevel();
        }, 800);
      }
      return;
    }
    accepting = false;
    setPadsEnabled(false);
    tone(140, 300);
    statusEl.textContent = `Ошибка на ${inputIndex + 1}-й ноте. Слушайте ещё раз…`;
    const token = round;
    setTimeout(() => {
      if (token !== round) return;
      playSequence();
    }, 1200);
  }

  function start() {
    round += 1;
    sequence = [];
    level = 0;
    startBtn.disabled = true;
    nextLevel();
  }

  padsEl.forEach((pad, index) => {
    pad.addEventListener('click', () => press(index));
  });

  document.addEventListener('keydown', (event) => {
    const digit = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 }[event.code];
    if (digit === undefined) return;
    event.preventDefault();
    press(digit);
  });

  startBtn.addEventListener('click', start);
})();
