(() => {
  'use strict';

  // Генератор со встроенной проверкой единственности решения:
  // дырки копаем, только если солвер находит ровно одно решение.
  // Лимит узлов защищает от долгой генерации на слабом железе.
  const HOLES = { easy: 36, medium: 44, hard: 48 };
  const NAMES = { easy: 'Лёгкая', medium: 'Средняя', hard: 'Сложная' };
  const SOLVER_NODE_CAP = 30000;

  const gridEl = document.getElementById('grid');
  const padEl = document.getElementById('pad');
  const difficultyEl = document.getElementById('difficulty');
  const mistakesEl = document.getElementById('mistakes');
  const statusEl = document.getElementById('status');
  const eraseBtn = document.getElementById('erase');
  const restartBtn = document.getElementById('restart');

  let solution;
  let board;
  let given;
  let selected;
  let mistakes;
  let finished;
  let difficulty = 'easy';

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

  function shuffled(values) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function fullSolution() {
    const base = (r, c) => ((r * 3 + Math.floor(r / 3) + c) % 9) + 1;
    const digits = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const rows = [0, 1, 2].flatMap((band) => shuffled([0, 1, 2]).map((r) => band * 3 + r));
    const cols = [0, 1, 2].flatMap((stack) => shuffled([0, 1, 2]).map((c) => stack * 3 + c));
    const transpose = Math.random() < 0.5;
    const grid = [];
    for (let r = 0; r < 9; r += 1) {
      grid.push([]);
      for (let c = 0; c < 9; c += 1) {
        const rr = transpose ? cols[c] : rows[r];
        const cc = transpose ? rows[r] : cols[c];
        grid[r].push(digits[base(rr, cc) - 1]);
      }
    }
    return grid;
  }

  function countSolutions(grid, cap) {
    let nodes = 0;
    let count = 0;
    const cells = grid.map((row) => [...row]);

    function candidates(r, c) {
      const used = new Set();
      for (let i = 0; i < 9; i += 1) {
        used.add(cells[r][i]);
        used.add(cells[i][c]);
      }
      const br = Math.floor(r / 3) * 3;
      const bc = Math.floor(c / 3) * 3;
      for (let y = 0; y < 3; y += 1) {
        for (let x = 0; x < 3; x += 1) {
          used.add(cells[br + y][bc + x]);
        }
      }
      const result = [];
      for (let v = 1; v <= 9; v += 1) {
        if (!used.has(v)) result.push(v);
      }
      return result;
    }

    function solve() {
      nodes += 1;
      if (nodes > cap || count >= 2) return;
      let best = null;
      let bestOptions = null;
      for (let r = 0; r < 9 && !best; r += 1) {
        for (let c = 0; c < 9; c += 1) {
          if (cells[r][c] === 0) {
            const options = candidates(r, c);
            if (options.length === 0) return;
            if (!bestOptions || options.length < bestOptions.length) {
              best = [r, c];
              bestOptions = options;
              if (options.length === 1) break;
            }
          }
        }
      }
      if (!best) {
        count += 1;
        return;
      }
      for (const value of bestOptions) {
        cells[best[0]][best[1]] = value;
        solve();
        cells[best[0]][best[1]] = 0;
        if (count >= 2 || nodes > cap) return;
      }
    }

    solve();
    return count;
  }

  function generate() {
    solution = fullSolution();
    board = solution.map((row) => [...row]);
    given = solution.map(() => Array(9).fill(true));
    const order = shuffled(Array.from({ length: 81 }, (_, i) => i));
    let holes = 0;
    const target = HOLES[difficulty];
    for (const index of order) {
      if (holes >= target) break;
      const r = Math.floor(index / 9);
      const c = index % 9;
      const backup = board[r][c];
      board[r][c] = 0;
      if (countSolutions(board, SOLVER_NODE_CAP) !== 1) {
        board[r][c] = backup;
      } else {
        given[r][c] = false;
        holes += 1;
      }
    }
  }

  function render() {
    const selectedValue = selected ? board[selected.r][selected.c] : 0;
    const cells = gridEl.children;
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        const cell = cells[r * 9 + c];
        const value = board[r][c];
        cell.textContent = value === 0 ? '' : String(value);
        cell.classList.toggle('given', given[r][c]);
        cell.classList.toggle('selected', !!selected && selected.r === r && selected.c === c);
        cell.classList.toggle('same', value !== 0 && value === selectedValue && !(selected && selected.r === r && selected.c === c));
        cell.classList.toggle('error', value !== 0 && value !== solution[r][c]);
        cell.disabled = finished || given[r][c];
        cell.setAttribute(
          'aria-label',
          `Строка ${r + 1}, столбец ${c + 1}${value === 0 ? ', пусто' : `, ${value}`}${given[r][c] ? ', дано' : ''}`,
        );
      }
    }
  }

  function checkWin() {
    for (let r = 0; r < 9; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        if (board[r][c] !== solution[r][c]) return;
      }
    }
    finished = true;
    statusEl.textContent = `Судоку решено с ${mistakes} ошибками! 🎉`;
    beep(660, 100);
    setTimeout(() => beep(880, 150), 110);
    render();
  }

  function input(value) {
    if (finished || !selected || given[selected.r][selected.c]) return;
    if (value === 0) {
      board[selected.r][selected.c] = 0;
      render();
      return;
    }
    board[selected.r][selected.c] = value;
    if (value === solution[selected.r][selected.c]) {
      beep(600, 60);
    } else {
      mistakes += 1;
      mistakesEl.textContent = String(mistakes);
      beep(200, 120);
    }
    render();
    checkWin();
  }

  function newGame() {
    const levels = Object.keys(HOLES);
    difficulty = levels[Math.floor(Math.random() * levels.length)];
    difficultyEl.textContent = NAMES[difficulty];
    mistakes = 0;
    mistakesEl.textContent = '0';
    selected = null;
    finished = false;
    statusEl.textContent = '';
    generate();
    if (gridEl.children.length === 0) {
      const fragment = document.createDocumentFragment();
      for (let r = 0; r < 9; r += 1) {
        for (let c = 0; c < 9; c += 1) {
          const cell = document.createElement('button');
          cell.type = 'button';
          cell.className = 'cell';
          cell.setAttribute('role', 'gridcell');
          const row = r;
          const col = c;
          cell.addEventListener('click', () => {
            if (given[row][col] || finished) return;
            selected = { r: row, c: col };
            render();
          });
          fragment.append(cell);
        }
      }
      gridEl.replaceChildren(fragment);
    }
    if (padEl.children.length === 0) {
      const fragment = document.createDocumentFragment();
      for (let v = 1; v <= 9; v += 1) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pad__btn';
        btn.textContent = String(v);
        btn.setAttribute('aria-label', `Цифра ${v}`);
        const value = v;
        btn.addEventListener('click', () => input(value));
        fragment.append(btn);
      }
      padEl.replaceChildren(fragment);
    }
    render();
  }

  document.addEventListener('keydown', (event) => {
    const digit = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, Digit6: 6, Digit7: 7, Digit8: 8, Digit9: 9 }[event.code];
    if (digit !== undefined) {
      event.preventDefault();
      input(digit);
    } else if (event.code === 'Backspace' || event.code === 'Delete') {
      event.preventDefault();
      input(0);
    }
  });

  eraseBtn.addEventListener('click', () => input(0));
  restartBtn.addEventListener('click', newGame);

  newGame();
})();
