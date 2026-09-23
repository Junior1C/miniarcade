import { test, expect } from '@playwright/test';

// Витрина статистики: пустое состояние без данных и рендер со стабом.
test('витрина без данных честна и без ошибок', async ({ page }) => {
  // Детерминированность: стаб пустых агрегатов вместо живых data/stats —
  // ночной Action коммитит туда реальные цифры, тест от них не зависит.
  await page.route('**/data/stats/daily.json', (route) =>
    route.fulfill({ contentType: 'application/json', body: '[]' }),
  );
  await page.route('**/data/stats/totals.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ generatedAt: null, totals: [] }),
    }),
  );
  const problems = [];
  page.on('pageerror', (error) => problems.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  await page.goto('/stats.html');
  await expect(page.locator('h1')).toContainText('Статистика');
  await expect(page.locator('#stats-empty')).toBeVisible();
  await expect(page.locator('a[href="index.html"]').first()).toBeVisible();
  expect(problems).toEqual([]);
});

test('витрина рисует карточки и бары по данным', async ({ page }) => {
  await page.route('**/data/stats/daily.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        { day: '2026-09-21', host: 'a.test', game: '', event: 'pv', n: 5, secs: 0 },
        { day: '2026-09-22', host: 'a.test', game: '', event: 'pv', n: 7, secs: 0 },
      ]),
    }),
  );
  await page.route('**/data/stats/totals.json', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        generatedAt: '2026-09-22T00:00:00.000Z',
        totals: [
          { host: 'a.test', game: '', event: 'pv', n: 12, secs: 0 },
          { host: 'a.test', game: 'snake', event: 'open', n: 4, secs: 0 },
          { host: 'a.test', game: 'snake', event: 'close', n: 3, secs: 150 },
        ],
      }),
    }),
  );
  await page.goto('/stats.html');
  await expect(page.locator('#stats-empty')).toBeHidden();
  await expect(page.locator('.stats-card__value').first()).toHaveText('12');
  await expect(page.locator('#stats-status')).toContainText('2026-09-22');
  await expect(page.locator('#stats-days .stats-bar')).toHaveCount(2);
  // Полоски рисуются через CSP-safe data-v (без inline style): максимум — 100.
  await expect(page.locator('#stats-days .stats-bar__fill[data-v="100"]')).toHaveCount(1);
  await expect(page.locator('#stats-games .stats-bar__label').first()).toHaveText('snake');
  await expect(page.locator('#stats-hosts .stats-bar__label').first()).toHaveText('a.test');
});
