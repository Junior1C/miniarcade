(() => {
  'use strict';

  const LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
  ];
  // ИИ играет сильно, но в 25% случаев ходит случайно — иначе непобедим и скучен.
  const BLUNDER_RATE = 0.25;
  const AI_DELAY_MS = 350;

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

  function winner(cells) {
    for (const line of LINES) {
      const [a, b, c] = line;
      if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) {
        return { mark: cells[a], line };
      }
    }
    if (cells.every((cell) => cell)) return { mark: 'draw', line: [] };
    return null;
  }

  function minimax(cells, turn, depth) {
    const result = winner(cells);
    if (result) {
      if (result.mark === 'O') return 10 - depth;
      if (result.mark === 'X') return depth - 10;
      return 0;
    }
    let bestScore = turn === 'O' ? -Infinity : Infinity;
    for (let i = 0; i < 9; i += 1) {
      if (cells[i]) continue;
      cells[i] = turn;
      const value = minimax(cells, turn === 'O' ? 'X' : 'O', depth + 1);
      cells[i] = '';
      bestScore = turn === 'O' ? Math.max(bestScore, value) : Math.min(bestScore, value);
    }
    return bestScore;
  }

  function aiMove() {
    const free = [];
    for (let i = 0; i < 9; i += 1) {
      if (!board[i]) free.push(i);
    }
    if (free.length === 0) return -1;
    if (Math.random() < BLUNDER_RATE) {
      return free[Math.floor(Math.random() * free.length)];
    }
    let bestValue = -Infinity;
    let bestMoves = [];
    for (const index of free) {
      board[index] = 'O';
      const value = minimax(board, 'X', 0);
      board[index] = '';
      if (value > bestValue) {
        bestValue = value;
        bestMoves = [index];
      } else if (value === bestValue) {
        bestMoves.push(index);
      }
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  function render() {
    const cells = gridEl.children;
    for (let i = 0; i < 9; i += 1) {
      const cell = cells[i];
      cell.textContent = board[i];
      cell.classList.toggle('x', board[i] === 'X');
      cell.classList.toggle('o', board[i] === 'O');
      cell.disabled = finished || board[i] !== '';
      cell.setAttribute('aria-label', board[i] === '' ? `Пустая клетка ${i + 1}` : `${board[i]}, клетка ${i + 1}`);
    }
  }

  function finish(result) {
    finished = true;
    if (result.mark === 'X') {
      wins += 1;
      winsEl.textContent = String(wins);
      statusEl.textContent = 'Победа! Три крестика в ряд. 🎉';
      beep(660, 100);
      setTimeout(() => beep(880, 150), 110);
    } else if (result.mark === 'O') {
      losses += 1;
      lossesEl.textContent = String(losses);
      statusEl.textContent = 'ИИ собрал три нолика. Реванш?';
      beep(220, 150);
    } else {
      draws += 1;
      drawsEl.textContent = String(draws);
      statusEl.textContent = 'Ничья. Крепкая партия!';
    }
    for (const index of result.line) {
      gridEl.children[index].classList.add('win');
    }
    render();
  }

  function playerMove(index) {
    if (finished || board[index]) return;
    board[index] = 'X';
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
      const pick = aiMove();
      if (pick < 0) return;
      board[pick] = 'O';
      beep(420, 60);
      const afterAi = winner(board);
      if (afterAi) {
        finish(afterAi);
        return;
      }
      statusEl.textContent = 'Ваш ход — вы играете крестиками.';
      render();
    }, AI_DELAY_MS);
  }

  function newGame() {
    round += 1;
    board = Array(9).fill('');
    finished = false;
    statusEl.textContent = 'Ваш ход — вы играете крестиками.';
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 9; i += 1) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.index = String(i);
      cell.setAttribute('aria-label', `Пустая клетка ${i + 1}`);
      const index = i;
      cell.addEventListener('click', () => playerMove(index));
      fragment.append(cell);
    }
    gridEl.replaceChildren(fragment);
    render();
  }

  restartBtn.addEventListener('click', newGame);

  newGame();
})();
