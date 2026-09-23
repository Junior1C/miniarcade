(() => {
  'use strict';

  // Слова без «ё»: ввод идёт через e.key (пользователь печатает букву),
  // и нормализация ё/е не должна решать исход партии.
  const WORDS = [
    'клавиатура', 'монитор', 'программа', 'космос', 'гитара', 'футбол',
    'телефон', 'книга', 'школа', 'машина', 'дерево', 'река',
    'солнце', 'луна', 'звезда', 'океан', 'птица', 'рыба',
    'цветок', 'мост', 'поезд', 'самолет', 'компьютер', 'мышь',
    'окно', 'стол', 'хлеб', 'молоко', 'яблоко', 'арбуз',
    'библиотека', 'пианино', 'вертолет', 'корабль', 'паровоз', 'фонарик',
  ];
  const ALPHABET = 'абвгдежзийклмнопрстуфхцчшщъыьэюя'.split('');
  const MAX_ERRORS = 6;
  const PARTS = ['part-head', 'part-body', 'part-arm-l', 'part-arm-r', 'part-leg-l', 'part-leg-r'];

  const wordEl = document.getElementById('word');
  const statusEl = document.getElementById('status');
  const lettersEl = document.getElementById('letters');
  const winsEl = document.getElementById('wins');
  const errorsEl = document.getElementById('errors');
  const restartBtn = document.getElementById('restart');

  let secret;
  let guessed;
  let errors;
  let wins = 0;
  let finished;

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

  function render() {
    wordEl.textContent = secret
      .split('')
      .map((letter) => (guessed.has(letter) ? letter : '_'))
      .join(' ');
    errorsEl.textContent = String(errors);
    PARTS.forEach((id, i) => {
      document.getElementById(id).hidden = i >= errors;
    });
    for (const btn of lettersEl.children) {
      const letter = btn.dataset.letter;
      btn.disabled = finished || guessed.has(letter);
    }
  }

  function guess(letter) {
    if (finished || guessed.has(letter)) return;
    guessed.add(letter);
    if (secret.includes(letter)) {
      beep(600, 70);
    } else {
      errors += 1;
      beep(200, 120);
    }
    render();
    const solved = secret.split('').every((ch) => guessed.has(ch));
    if (solved) {
      finished = true;
      wins += 1;
      winsEl.textContent = String(wins);
      statusEl.textContent = `Победа! Это «${secret}». 🎉`;
      beep(660, 100);
      setTimeout(() => beep(880, 150), 110);
      render();
    } else if (errors >= MAX_ERRORS) {
      finished = true;
      statusEl.textContent = `Не угадали — было «${secret}». Попробуйте ещё!`;
      beep(150, 250);
      render();
    }
  }

  function newGame() {
    secret = WORDS[Math.floor(Math.random() * WORDS.length)];
    guessed = new Set();
    errors = 0;
    finished = false;
    statusEl.textContent = `Слово из ${secret.length} букв.`;
    if (lettersEl.children.length === 0) {
      const fragment = document.createDocumentFragment();
      for (const letter of ALPHABET) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'letter';
        btn.textContent = letter;
        btn.dataset.letter = letter;
        btn.setAttribute('aria-label', `Буква ${letter}`);
        const value = letter;
        btn.addEventListener('click', () => guess(value));
        fragment.append(btn);
      }
      lettersEl.replaceChildren(fragment);
    }
    render();
  }

  document.addEventListener('keydown', (event) => {
    // Буквенный ввод — намеренно e.key, а не e.code: важна сама буква,
    // а не физическая клавиша (раскладки и e.code-маппинги здесь врут).
    if (typeof event.key !== 'string') return;
    const letter = event.key.toLocaleLowerCase('ru');
    if (/^[а-я]$/.test(letter)) {
      guess(letter);
    }
  });

  restartBtn.addEventListener('click', newGame);

  newGame();
})();
