import { test, expect } from '@playwright/test';

import { STATS_URL } from '../../assets/js/stats.js';

// Игровые механики P0/P1: управление, счётчики, juice. Плюс страховка:
// WebAudio-SFX и новые обработчики не должны ронять страницы игр.

test('статистика: pv/open/close уходят на приёмник (стаб, без сети)', async ({ page }) => {
  const hits = [];
  await page.route(STATS_URL, async (route) => {
    const body = route.request().postDataJSON();
    if (body) hits.push(body);
    await route.fulfill({ status: 204, body: '' });
  });
  await page.goto('/?stats=1');
  await expect
    .poll(() => hits.filter((hit) => hit.event === 'pv').length)
    .toBe(1);
  await page.fill('#search', 'пятнашки');
  await expect(page.locator('#games .card')).toHaveCount(1);
  await page.locator('#games .card').first().evaluate((el) => el.click());
  await expect(page.locator('#player')).toBeVisible();
  await expect
    .poll(() => hits.filter((hit) => hit.event === 'open' && hit.game === 'fifteen').length)
    .toBe(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('#player')).toBeHidden();
  await expect
    .poll(() => hits.filter((hit) => hit.event === 'close' && hit.game === 'fifteen').length)
    .toBe(1);
  const close = hits.find((hit) => hit.event === 'close');
  expect(close.v).toBe(1);
  expect(typeof close.host).toBe('string');
  expect(close.secs).toBeGreaterThanOrEqual(0);
});

test('каталог: все игры из catalog.json грузятся без ошибок', async ({ page }) => {
  const problems = [];
  page.on('pageerror', (error) => problems.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  await page.goto('/');
  const catalog = await page.evaluate(async () => {
    const response = await fetch('/data/catalog.json');
    return response.json();
  });
  expect(catalog.games.length).toBeGreaterThanOrEqual(10);
  // Мосты грузятся с чужих хостингов — их обходит отдельный стаб-тест ниже,
  // здесь только свои файлы (чужая доступность — не наша ответственность).
  for (const game of catalog.games.filter((entry) => entry.file)) {
    await page.goto(`/${game.file}`);
    await expect(page).toHaveTitle(/.+/);
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  }
  expect(problems).toEqual([]);
});

test('мост: внешняя игра открывается в том же sandbox-плеере', async ({ page }) => {
  await page.route('https://wayou.github.io/t-rex-runner/', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><title>stub</title></head><body>stub</body></html>',
    }),
  );
  await page.goto('/');
  await page.fill('#search', 'rex');
  const card = page.locator('a[href="#/play/ext-trex"]');
  await expect(card.locator('.card__ribbon')).toBeAttached();
  await expect(card.locator('.card__ribbon')).toBeEmpty();
  await expect(card.locator('.card__badge')).toHaveText('↗ GitHub');
  await expect(card.locator('.card__meta')).toContainText('wayou');
  await expect(card.locator('.card__meta')).toContainText('BSD-3-Clause');
  // Детерминированный клик: важен сам факт открытия плеера по hash,
  // живой клик мыши покрыт тестами каталога/a11y.
  await card.evaluate((el) => el.click());
  const dialog = page.locator('#player');
  await expect(dialog).toBeVisible();
  const frame = page.locator('#player-frame');
  await expect(frame).toHaveAttribute('src', 'https://wayou.github.io/t-rex-runner/');
  const sandbox = await frame.getAttribute('sandbox');
  expect(sandbox).toContain('allow-scripts');
  expect(sandbox).not.toContain('allow-same-origin');
  const source = page.locator('#player-source');
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute('href', 'https://github.com/wayou/t-rex-runner');
});

test('кликер: пробел даёт очки после старта, счёт — output', async ({ page }) => {
  await page.goto('/games/clicker/');
  await page.locator('#start').click();
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  const score = await page.locator('#score').textContent();
  expect(Number(score)).toBeGreaterThanOrEqual(2);
  expect(await page.locator('#score').evaluate((el) => el.tagName)).toBe('OUTPUT');
  const touchAction = await page
    .locator('#hit')
    .evaluate((el) => getComputedStyle(el).touchAction);
  expect(touchAction).toContain('manipulation');
});

test('мемори: ходы считаются, рестарт во время задержки не ломает поле', async ({ page }) => {
  await page.goto('/games/memory/');
  const cards = page.locator('#grid .card');
  await expect(cards).toHaveCount(16);
  await cards.nth(0).click();
  await cards.nth(1).click();
  await expect(page.locator('#status')).toContainText('Ходов: 1');

  // Форсируем несовпадение, затем мгновенный рестарт — протухший таймер
  // обязан молча отвалиться по токену партии.
  const different = await page.evaluate(() => {
    const all = [...document.querySelectorAll('#grid .card')];
    const first = all[0].dataset.emoji;
    return all.findIndex((card) => card.dataset.emoji !== first);
  });
  await page.locator('#restart').click();
  await cards.nth(0).click();
  await cards.nth(different).click();
  await page.locator('#restart').click();
  await page.waitForTimeout(800);
  await expect(page.locator('#status')).toContainText('Найдено пар: 0 из 8 • Ходов: 0');
  for (const card of await page.locator('#grid .card').all()) {
    await expect(card).toHaveText('❓');
  }
});

test('змейка: dpad и свайп управляют без ошибок', async ({ page }) => {
  await page.goto('/games/snake/');
  const pad = page.locator('.pad__btn');
  await expect(pad).toHaveCount(4);
  await expect(page.locator('.pad__btn--up')).toHaveAttribute('aria-label', 'Вверх');
  // Dpad жмёт вниз: игра идёт, статус пуст (не «Игра окончена», не «Пауза»).
  await page.locator('.pad__btn--down').click();
  await expect(page.locator('#status')).toBeEmpty();

  // Свайп влево по канвасу идёт через тот же press(), что dpad и клавиатура.
  await page.locator('#board').evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    const cy = rect.top + rect.height / 2;
    const x0 = rect.left + rect.width / 2;
    const touch = (x) => new Touch({ identifier: 7, target: canvas, clientX: x, clientY: cy });
    canvas.dispatchEvent(
      new TouchEvent('touchstart', {
        touches: [touch(x0)],
        changedTouches: [touch(x0)],
        bubbles: true,
        cancelable: true,
      }),
    );
    canvas.dispatchEvent(
      new TouchEvent('touchend', { changedTouches: [touch(x0 - 60)], bubbles: true, cancelable: true }),
    );
  });
  await expect(page.locator('#status')).toBeEmpty();
});

test('страницы игр грузятся и играют без ошибок консоли', async ({ page }) => {
  const problems = [];
  page.on('pageerror', (error) => problems.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });

  await page.goto('/games/clicker/');
  await page.locator('#start').click();
  await page.locator('#hit').click();
  await page.keyboard.press('Space');

  await page.goto('/games/memory/');
  await page.locator('#grid .card').first().click();

  await page.goto('/games/snake/');
  await page.keyboard.press('ArrowUp');
  await page.locator('.pad__btn--left').click();

  expect(problems).toEqual([]);
});

test('тетрис: старт запускает партию', async ({ page }) => {
  await page.goto('/games/tetris/');
  await expect(page.locator('#status')).toContainText('Старт');
  await page.locator('#start').click();
  await expect(page.locator('#status')).toBeEmpty();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');
});

test('2048: стрелки двигают плитки', async ({ page }) => {
  await page.goto('/games/2048/');
  await expect(page.locator('#grid .tile')).toHaveCount(16);
  const changed = await page.evaluate(() => {
    const snapshot = () => document.getElementById('grid').textContent;
    const keys = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'];
    const before = snapshot();
    for (let round = 0; round < 6; round += 1) {
      for (const code of keys) {
        document.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
        if (snapshot() !== before) return true;
      }
      // Тупиковая доска: конец партии тоже валидный исход хода.
      if (document.getElementById('status').textContent !== '') return true;
    }
    return snapshot() !== before;
  });
  expect(changed).toBe(true);
});

test('сапёр: первый клик безопасен и открывает поле', async ({ page }) => {
  await page.goto('/games/saper/');
  await expect(page.locator('#grid .cell')).toHaveCount(81);
  await page.locator('#grid .cell').first().click();
  await expect(page.locator('#status')).toBeEmpty();
  const opened = await page.locator('#grid .cell.open').count();
  expect(opened).toBeGreaterThan(0);
});

test('арканоид: старт готовит запуск мяча', async ({ page }) => {
  await page.goto('/games/breakout/');
  await page.locator('#start').click();
  await expect(page.locator('#status')).toContainText(/запуск/i);
});

test('флэппи: пробел поднимает птичку', async ({ page }) => {
  await page.goto('/games/flappy/');
  await page.keyboard.press('Space');
  await expect(page.locator('#status')).toBeEmpty();
});

test('крестики-нолики: ход ставится, ИИ отвечает', async ({ page }) => {
  await page.goto('/games/tictactoe/');
  await page.locator('#grid .cell').nth(4).click();
  await expect(page.locator('#grid .cell').nth(4)).toHaveText('X');
  await expect(page.locator('#grid .cell.o')).toHaveCount(1, { timeout: 3000 });
});

test('саймон: старт начинает первый уровень', async ({ page }) => {
  await page.goto('/games/simon/');
  await page.locator('#start').click();
  await expect(page.locator('#level')).toHaveText('1');
  await expect(page.locator('#status')).toContainText(/слушайте|ваш ход/i);
});

test('дино: пробел начинает забег', async ({ page }) => {
  await page.goto('/games/dino/');
  await page.keyboard.press('Space');
  await expect(page.locator('#status')).toBeEmpty();
});

test('пакман: стрелка начинает партию', async ({ page }) => {
  await page.goto('/games/pacman/');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#status')).toBeEmpty();
});

test('инвейдеры: старт запускает рой', async ({ page }) => {
  await page.goto('/games/invaders/');
  await page.locator('#start').click();
  await expect(page.locator('#status')).toBeEmpty();
});

test('астероиды: старт выводит корабль', async ({ page }) => {
  await page.goto('/games/asteroids/');
  await page.locator('#start').click();
  await expect(page.locator('#status')).toBeEmpty();
  await page.keyboard.press('Space');
});

test('понг: старт начинает матч', async ({ page }) => {
  await page.goto('/games/pong/');
  await page.locator('#start').click();
  await expect(page.locator('#status')).toBeEmpty();
  await expect(page.locator('#score')).toHaveText('0 : 0');
});

test('судоку: даны предзаполнены, цифра вводится', async ({ page }) => {
  await page.goto('/games/sudoku/');
  await expect(page.locator('#grid .cell')).toHaveCount(81);
  const givens = await page.locator('#grid .cell.given').count();
  expect(givens).toBeGreaterThan(20);
  // Первая не данная клетка + цифра 1 с пада.
  const target = page.locator('#grid .cell:not(.given)').first();
  await target.click();
  await page.locator('#pad .pad__btn').first().click();
  await expect(target).toHaveText('1');
});

test('4 в ряд: ход ставится, ИИ отвечает', async ({ page }) => {
  await page.goto('/games/connect4/');
  await page.locator('.cols__btn').nth(3).click();
  await expect(page.locator('#grid .cell.r')).toHaveCount(1);
  await expect(page.locator('#grid .cell.y')).toHaveCount(1, { timeout: 4000 });
});

test('виселица: 32 буквы, ход засчитывается', async ({ page }) => {
  await page.goto('/games/hangman/');
  await expect(page.locator('#letters .letter')).toHaveCount(32);
  const wordBefore = await page.locator('#word').textContent();
  await page.locator('#letters .letter').first().click();
  await expect
    .poll(async () => {
      const word = await page.locator('#word').textContent();
      const errors = await page.locator('#errors').textContent();
      return word !== wordBefore || errors !== '0';
    })
    .toBe(true);
});

test('пятнашки: сосед дырки двигается, ходы растут', async ({ page }) => {
  await page.goto('/games/fifteen/');
  const moved = await page.evaluate(() => {
    const cells = [...document.querySelectorAll('#grid .tile')];
    const hole = cells.findIndex((cell) => cell.classList.contains('hole'));
    const x = hole % 4;
    const y = Math.floor(hole / 4);
    const neighbour = cells[x > 0 ? hole - 1 : hole + 1] ?? cells[y > 0 ? hole - 4 : hole + 4];
    neighbour.click();
    return document.getElementById('moves').textContent;
  });
  expect(moved).toBe('1');
});

test('ударь крота: старт выпускает кротов, удар даёт очко', async ({ page }) => {
  await page.goto('/games/whack/');
  await page.locator('#start').click();
  await expect(page.locator('#field .hole.up').first()).toBeVisible({ timeout: 4000 });
  const scored = await page.evaluate(() => {
    const up = document.querySelector('#field .hole.up');
    if (up) up.click();
    return document.getElementById('score').textContent;
  });
  expect(scored).toBe('1');
});

async function setHidden(page, hidden) {
  await page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { value, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test('кликер: сворачивание ставит паузу и не съедает время', async ({ page }) => {
  await page.goto('/games/clicker/');
  await page.locator('#start').click();
  await setHidden(page, true);
  await expect(page.locator('#result')).toContainText('Пауза');
  const frozen = await page.locator('#time').textContent();
  await page.waitForTimeout(700);
  expect(await page.locator('#time').textContent()).toBe(frozen);
  await setHidden(page, false);
  await expect(page.locator('#result')).toBeEmpty();
  // Цикл ожил: счётчик снова тикает вниз.
  await expect
    .poll(async () => page.locator('#time').textContent(), { timeout: 4000 })
    .not.toBe(frozen);
});

test('ударь крота: сворачивание ставит паузу и держит кротов', async ({ page }) => {
  await page.goto('/games/whack/');
  await page.locator('#start').click();
  await expect(page.locator('#field .hole.up').first()).toBeVisible({ timeout: 4000 });
  await setHidden(page, true);
  await expect(page.locator('#status')).toContainText('Пауза');
  const frozen = await page.locator('#time').textContent();
  await page.waitForTimeout(700);
  expect(await page.locator('#time').textContent()).toBe(frozen);
  await setHidden(page, false);
  await expect(page.locator('#status')).toBeEmpty();
  await expect
    .poll(async () => page.locator('#time').textContent(), { timeout: 4000 })
    .not.toBe(frozen);
});
