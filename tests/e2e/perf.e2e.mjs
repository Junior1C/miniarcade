import { test, expect } from '@playwright/test';

// Perf-дым: каталог обязан оставаться мгновенным без сборки и CDN.
// Пороги щедрые для CI (медленные раннеры), их задача — ловить регрессии,
// а не мериться миллисекундами. Жёсткие байтовые бюджеты — в scripts/check-budgets.mjs.
test('каталог грузится быстро и без ошибок консоли', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  const started = Date.now();
  await page.goto('/');
  await expect(page.locator('#games .card').first()).toBeVisible();
  const loadMs = Date.now() - started;

  expect(loadMs).toBeLessThan(8000);
  expect(errors).toEqual([]);

  const catalogTiming = await page.evaluate(async () => {
    const t0 = performance.now();
    const response = await fetch('data/catalog.json', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`catalog fetch failed: ${response.status}`);
    const payload = await response.json();
    return { ms: performance.now() - t0, bytes: JSON.stringify(payload).length, games: payload.games.length };
  });
  expect(catalogTiming.ms).toBeLessThan(2000);
  // Дублирует байтовый бюджет из check-budgets.mjs на уровне браузера.
  expect(catalogTiming.bytes).toBeLessThan(250 * 1024);
  expect(catalogTiming.games).toBeGreaterThan(0);
});

test('поиск остаётся отзывчивым (debounce 120мс)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#games .card').first()).toBeVisible();
  await page.fill('#search', 'пятнашки');
  await expect(page.locator('#games .card')).toHaveCount(1);
});
