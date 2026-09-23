import { test, expect } from '@playwright/test';

// Игровые механики P0/P1: управление, счётчики, juice. Плюс страховка:
// WebAudio-SFX и новые обработчики не должны ронять страницы игр.

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
