(() => {
  'use strict';

  const BOARD_SIZE = 300;
  const CELL = 15;
  const COLS = BOARD_SIZE / CELL;
  const STEP_MS = 120;
  const MAX_DELTA_MS = 100;

  const DIRECTIONS = {
    ArrowUp: { x: 0, y: -1 },
    ArrowDown: { x: 0, y: 1 },
    ArrowLeft: { x: -1, y: 0 },
    ArrowRight: { x: 1, y: 0 },
    KeyW: { x: 0, y: -1 },
    KeyS: { x: 0, y: 1 },
    KeyA: { x: -1, y: 0 },
    KeyD: { x: 1, y: 0 },
  };

  const canvas = document.getElementById('board');
  const context = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const statusEl = document.getElementById('status');

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = BOARD_SIZE * dpr;
  canvas.height = BOARD_SIZE * dpr;
  context.scale(dpr, dpr);

  let snake;
  let direction;
  let queuedDirection;
  let food;
  let score;
  let gameState;

  function placeFood() {
    do {
      food = {
        x: Math.floor(Math.random() * COLS),
        y: Math.floor(Math.random() * COLS),
      };
    } while (snake.some((part) => part.x === food.x && part.y === food.y));
  }

  function startGame() {
    snake = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 3, y: 5 },
    ];
    direction = { x: 1, y: 0 };
    queuedDirection = null;
    score = 0;
    gameState = 'running';
    scoreEl.textContent = '0';
    statusEl.textContent = '';
    placeFood();
  }

  function endGame() {
    gameState = 'over';
    statusEl.textContent = `Игра окончена. Счёт: ${score}. Нажмите любую клавишу, чтобы начать заново.`;
  }

  function step() {
    if (queuedDirection) {
      direction = queuedDirection;
      queuedDirection = null;
    }

    const head = {
      x: snake[0].x + direction.x,
      y: snake[0].y + direction.y,
    };

    const outside =
      head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= COLS;
    const hitSelf = snake.some((part) => part.x === head.x && part.y === head.y);
    if (outside || hitSelf) {
      endGame();
      return;
    }

    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 1;
      scoreEl.textContent = String(score);
      placeFood();
    } else {
      snake.pop();
    }
  }

  function queueTurn(next) {
    const base = queuedDirection ?? direction;
    if (next.x === -base.x && next.y === -base.y) return;
    if (next.x === base.x && next.y === base.y) return;
    queuedDirection = next;
  }

  function onKeyDown(event) {
    const turn = DIRECTIONS[event.code];
    if (turn) {
      event.preventDefault();
      if (gameState !== 'running') {
        startGame();
        queueTurn(turn);
        return;
      }
      queueTurn(turn);
      return;
    }
    if (gameState === 'over') {
      startGame();
    }
  }

  function draw() {
    context.fillStyle = '#111';
    context.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    context.fillStyle = '#ef4444';
    context.fillRect(food.x * CELL, food.y * CELL, CELL, CELL);

    context.fillStyle = '#22c55e';
    for (const part of snake) {
      context.fillRect(part.x * CELL, part.y * CELL, CELL - 1, CELL - 1);
    }
  }

  let lastTime = 0;
  let accumulator = 0;

  function frame(now) {
    if (!lastTime) lastTime = now;
    const delta = Math.min(now - lastTime, MAX_DELTA_MS);
    lastTime = now;

    if (gameState === 'running') {
      accumulator += delta;
      while (accumulator >= STEP_MS) {
        if (gameState !== 'running') break;
        step();
        accumulator -= STEP_MS;
      }
    } else {
      accumulator = 0;
    }

    draw();
    requestAnimationFrame(frame);
  }

  document.addEventListener('keydown', onKeyDown);
  startGame();
  requestAnimationFrame(frame);
})();
