(() => {
  'use strict';

  const COLS = 7;
  const ROWS = 6;
  const DEPTH = 4;
  const AI_DELAY_MS = 350;

  const colsEl = document.getElementById('cols');
  const gridEl = document.getElementById('grid');
  const statusEl = document.getElementById('status');
  const winsEl = document.getElementById('wins');
  const lossesEl = document.getElementById('losses');
  const drawsEl = document.getElementById('draws');
  const restartBtn = document.getElementById('restart');

  let board;
  let finished;
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let round = 0;

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
      osc.type = 'triangle';
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

  function dropRow(cells, col) {
    for (let row = ROWS - 1; row >= 0; row -= 1) {
      if (!cells[row * COLS + col]) return row;
    }
    return -1;
  }

  function winner(cells) {
    const at = (r, c) => (r >= 0 && r < ROWS && c >= 0 && c < COLS ? cells[r * COLS + c] : '');
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const mark = cells[r * COLS + c];
        if (!mark) continue;
        for (const [dr, dc] of dirs) {
          const line = [[r, c]];
          for (let i = 1; i < 4; i += 1) {
            if (at(r + dr * i, c + dc * i) !== mark) break;
            line.push([r + dr * i, c + dc * i]);
          }
          if (line.length === 4) return { mark, line };
        }
      }
    }
    if (cells.every((cell) => cell)) return { mark: 'draw', line: [] };
    return null;
  }

  function scoreWindows(cells, mark) {
    let value = 0;
    const center = cells.filter((_, i) => i % COLS === 3 && cells[i] === mark).length;
    value += center * 3;
    const lines = [];
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c <= COLS - 4; c += 1) lines.push([r * COLS + c, r * COLS + c + 1, r * COLS + c + 2, r * COLS + c + 3]);
    }
    for (let c = 0; c < COLS; c += 1) {
      for (let r = 0; r <= ROWS - 4; r += 1) lines.push([r * COLS + c, (r + 1) * COLS + c, (r + 2) * COLS + c, (r + 3) * COLS + c]);
    }
    for (let r = 0; r <= ROWS - 4; r += 1) {
      for (let c = 0; c <= COLS - 4; c += 1) lines.push([r * COLS + c, (r + 1) * COLS + c + 1, (r + 2) * COLS + c + 2, (r + 3) * COLS + c + 3]);
    }
    for (let r = 3; r < ROWS; r += 1) {
      for (let c = 0; c <= COLS - 4; c += 1) lines.push([r * COLS + c, (r - 1) * COLS + c + 1, (r - 2) * COLS + c + 2, (r - 3) * COLS + c + 3]);
    }
    for (const line of lines) {
      const marks = line.map((i) => cells[i]);
      const mine = marks.filter((m) => m === mark).length;
      const empty = marks.filter((m) => m === '').length;
      const theirs = 4 - mine - empty;
      if (theirs === 0) {
        if (mine === 4) value += 1000;
        else if (mine === 3 && empty === 1) value += 8;
        else if (mine === 2 && empty === 2) value += 2;
      } else if (mine === 0 && theirs === 3 && empty === 1) {
        value -= 10;
      }
    }
    return value;
  }

  function orderedCols(cells) {
    const cols = [];
    for (let c = 0; c < COLS; c += 1) {
      if (dropRow(cells, c) >= 0) cols.push(c);
    }
    cols.sort((a, b) => Math.abs(3 - a) - Math.abs(3 - b));
    return cols;
  }

  function minimax(cells, depth, alpha, beta, maximizing) {
    const result = winner(cells);
    if (result) {
      if (result.mark === 'Y') return 100000 + depth;
      if (result.mark === 'R') return -100000 - depth;
      return 0;
    }
    if (depth === 0) return scoreWindows(cells, 'Y') - scoreWindows(cells, 'R') * 1.2;
    if (maximizing) {
      let value = -Infinity;
      for (const col of orderedCols(cells)) {
        const row = dropRow(cells, col);
        cells[row * COLS + col] = 'Y';
        value = Math.max(value, minimax(cells, depth - 1, alpha, beta, false));
        cells[row * COLS + col] = '';
        alpha = Math.max(alpha, value);
        if (alpha >= beta) break;
      }
      return value;
    }
    let value = Infinity;
    for (const col of orderedCols(cells)) {
      const row = dropRow(cells, col);
      cells[row * COLS + col] = 'R';
      value = Math.min(value, minimax(cells, depth - 1, alpha, beta, true));
      cells[row * COLS + col] = '';
      beta = Math.min(beta, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  function aiPick() {
    // Мгновенная победа и блок — без перебора, остальное — минимакс.
    for (const col of orderedCols(board)) {
      const row = dropRow(board, col);
      board[row * COLS + col] = 'Y';
      const wins = winner(board);
      board[row * COLS + col] = '';
      if (wins && wins.mark === 'Y') return col;
    }
    for (const col of orderedCols(board)) {
      const row = dropRow(board, col);
      board[row * COLS + col] = 'R';
      const threat = winner(board);
      board[row * COLS + col] = '';
      if (threat && threat.mark === 'R') return col;
    }
    let bestValue = -Infinity;
    let bestCols = [];
    for (const col of orderedCols(board)) {
      const row = dropRow(board, col);
      board[row * COLS + col] = 'Y';
      const value = minimax(board, DEPTH, -Infinity, Infinity, false);
      board[row * COLS + col] = '';
      if (value > bestValue) {
        bestValue = value;
        bestCols = [col];
      } else if (value === bestValue) {
        bestCols.push(col);
      }
    }
    return bestCols[Math.floor(Math.random() * bestCols.length)];
  }

  function render(winLine = []) {
    const winSet = new Set(winLine.map(([r, c]) => r * COLS + c));
    for (let i = 0; i < COLS * ROWS; i += 1) {
      const cell = gridEl.children[i];
      cell.className = `cell${board[i] === 'R' ? ' r' : board[i] === 'Y' ? ' y' : ''}${winSet.has(i) ? ' win' : ''}`;
    }
    for (let c = 0; c < COLS; c += 1) {
      colsEl.children[c].disabled = finished || dropRow(board, c) < 0;
    }
  }

  function finish(result) {
    finished = true;
    if (result.mark === 'R') {
      wins += 1;
      winsEl.textContent = String(wins);
      statusEl.textContent = 'Победа! Четыре в ряд. 🎉';
      beep(660, 100);
      setTimeout(() => beep(880, 150), 110);
    } else if (result.mark === 'Y') {
      losses += 1;
      lossesEl.textContent = String(losses);
      statusEl.textContent = 'ИИ собрал четыре в ряд. Реванш?';
      beep(220, 150);
    } else {
      draws += 1;
      drawsEl.textContent = String(draws);
      statusEl.textContent = 'Ничья — поле заполнено!';
    }
    render(result.line);
  }

  function playerMove(col) {
    if (finished) return;
    const row = dropRow(board, col);
    if (row < 0) return;
    board[row * COLS + col] = 'R';
    beep(520, 60);
    const afterPlayer = winner(board);
    if (afterPlayer) {
      finish(afterPlayer);
      return;
    }
    statusEl.textContent = 'ИИ думает…';
    render();
    const token = round;
    setTimeout(() => {
      if (token !== round || finished) return;
      const pick = aiPick();
      board[dropRow(board, pick) * COLS + pick] = 'Y';
      beep(420, 60);
      const afterAi = winner(board);
      if (afterAi) {
        finish(afterAi);
        return;
      }
      statusEl.textContent = 'Ваш ход — вы играете красными.';
      render();
    }, AI_DELAY_MS);
  }

  function newGame() {
    round += 1;
    board = Array(COLS * ROWS).fill('');
    finished = false;
    statusEl.textContent = 'Ваш ход — вы играете красными.';
    if (gridEl.children.length === 0) {
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < COLS * ROWS; i += 1) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        fragment.append(cell);
      }
      gridEl.replaceChildren(fragment);
      const colsFragment = document.createDocumentFragment();
      for (let c = 0; c < COLS; c += 1) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cols__btn';
        btn.textContent = '▼';
        btn.setAttribute('aria-label', `Колонка ${c + 1}`);
        const col = c;
        btn.addEventListener('click', () => playerMove(col));
        colsFragment.append(btn);
      }
      colsEl.replaceChildren(colsFragment);
    }
    render();
  }

  document.addEventListener('keydown', (event) => {
    const map = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6 };
    if (event.code in map) {
      event.preventDefault();
      playerMove(map[event.code]);
    }
  });

  restartBtn.addEventListener('click', newGame);

  newGame();
})();
